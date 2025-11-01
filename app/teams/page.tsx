'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuthState } from 'react-firebase-hooks/auth';
import {
  Check,
  Loader2,
  MailPlus,
  ShieldCheck,
  Trash2,
  Trophy,
  Upload,
  Users,
  XCircle,
} from 'lucide-react';

import NavBar from '@/components/NavBar';
import LoginButton from '@/components/auth/LoginButton';
import { useProAccess } from '@/hooks/useProAccess';
import {
  TEAM_LOGO_ALLOWED_TYPES,
  TEAM_LOGO_MAX_FILE_SIZE_BYTES,
  acceptTeamInvite,
  cancelTeamInvite,
  createTeam,
  deleteTeam,
  fetchTopTeams,
  inviteUserToTeam,
  subscribeToTeam,
  subscribeToTeamInvites,
  subscribeToTeamInvitesForUser,
  subscribeToTeamsForUser,
  updateTeamLogo,
  type Team,
  type TeamInvite,
} from '@/lib/firestore';
import { auth, db } from '@/lib/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';

const TEAM_HEADER_CLASS =
  'flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/60';

type ProfileSummary = {
  displayName: string;
  username: string | null;
};

function formatMemberLabel(summary: ProfileSummary | undefined, fallback: string) {
  if (!summary) return fallback;
  const displayName = summary.displayName || fallback;
  const username = summary.username;
  return username ? `${displayName} (@${username})` : displayName;
}

function formatFileError(file: File): string | null {
  if (!TEAM_LOGO_ALLOWED_TYPES.has(file.type)) {
    return 'Please choose a PNG, JPG, GIF, or WebP image.';
  }
  if (file.size > TEAM_LOGO_MAX_FILE_SIZE_BYTES) {
    return 'Logos must be 5MB or smaller.';
  }
  return null;
}

type LogoStatus = {
  loading: boolean;
  error: string | null;
};

type InviteFormState = {
  value: string;
  submitting: boolean;
  error: string | null;
};

export default function TeamsPage() {
  const [user] = useAuthState(auth);
  const { isPro, loading: proLoading } = useProAccess();
  const [teamName, setTeamName] = useState('');
  const [teamLogo, setTeamLogo] = useState<File | null>(null);
  const [teamLogoPreview, setTeamLogoPreview] = useState<string | null>(null);
  const [teamLogoError, setTeamLogoError] = useState<string | null>(null);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamInvites, setTeamInvites] = useState<Record<string, TeamInvite[]>>({});
  const [incomingInvites, setIncomingInvites] = useState<TeamInvite[]>([]);
  const [inviteTeams, setInviteTeams] = useState<Record<string, Team | null>>({});
  const [profileCache, setProfileCache] = useState<Record<string, ProfileSummary>>({});
  const [logoStatus, setLogoStatus] = useState<Record<string, LogoStatus>>({});
  const [deleteStatus, setDeleteStatus] = useState<Record<string, { loading: boolean; error: string | null }>>({});
  const [inviteForms, setInviteForms] = useState<Record<string, InviteFormState>>({});
  const [respondingInvite, setRespondingInvite] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [leaderboardTeams, setLeaderboardTeams] = useState<Team[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setTeams([]);
      return;
    }

    const unsubscribe = subscribeToTeamsForUser(user.uid, (next) => {
      setTeams(next);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setIncomingInvites([]);
      return;
    }

    const unsubscribe = subscribeToTeamInvitesForUser(user.uid, (next) => {
      setIncomingInvites(next);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    setTeamInvites((prev) => {
      const next: Record<string, TeamInvite[]> = {};
      for (const team of teams) {
        if (prev[team.id]) {
          next[team.id] = prev[team.id];
        }
      }
      return next;
    });

    if (teams.length === 0) {
      return () => {};
    }

    const unsubscribe = teams.map((team) =>
      subscribeToTeamInvites(team.id, (invites) => {
        setTeamInvites((prev) => ({
          ...prev,
          [team.id]: invites,
        }));
      }),
    );

    return () => {
      unsubscribe.forEach((fn) => fn());
    };
  }, [teams]);

  useEffect(() => {
    setInviteTeams((prev) => {
      const next: Record<string, Team | null> = {};
      for (const invite of incomingInvites) {
        if (prev[invite.teamId] !== undefined) {
          next[invite.teamId] = prev[invite.teamId];
        }
      }
      return next;
    });

    if (incomingInvites.length === 0) {
      return () => {};
    }

    const subscriptions = new Map<string, () => void>();
    for (const invite of incomingInvites) {
      if (subscriptions.has(invite.teamId)) continue;
      const unsubscribe = subscribeToTeam(invite.teamId, (team) => {
        setInviteTeams((prev) => ({
          ...prev,
          [invite.teamId]: team,
        }));
      });
      subscriptions.set(invite.teamId, unsubscribe);
    }

    return () => {
      subscriptions.forEach((fn) => fn());
    };
  }, [incomingInvites]);

  useEffect(() => {
    let active = true;
    setLeaderboardLoading(true);

    fetchTopTeams(6)
      .then((items) => {
        if (!active) return;
        setLeaderboardTeams(items);
        setLeaderboardError(null);
      })
      .catch((error: any) => {
        if (!active) return;
        setLeaderboardTeams([]);
        setLeaderboardError(error?.message ?? 'Unable to load top teams.');
      })
      .finally(() => {
        if (active) {
          setLeaderboardLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const activeTeamIds = useMemo(() => new Set(teams.map((team) => team.id)), [teams]);
  const hasTeam = teams.length > 0;
  const primaryTeam = hasTeam ? teams[0] : null;

  const trackedUserIds = useMemo(() => {
    const ids = new Set<string>();
    teams.forEach((team) => {
      team.memberUids.forEach((uid) => ids.add(uid));
      team.pendingInviteUids.forEach((uid) => ids.add(uid));
    });
    Object.values(teamInvites).forEach((invites) => {
      invites.forEach((invite) => {
        ids.add(invite.inviteeUid);
        ids.add(invite.inviterUid);
      });
    });
    incomingInvites.forEach((invite) => {
      ids.add(invite.inviteeUid);
      ids.add(invite.inviterUid);
    });
    return Array.from(ids);
  }, [incomingInvites, teamInvites, teams]);

  useEffect(() => {
    const missing = trackedUserIds.filter((uid) => uid && !profileCache[uid]);
    if (missing.length === 0) {
      return;
    }

    let cancelled = false;

    (async () => {
      const updates: Record<string, ProfileSummary> = {};
      for (const uid of missing) {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          if (!snap.exists()) continue;
          const data = snap.data() as Record<string, any>;
          updates[uid] = {
            displayName: typeof data.displayName === 'string' ? data.displayName : 'Angler',
            username: typeof data.username === 'string' && data.username ? data.username : null,
          };
        } catch (error) {
          console.error('Failed to load user profile', error);
        }
      }

      if (!cancelled && Object.keys(updates).length > 0) {
        setProfileCache((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profileCache, trackedUserIds]);

  useEffect(() => {
    return () => {
      if (teamLogoPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(teamLogoPreview);
      }
    };
  }, [teamLogoPreview]);

  const handleLogoSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setTeamLogo(null);
      setTeamLogoPreview(null);
      setTeamLogoError(null);
      event.target.value = '';
      return;
    }

    const error = formatFileError(file);
    if (error) {
      setTeamLogo(null);
      setTeamLogoPreview(null);
      setTeamLogoError(error);
      event.target.value = '';
      return;
    }

    setTeamLogoError(null);
    setTeamLogo(file);
    const previewUrl = URL.createObjectURL(file);
    setTeamLogoPreview(previewUrl);
  };

  const handleDeleteTeam = async (team: Team) => {
    if (!user?.uid) {
      setDeleteStatus((prev) => ({
        ...prev,
        [team.id]: { loading: false, error: 'Sign in to delete the team.' },
      }));
      return;
    }

    const confirmed = window.confirm(
      `Delete ${team.name}? This will remove the team for every member and clear its chat history.`,
    );

    if (!confirmed) {
      return;
    }

    setDeleteStatus((prev) => ({
      ...prev,
      [team.id]: { loading: true, error: null },
    }));

    try {
      await deleteTeam(team.id, user.uid);
      setDeleteStatus((prev) => {
        const next = { ...prev };
        delete next[team.id];
        return next;
      });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Failed to delete the team. Please try again.';
      setDeleteStatus((prev) => ({
        ...prev,
        [team.id]: { loading: false, error: message },
      }));
    }
  };

  const handleCreateTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);

    if (!user?.uid) {
      setCreateError('Sign in to create a team.');
      return;
    }

    if (!isPro) {
      setCreateError('Teams are available for Pro members only.');
      return;
    }

    try {
      setCreatingTeam(true);
      await createTeam({ ownerUid: user.uid, name: teamName, logoFile: teamLogo });
      setTeamName('');
      setTeamLogo(null);
      if (teamLogoPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(teamLogoPreview);
      }
      setTeamLogoPreview(null);
      setTeamLogoError(null);
    } catch (error: any) {
      console.error('Failed to create team', error);
      setCreateError(error?.message ?? 'We could not create the team. Please try again.');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleLogoUpdate = async (teamId: string, file: File) => {
    if (!user?.uid) return;

    const error = formatFileError(file);
    if (error) {
      setLogoStatus((prev) => ({
        ...prev,
        [teamId]: { loading: false, error },
      }));
      return;
    }

    setLogoStatus((prev) => ({
      ...prev,
      [teamId]: { loading: true, error: null },
    }));

    try {
      await updateTeamLogo(teamId, user.uid, file);
      setLogoStatus((prev) => ({
        ...prev,
        [teamId]: { loading: false, error: null },
      }));
    } catch (error: any) {
      console.error('Failed to upload team logo', error);
      setLogoStatus((prev) => ({
        ...prev,
        [teamId]: {
          loading: false,
          error: error?.message ?? 'Unable to update the team logo.',
        },
      }));
    }
  };

  const handleInviteSubmit = async (team: Team, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const state = inviteForms[team.id] ?? { value: '', submitting: false, error: null };
    const value = state.value.trim();

    if (!user?.uid) {
      setInviteForms((prev) => ({
        ...prev,
        [team.id]: { ...state, error: 'Sign in to send invites.' },
      }));
      return;
    }

    if (team.ownerUid !== user.uid) {
      setInviteForms((prev) => ({
        ...prev,
        [team.id]: { ...state, error: 'Only the captain can send team invites.' },
      }));
      return;
    }

    if (!value) {
      setInviteForms((prev) => ({
        ...prev,
        [team.id]: { ...state, error: 'Enter a username to invite.' },
      }));
      return;
    }

    setInviteForms((prev) => ({
      ...prev,
      [team.id]: { value, submitting: true, error: null },
    }));

    try {
      await inviteUserToTeam({ teamId: team.id, inviterUid: user.uid, inviteeUsername: value });
      setInviteForms((prev) => ({
        ...prev,
        [team.id]: { value: '', submitting: false, error: null },
      }));
    } catch (error: any) {
      console.error('Failed to send invite', error);
      setInviteForms((prev) => ({
        ...prev,
        [team.id]: {
          value,
          submitting: false,
          error: error?.message ?? 'Unable to send that invite right now.',
        },
      }));
    }
  };

  const handleInviteInputChange = (teamId: string, event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setInviteForms((prev) => ({
      ...prev,
      [teamId]: { value, submitting: false, error: null },
    }));
  };

  const handleCancelInvite = async (invite: TeamInvite) => {
    if (!user?.uid) return;
    setRespondError(null);
    setRespondingInvite(invite.id);
    try {
      await cancelTeamInvite({ teamId: invite.teamId, inviteeUid: invite.inviteeUid, actorUid: user.uid });
    } catch (error: any) {
      console.error('Failed to cancel invite', error);
      setRespondError(error?.message ?? 'Unable to cancel that invite.');
    } finally {
      setRespondingInvite(null);
    }
  };

  const handleAcceptInvite = async (invite: TeamInvite) => {
    if (!user?.uid) return;
    setRespondError(null);
    setRespondingInvite(invite.id);
    try {
      await acceptTeamInvite({ teamId: invite.teamId, inviteeUid: user.uid });
    } catch (error: any) {
      console.error('Failed to accept invite', error);
      setRespondError(error?.message ?? 'Unable to accept that invite.');
    } finally {
      setRespondingInvite(null);
    }
  };

  const handleDeclineInvite = async (invite: TeamInvite) => {
    if (!user?.uid) return;
    setRespondError(null);
    setRespondingInvite(invite.id);
    try {
      await cancelTeamInvite({ teamId: invite.teamId, inviteeUid: invite.inviteeUid, actorUid: user.uid });
    } catch (error: any) {
      console.error('Failed to decline invite', error);
      setRespondError(error?.message ?? 'Unable to decline that invite.');
    } finally {
      setRespondingInvite(null);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <NavBar />
      <section className="container pt-nav pb-16">
        <header className="mb-10 flex flex-col gap-2">
          <div className={TEAM_HEADER_CLASS}>
            <Users className="h-4 w-4" />
            <span>Teams</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Build your Hook&apos;d crew</h1>
          <p className="max-w-2xl text-white/70">
            Organize your fellow anglers, coordinate trips, and keep the conversation flowing with dedicated team chats and invites.
          </p>
        </header>

        <section className="mb-12">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/60">
            <Trophy className="h-4 w-4" />
            <span>Teams leaderboard</span>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            {leaderboardLoading ? (
              <div className="flex items-center gap-3 text-white/70">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading top crews…</span>
              </div>
            ) : leaderboardError ? (
              <p className="text-sm text-rose-300">{leaderboardError}</p>
            ) : leaderboardTeams.length === 0 ? (
              <p className="text-sm text-white/70">
                Teams will appear here once anglers start forming their crews.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {leaderboardTeams.map((team, index) => {
                  const count = team.memberCount ?? team.memberUids.length;
                  const label = count === 1 ? 'angler' : 'anglers';
                  return (
                    <article
                      key={team.id}
                      className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-4 transition hover:border-brand-300/40 hover:bg-slate-900/70"
                    >
                      <div className="flex items-center justify-between text-xs text-white/50">
                        <span>#{index + 1}</span>
                        <span>
                          {count} {label}
                        </span>
                      </div>
                      <Link
                        href={`/teams/${team.id}`}
                        className="text-lg font-semibold text-white transition hover:text-brand-200"
                      >
                        {team.name}
                      </Link>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {!user ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/80">
            <p className="mb-4 text-sm">Sign in to start a team and invite friends.</p>
            <LoginButton className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
              <ShieldCheck className="h-4 w-4" />
              Log in
            </LoginButton>
          </div>
        ) : proLoading ? (
          <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking your team access…</span>
          </div>
        ) : (
          <div className="space-y-12">
            {!isPro ? (
              <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6 text-amber-100">
                <h2 className="mb-2 text-lg font-semibold">Captains need Hook&apos;d Pro</h2>
                <p className="text-sm text-amber-100/80">
                  Upgrade to create private crews and unlock captain-only tools. You can still accept invitations from other
                  teams.
                </p>
              </div>
            ) : null}

            {!hasTeam ? (
              isPro ? (
                <section className="glass rounded-3xl border border-white/10 bg-white/5 p-6">
                  <header className="mb-6 flex items-center gap-2 text-sm font-semibold">
                    <MailPlus className="h-5 w-5" />
                    <span>Create a team</span>
                  </header>
                  <form className="space-y-4" onSubmit={handleCreateTeam}>
                    <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,220px)] md:items-end">
                      <div className="space-y-2">
                        <label htmlFor="team-name" className="text-xs uppercase tracking-[0.2em] text-white/50">
                          Team name
                        </label>
                        <input
                          id="team-name"
                          type="text"
                          value={teamName}
                          onChange={(event) => setTeamName(event.target.value)}
                          placeholder="ex. Tide Riders"
                          required
                          minLength={3}
                          className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300/40"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="team-logo" className="text-xs uppercase tracking-[0.2em] text-white/50">
                          Logo (optional)
                        </label>
                        <input
                          id="team-logo"
                          type="file"
                          accept={Array.from(TEAM_LOGO_ALLOWED_TYPES).join(',')}
                          onChange={handleLogoSelection}
                          className="w-full text-sm text-white"
                        />
                        {teamLogoPreview ? (
                          <div className="relative h-24 w-24 overflow-hidden rounded-xl border border-white/10 bg-slate-900/60">
                            <Image src={teamLogoPreview} alt="Team logo preview" fill className="object-cover" />
                          </div>
                        ) : null}
                        {teamLogoError ? (
                          <p className="text-xs text-rose-300">{teamLogoError}</p>
                        ) : (
                          <p className="text-xs text-white/40">PNG, JPG, GIF, or WebP up to 5MB.</p>
                        )}
                      </div>
                    </div>
                    {createError ? <p className="text-sm text-rose-300">{createError}</p> : null}
                    <button
                      type="submit"
                      className="btn-primary inline-flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-60"
                      disabled={creatingTeam}
                    >
                      {creatingTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusIcon />}
                      <span>Create team</span>
                    </button>
                  </form>
                </section>
              ) : (
                <section className="glass rounded-3xl border border-white/10 bg-white/5 p-6">
                  <header className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <MailPlus className="h-5 w-5" />
                    <span>Create a team</span>
                  </header>
                  <p className="text-sm text-white/70">
                    Only Pro captains can start new crews. Ask an existing captain for an invite or upgrade to Hook&apos;d Pro to
                    launch your own team.
                  </p>
                </section>
              )
            ) : null}

            <section className="space-y-6">
              <header className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-5 w-5" />
                <span>Your teams</span>
              </header>
              {teams.length === 0 ? (
                <p className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
                  You haven&apos;t created or joined any teams yet.
                </p>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  {teams.map((team) => {
                    const inviteState = inviteForms[team.id] ?? { value: '', submitting: false, error: null };
                    const pending = teamInvites[team.id] ?? [];
                    const logo = logoStatus[team.id] ?? { loading: false, error: null };
                    const deletion = deleteStatus[team.id] ?? { loading: false, error: null };
                    const isCaptain = team.ownerUid === user?.uid;
                    return (
                      <article key={team.id} className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6">
                        <div className="flex items-center gap-4">
                          <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
                            <Image
                              src={team.logoURL || '/logo.svg'}
                              alt={`${team.name} logo`}
                              fill
                              className="object-cover"
                            />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-white">
                              <Link href={`/teams/${team.id}`} className="transition hover:text-brand-200">
                                {team.name}
                              </Link>
                            </h3>
                            <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                              {team.memberCount ?? team.memberUids.length} members
                            </p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-white/80">Members</h4>
                          <ul className="space-y-2 text-sm text-white/70">
                            {team.memberUids.map((uid) => {
                              const summary = profileCache[uid];
                              const isOwner = team.ownerUid === uid;
                              const isSelf = user?.uid === uid;
                              return (
                                <li key={uid} className="flex items-center gap-2">
                                  <span>{formatMemberLabel(summary, 'Angler')}</span>
                                  {isOwner ? (
                                    <span className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-white/60">
                                      Captain
                                    </span>
                                  ) : null}
                                  {isSelf ? (
                                    <span className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-white/60">
                                      You
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-white/80">Pending invites</h4>
                          {pending.length === 0 ? (
                            <p className="text-sm text-white/50">No pending invites.</p>
                          ) : (
                            <ul className="space-y-2 text-sm text-white/70">
                              {pending.map((invite) => {
                                const summary = profileCache[invite.inviteeUid];
                                const canCancel =
                                  isCaptain || invite.inviterUid === user?.uid || invite.inviteeUid === user?.uid;
                                return (
                                  <li key={invite.id} className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="font-medium text-white">
                                        {invite.inviteeUsername || formatMemberLabel(summary, 'Angler')}
                                      </p>
                                      <p className="text-xs text-white/50">
                                        Invited by {formatMemberLabel(profileCache[invite.inviterUid], 'Angler')}
                                      </p>
                                    </div>
                                    {canCancel ? (
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
                                        onClick={() => handleCancelInvite(invite)}
                                        disabled={respondingInvite === invite.id}
                                      >
                                        {respondingInvite === invite.id ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <XCircle className="h-3.5 w-3.5" />
                                        )}
                                        <span>{invite.inviteeUid === user?.uid ? 'Decline' : 'Cancel'}</span>
                                      </button>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          {!isCaptain && pending.length > 0 ? (
                            <p className="text-xs text-white/40">Only your captain can manage pending invites.</p>
                          ) : null}
                        </div>

                        {isCaptain ? (
                          <form className="space-y-3" onSubmit={(event) => handleInviteSubmit(team, event)}>
                            <h4 className="text-sm font-semibold text-white/80">Invite a teammate</h4>
                            <input
                              type="text"
                              placeholder="angler_username"
                              value={inviteState.value}
                              onChange={(event) => handleInviteInputChange(team.id, event)}
                              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300/40"
                            />
                            {inviteState.error ? (
                              <p className="text-xs text-rose-300">{inviteState.error}</p>
                            ) : (
                              <p className="text-xs text-white/40">Enter their Hook&apos;d username to send an invite.</p>
                            )}
                            <button
                              type="submit"
                              className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60"
                              disabled={inviteState.submitting}
                            >
                              {inviteState.submitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MailPlus className="h-4 w-4" />
                              )}
                              <span>Send invite</span>
                            </button>
                          </form>
                        ) : (
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/60">
                            Only your captain can send team invites. Ask them to add new anglers when you&apos;re ready to grow the crew.
                          </div>
                        )}

                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-white/80">Team chat</h4>
                          <Link
                            href={`/teams/${team.id}/chat`}
                            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-brand-300 hover:text-brand-200"
                          >
                            <MessageIcon />
                            <span>Open team channel</span>
                          </Link>
                        </div>

                        {isCaptain ? (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-white/80">Update logo</h4>
                              <label className="inline-flex items-center gap-2 text-sm text-white/70">
                                <input
                                  type="file"
                                  accept={Array.from(TEAM_LOGO_ALLOWED_TYPES).join(',')}
                                  className="hidden"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) {
                                      handleLogoUpdate(team.id, file);
                                    }
                                    event.target.value = '';
                                  }}
                                />
                                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-brand-300 hover:text-brand-200">
                                  {logo.loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Upload className="h-4 w-4" />
                                  )}
                                  <span>Upload new logo</span>
                                </span>
                              </label>
                              {logo.error ? <p className="text-xs text-rose-300">{logo.error}</p> : null}
                            </div>

                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-white/80">Delete team</h4>
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-full border border-rose-400/30 px-4 py-2 text-sm text-rose-200 transition hover:border-rose-300 hover:bg-rose-500/10"
                                onClick={() => handleDeleteTeam(team)}
                                disabled={deletion.loading}
                              >
                                {deletion.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                <span>Delete team</span>
                              </button>
                              {deletion.error ? (
                                <p className="text-xs text-rose-300">{deletion.error}</p>
                              ) : (
                                <p className="text-xs text-white/40">This action removes the team for all members.</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/60">
                            Captains control the team logo and branding. Reach out to {formatMemberLabel(profileCache[team.ownerUid], 'your captain')} when you have an update.
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="space-y-6">
              <header className="flex items-center gap-2 text-sm font-semibold">
                <MailPlus className="h-5 w-5" />
                <span>Invitations for you</span>
              </header>
              {incomingInvites.length === 0 ? (
                <p className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
                  You don&apos;t have any pending invitations right now.
                </p>
              ) : (
                <div className="space-y-4">
                  {hasTeam ? (
                    <p className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                      You&apos;re already part of {primaryTeam?.name ?? 'a team'}. Leave your current crew before accepting a new
                      invitation.
                    </p>
                  ) : null}
                  <ul className="space-y-4">
                  {incomingInvites.map((invite) => {
                    const team = inviteTeams[invite.teamId];
                    const inviter = profileCache[invite.inviterUid];
                    const disabled = respondingInvite === invite.id;
                    const alreadyOnDifferentTeam = activeTeamIds.size > 0 && !activeTeamIds.has(invite.teamId);
                    const disableAccept = disabled || alreadyOnDifferentTeam;
                    const showSpinner = disabled;
                    return (
                      <li key={invite.id} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-lg font-semibold text-white">
                              {team ? team.name : 'Team invite'}
                            </p>
                            <p className="text-sm text-white/60">
                              Invited by {formatMemberLabel(inviter, 'Angler')}
                              {invite.inviteeUsername ? ` • @${invite.inviteeUsername}` : ''}
                            </p>
                            {alreadyOnDifferentTeam ? (
                              <p className="mt-2 text-xs text-amber-200">
                                Leave your current team before joining a new crew.
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60"
                              onClick={() => handleAcceptInvite(invite)}
                              disabled={disableAccept}
                            >
                              {showSpinner ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              <span>Accept</span>
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
                              onClick={() => handleDeclineInvite(invite)}
                              disabled={disabled}
                            >
                              {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                              <span>Decline</span>
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  </ul>
                </div>
              )}
              {respondError ? <p className="text-sm text-rose-300">{respondError}</p> : null}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" strokeWidth={1.5}>
      <path d="M21 11.5a8.38 8.38 0 0 1-1.1 4.1 8.5 8.5 0 0 1-7.4 4.4 8.38 8.38 0 0 1-4.1-1.1L3 21l2.1-5.4A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 4.4-7.4 8.38 8.38 0 0 1 4.1-1.1h.5a8.5 8.5 0 0 1 8 8v.5z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" strokeWidth={1.5}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
