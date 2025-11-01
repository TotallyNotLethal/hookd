'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { CalendarDays, Fish, Loader2, MapPin, MessageCircle, UserMinus, Users } from 'lucide-react';

import NavBar from '@/components/NavBar';
import { auth, db } from '@/lib/firebaseClient';
import { kickTeamMember, subscribeToTeam, type Team } from '@/lib/firestore';
import { doc, getDoc } from 'firebase/firestore';

type ProfileSummary = {
  uid: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
};

function formatMemberDisplay(summary: ProfileSummary | undefined, fallback: string) {
  if (!summary) return fallback;
  if (summary.username) {
    return `${summary.displayName} (@${summary.username})`;
  }
  return summary.displayName || fallback;
}

export default function TeamOverviewPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params?.teamId;
  const [authUser] = useAuthState(auth);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, ProfileSummary>>({});
  const [memberActions, setMemberActions] = useState<Record<string, { loading: boolean; error: string | null }>>({});

  useEffect(() => {
    if (!teamId) {
      startTransition(() => {
        setTeam(null);
        setProfiles({});
        setLoading(false);
      });
      return;
    }

    startTransition(() => {
      setTeam(null);
      setProfiles({});
      setLoading(true);
    });

    const unsubscribe = subscribeToTeam(teamId, (next) => {
      startTransition(() => {
        setTeam(next);
        setLoading(false);
      });
    });

    return () => unsubscribe();
  }, [teamId]);

  useEffect(() => {
    if (!team) return;
    const memberIds = Array.isArray(team.memberUids) ? team.memberUids : [];
    const missing = memberIds.filter((uid) => uid && !profiles[uid]);
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const updates: Record<string, ProfileSummary> = {};
      for (const uid of missing) {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          if (!snap.exists()) continue;
          const data = snap.data() as Record<string, any>;
          updates[uid] = {
            uid,
            displayName: typeof data.displayName === 'string' && data.displayName ? data.displayName : 'Angler',
            username: typeof data.username === 'string' && data.username ? data.username : null,
            photoURL: typeof data.photoURL === 'string' && data.photoURL ? data.photoURL : null,
          };
        } catch (error) {
          console.error('Failed to load team member profile', error);
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setProfiles((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profiles, team]);

  const isCaptain = useMemo(() => team && authUser?.uid ? team.ownerUid === authUser.uid : false, [team, authUser?.uid]);

  const handleKickMember = async (memberUid: string) => {
    if (!team || !authUser?.uid) return;
    if (memberUid === team.ownerUid) return;

    setMemberActions((prev) => ({ ...prev, [memberUid]: { loading: true, error: null } }));
    try {
      await kickTeamMember({ teamId: team.id, actorUid: authUser.uid, targetUid: memberUid });
      setMemberActions((prev) => {
        const next = { ...prev };
        delete next[memberUid];
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove that member.';
      setMemberActions((prev) => ({
        ...prev,
        [memberUid]: { loading: false, error: message },
      }));
    }
  };
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <NavBar />
      <section className="container pt-nav pb-16">
        {loading ? (
          <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading team…</span>
          </div>
        ) : !team ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
            <p className="text-lg font-semibold text-white">Team not found</p>
            <p className="mt-2 text-sm text-white/60">
              We couldn&apos;t find that crew. Double-check the link or head back to the teams dashboard.
            </p>
            <Link
              href="/teams"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-brand-300 hover:text-brand-200"
            >
              <Users className="h-4 w-4" />
              <span>Back to teams</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-12">
            <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 md:flex-row md:items-center">
              <div className="relative h-24 w-24 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60">
                <Image
                  src={team.logoURL || '/logo.svg'}
                  alt={`${team.name} logo`}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="flex-1">
                <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/50">
                  <Users className="h-3.5 w-3.5" />
                  <span>Team overview</span>
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{team.name}</h1>
                <p className="mt-2 text-sm text-white/60">
                  {(team.memberCount ?? team.memberUids.length)} anglers • Captained by {formatMemberDisplay(profiles[team.ownerUid], 'your captain')}
                </p>
                {isCaptain ? (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand-300/40 bg-brand-500/10 px-4 py-2 text-xs text-brand-100">
                    <SparkleDivider />
                    <span>You&apos;re the captain. Manage invites and branding from the teams dashboard.</span>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-3 md:w-64">
                <Link
                  href={`/teams/${team.id}/chat`}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-brand-300 hover:text-brand-200"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>Open team chat</span>
                </Link>
                <Link
                  href="/teams"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  <Users className="h-4 w-4" />
                  <span>Team dashboard</span>
                </Link>
              </div>
            </header>

            <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
                  <header className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="h-5 w-5" />
                    <span>Crew roster</span>
                  </header>
                  <ul className="mt-4 space-y-3">
                    {team.memberUids.map((uid) => {
                      const profile = profiles[uid];
                      const isSelf = authUser?.uid === uid;
                      const isOwner = team.ownerUid === uid;
                      const canRemove = isCaptain && !isOwner && !isSelf;
                      const actionState = memberActions[uid];
                      return (
                        <li
                          key={uid}
                          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 md:flex-row md:items-center md:justify-between"
                        >
                          <div className="flex items-center gap-3">
                            {profile?.photoURL ? (
                              <Image
                                src={profile.photoURL}
                                alt={profile.displayName}
                                width={40}
                                height={40}
                                className="h-10 w-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-900/60 text-sm text-white/60">
                                🎣
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-white">{formatMemberDisplay(profile, 'Angler')}</p>
                              <p className="text-xs text-white/50">
                                {isOwner ? 'Captain' : 'Crewmate'}
                                {isSelf ? ' • You' : ''}
                              </p>
                            </div>
                          </div>
                          {canRemove ? (
                            <div className="flex flex-col items-start gap-2 md:items-end">
                              <button
                                type="button"
                                onClick={() => handleKickMember(uid)}
                                disabled={actionState?.loading}
                                className="inline-flex items-center gap-2 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-100 transition hover:border-red-300 hover:text-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {actionState?.loading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <UserMinus className="h-3.5 w-3.5" />
                                )}
                                <span>Remove</span>
                              </button>
                              {actionState?.error ? (
                                <p className="text-xs text-amber-300/80">{actionState.error}</p>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </article>

                <aside className="space-y-6">
                  <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
                    <header className="flex items-center gap-2 text-sm font-semibold">
                      <CalendarDays className="h-5 w-5" />
                      <span>Team tools</span>
                    </header>
                    <ul className="mt-4 space-y-3 text-sm text-white/70">
                      <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                        <MessageCircle className="mt-0.5 h-4 w-4 text-brand-200" />
                        <div>
                          <p className="font-semibold text-white">Plan a meetup</p>
                          <p className="text-xs text-white/50">Kick off a group chat or schedule your next outing.</p>
                          <Link href="/messages" className="mt-2 inline-flex items-center gap-1 text-xs text-brand-200 hover:text-brand-100">
                            Open messages →
                          </Link>
                        </div>
                      </li>
                      <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                        <MapPin className="mt-0.5 h-4 w-4 text-emerald-200" />
                        <div>
                          <p className="font-semibold text-white">Share a hotspot</p>
                          <p className="text-xs text-white/50">Drop pins and plan the bite together on the Hook&apos;d map.</p>
                          <Link
                            href={`/teams/${team.id}/map`}
                            className="mt-2 inline-flex items-center gap-1 text-xs text-brand-200 hover:text-brand-100"
                          >
                            Open map →
                          </Link>
                        </div>
                      </li>
                      <li className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                        <Fish className="mt-0.5 h-4 w-4 text-sky-200" />
                        <div>
                          <p className="font-semibold text-white">Log a team catch</p>
                          <p className="text-xs text-white/50">Celebrate your wins by logging catches in the shared logbook.</p>
                          <Link href="/logbook" className="mt-2 inline-flex items-center gap-1 text-xs text-brand-200 hover:text-brand-100">
                            Open logbook →
                          </Link>
                        </div>
                      </li>
                    </ul>
                  </article>
                </aside>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function SparkleDivider() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} className="h-4 w-4">
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M4.93 4.93l2.83 2.83" />
      <path d="M16.24 16.24l2.83 2.83" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M4.93 19.07l2.83-2.83" />
      <path d="M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
