'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthState } from 'react-firebase-hooks/auth';
import {
  CalendarDays,
  CalendarPlus,
  Crown,
  Loader2,
  MapPin,
  PlusCircle,
  Shield,
  Trash2,
  Users,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import Image from 'next/image';
import { doc, getDoc } from 'firebase/firestore';

import NavBar from '@/components/NavBar';
import GroupChatPanel from '@/components/chat/GroupChatPanel';
import GroupCatchFeed from '@/components/groups/GroupCatchFeed';
import { auth, db } from '@/lib/firebaseClient';

type GroupRole = 'owner' | 'admin' | 'member';

type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'private';
  ownerId: string;
  photoURL: string | null;
  featuredCatchIds: string[];
  createdAt: string;
  updatedAt: string;
  membership: { role: GroupRole; status: string } | null;
};

type MemberSummary = {
  id: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type GroupEvent = {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  createdBy: string;
  startAt: string;
  endAt: string | null;
  locationName: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  createdAt: string;
  updatedAt: string;
};

type ProfileSummary = {
  uid: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
};

function formatDisplayName(profile: ProfileSummary | undefined, fallback: string) {
  if (!profile) return fallback;
  if (profile.username) {
    return `${profile.displayName} (@${profile.username})`;
  }
  return profile.displayName || fallback;
}

function formatDateLabel(value: string | null) {
  if (!value) return 'TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'TBD';
  }
  return date.toLocaleString();
}

export default function GroupDetailPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params?.groupId;
  const [authUser, authLoading] = useAuthState(auth);

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [groupLoading, setGroupLoading] = useState(true);
  const [groupError, setGroupError] = useState<string | null>(null);

  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, ProfileSummary>>({});
  const [memberActions, setMemberActions] = useState<Record<string, { loading: boolean; error: string | null }>>({});

  const [events, setEvents] = useState<GroupEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState({ title: '', description: '', startAt: '', endAt: '', locationName: '' });
  const [eventFormError, setEventFormError] = useState<string | null>(null);
  const [eventSubmitting, setEventSubmitting] = useState(false);
  const [eventPending, setEventPending] = useState<Record<string, boolean>>({});

  const [catchFormId, setCatchFormId] = useState('');
  const [catchFormError, setCatchFormError] = useState<string | null>(null);
  const [catchSubmitting, setCatchSubmitting] = useState(false);

  const [membershipAction, setMembershipAction] = useState<'join' | 'leave' | null>(null);

  const fetchWithAuth = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!authUser) {
        throw new Error('You must be signed in.');
      }
      const token = await authUser.getIdToken();
      const headers = new Headers(init?.headers as HeadersInit | undefined);
      headers.set('Authorization', `Bearer ${token}`);
      return fetch(path, { ...init, headers });
    },
    [authUser],
  );

  const loadGroup = useCallback(async () => {
    if (!groupId || !authUser) return;
    setGroupLoading(true);
    setGroupError(null);
    try {
      const response = await fetchWithAuth(`/api/groups/${groupId}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload?.error === 'string' ? payload.error : `Failed to load group (${response.status}).`;
        throw new Error(message);
      }
      const payload = (await response.json()) as GroupDetail;
      setGroup(payload);
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : 'Unable to load this group.');
    } finally {
      setGroupLoading(false);
    }
  }, [authUser, fetchWithAuth, groupId]);

  const loadMembers = useCallback(async () => {
    if (!groupId || !authUser) return;
    setMembersLoading(true);
    setMemberError(null);
    try {
      const response = await fetchWithAuth(`/api/groups/${groupId}/members`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload?.error === 'string' ? payload.error : `Failed to load members (${response.status}).`;
        throw new Error(message);
      }
      const payload = (await response.json()) as { members?: MemberSummary[] };
      setMembers(payload.members ?? []);
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : 'Unable to load members.');
    } finally {
      setMembersLoading(false);
    }
  }, [authUser, fetchWithAuth, groupId]);

  const loadEvents = useCallback(async () => {
    if (!groupId || !authUser) return;
    setEventsLoading(true);
    setEventError(null);
    try {
      const response = await fetchWithAuth(`/api/events?groupId=${encodeURIComponent(groupId)}&includePast=true`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload?.error === 'string' ? payload.error : `Failed to load events (${response.status}).`;
        throw new Error(message);
      }
      const payload = (await response.json()) as { events?: GroupEvent[] };
      const sorted = (payload.events ?? []).slice().sort((a, b) => {
        return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
      });
      setEvents(sorted);
    } catch (error) {
      setEventError(error instanceof Error ? error.message : 'Unable to load group events.');
    } finally {
      setEventsLoading(false);
    }
  }, [authUser, fetchWithAuth, groupId]);

  useEffect(() => {
    if (authUser && groupId) {
      void loadGroup();
      void loadMembers();
      void loadEvents();
    } else if (!authLoading && !authUser) {
      setGroupLoading(false);
    }
  }, [authLoading, authUser, groupId, loadEvents, loadGroup, loadMembers]);

  useEffect(() => {
    const missing = members
      .map((member) => member.userId)
      .filter((uid) => uid && !memberProfiles[uid]);
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const updates: Record<string, ProfileSummary> = {};
      for (const uid of missing) {
        try {
          const snapshot = await getDoc(doc(db, 'users', uid));
          if (!snapshot.exists()) continue;
          const data = snapshot.data() as Record<string, any>;
          updates[uid] = {
            uid,
            displayName: typeof data.displayName === 'string' && data.displayName ? data.displayName : 'Angler',
            username: typeof data.username === 'string' && data.username ? data.username : null,
            photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
          };
        } catch (error) {
          console.error('Failed to load member profile', error);
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setMemberProfiles((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [memberProfiles, members]);

  const membershipRole = group?.membership?.role ?? null;
  const isOwner = membershipRole === 'owner';
  const canManage = membershipRole === 'owner' || membershipRole === 'admin';

  const handleJoin = async () => {
    if (!authUser || !groupId) return;
    setMembershipAction('join');
    setGroupError(null);
    try {
      const response = await fetchWithAuth(`/api/groups/${groupId}/members`, { method: 'POST' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload?.error === 'string' ? payload.error : 'Unable to join this group right now.';
        throw new Error(message);
      }
      await loadGroup();
      await loadMembers();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : 'Unable to join this group right now.');
    } finally {
      setMembershipAction(null);
    }
  };

  const handleLeave = async () => {
    if (!authUser || !groupId) return;
    setMembershipAction('leave');
    setGroupError(null);
    try {
      const response = await fetchWithAuth(`/api/groups/${groupId}/members/${authUser.uid}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload?.error === 'string' ? payload.error : 'Unable to leave this group right now.';
        throw new Error(message);
      }
      await loadGroup();
      await loadMembers();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : 'Unable to leave this group right now.');
    } finally {
      setMembershipAction(null);
    }
  };

  const handleAddCatchToFeed = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authUser || !groupId) return;
    const trimmed = catchFormId.trim();
    if (!trimmed) {
      setCatchFormError('Enter a catch ID to feature.');
      return;
    }
    setCatchSubmitting(true);
    setCatchFormError(null);
    try {
      const response = await fetchWithAuth(`/api/groups/${groupId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catchId: trimmed }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload?.error === 'string' ? payload.error : 'Unable to add that catch to the feed.';
        throw new Error(message);
      }
      const payload = (await response.json()) as { featuredCatchIds?: string[] };
      setGroup((prev) => (prev ? { ...prev, featuredCatchIds: payload.featuredCatchIds ?? prev.featuredCatchIds } : prev));
      setCatchFormId('');
    } catch (error) {
      setCatchFormError(error instanceof Error ? error.message : 'Unable to add that catch to the feed.');
    } finally {
      setCatchSubmitting(false);
    }
  };

  const handleRemoveCatch = async (catchId: string) => {
    if (!authUser || !groupId) return;
    const response = await fetchWithAuth(`/api/groups/${groupId}/feed`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catchId }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = typeof payload?.error === 'string' ? payload.error : 'Unable to remove that catch.';
      throw new Error(message);
    }
    const payload = (await response.json()) as { featuredCatchIds?: string[] };
    setGroup((prev) => (prev ? { ...prev, featuredCatchIds: payload.featuredCatchIds ?? prev.featuredCatchIds } : prev));
  };

  const handleCreateEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authUser || !groupId) return;
    const title = eventForm.title.trim();
    if (!title) {
      setEventFormError('Event title is required.');
      return;
    }
    if (!eventForm.startAt) {
      setEventFormError('Start time is required.');
      return;
    }
    const start = new Date(eventForm.startAt);
    if (Number.isNaN(start.getTime())) {
      setEventFormError('Start time must be valid.');
      return;
    }
    let endISO: string | undefined;
    if (eventForm.endAt) {
      const end = new Date(eventForm.endAt);
      if (Number.isNaN(end.getTime())) {
        setEventFormError('End time must be valid.');
        return;
      }
      endISO = end.toISOString();
    }

    setEventSubmitting(true);
    setEventFormError(null);

    try {
      const response = await fetchWithAuth('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          title,
          description: eventForm.description.trim() || undefined,
          startAt: start.toISOString(),
          endAt: endISO,
          locationName: eventForm.locationName.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload?.error === 'string' ? payload.error : 'Unable to create that event.';
        throw new Error(message);
      }
      const created = (await response.json()) as GroupEvent;
      setEvents((prev) => [...prev, created].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()));
      setEventForm({ title: '', description: '', startAt: '', endAt: '', locationName: '' });
    } catch (error) {
      setEventFormError(error instanceof Error ? error.message : 'Unable to create that event.');
    } finally {
      setEventSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!authUser) return;
    setEventPending((prev) => ({ ...prev, [eventId]: true }));
    try {
      const response = await fetchWithAuth(`/api/events/${eventId}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload?.error === 'string' ? payload.error : 'Unable to delete that event.';
        throw new Error(message);
      }
      setEvents((prev) => prev.filter((entry) => entry.id !== eventId));
    } catch (error) {
      setEventError(error instanceof Error ? error.message : 'Unable to delete that event.');
    } finally {
      setEventPending((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
    }
  };

  const handleChangeRole = async (userId: string, nextRole: GroupRole) => {
    if (!authUser || !groupId) return;
    setMemberActions((prev) => ({ ...prev, [userId]: { loading: true, error: null } }));
    try {
      const response = await fetchWithAuth(`/api/groups/${groupId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload?.error === 'string' ? payload.error : 'Unable to update that member.';
        throw new Error(message);
      }
      const updated = (await response.json()) as MemberSummary;
      setMembers((prev) => prev.map((member) => (member.userId === userId ? updated : member)));
    } catch (error) {
      setMemberActions((prev) => ({
        ...prev,
        [userId]: { loading: false, error: error instanceof Error ? error.message : 'Unable to update that member.' },
      }));
      return;
    }
    setMemberActions((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const handleRemoveMember = async (userId: string) => {
    if (!authUser || !groupId) return;
    setMemberActions((prev) => ({ ...prev, [userId]: { loading: true, error: null } }));
    try {
      const response = await fetchWithAuth(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload?.error === 'string' ? payload.error : 'Unable to remove that member.';
        throw new Error(message);
      }
      setMembers((prev) => prev.filter((member) => member.userId !== userId));
    } catch (error) {
      setMemberActions((prev) => ({
        ...prev,
        [userId]: { loading: false, error: error instanceof Error ? error.message : 'Unable to remove that member.' },
      }));
      return;
    }
    setMemberActions((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const membershipStatus = useMemo(() => {
    if (!group?.membership) return 'Not a member';
    switch (group.membership.role) {
      case 'owner':
        return 'Group owner';
      case 'admin':
        return 'Group admin';
      default:
        return 'Group member';
    }
  }, [group?.membership]);

  if (authLoading || groupLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
        <NavBar />
        <section className="container flex h-[70vh] items-center justify-center">
          <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-white/70">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading group…</span>
          </div>
        </section>
      </main>
    );
  }

  if (!authUser) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
        <NavBar />
        <section className="container pt-28 pb-16">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
            <p className="text-lg font-semibold text-white">Sign in to view groups</p>
            <p className="mt-2 text-sm text-white/60">
              You need an account to view group details, chat with members, and RSVP to events.
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (groupError) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
        <NavBar />
        <section className="container pt-28 pb-16">
          <div className="rounded-3xl border border-red-500/40 bg-red-500/10 p-6 text-red-200">
            <p className="text-lg font-semibold">We couldn&apos;t load this group</p>
            <p className="mt-2 text-sm">{groupError}</p>
          </div>
        </section>
      </main>
    );
  }

  if (!group) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
        <NavBar />
        <section className="container pt-28 pb-16">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
            <p className="text-lg font-semibold text-white">Group not found</p>
            <p className="mt-2 text-sm text-white/60">We couldn&apos;t locate that group. Double-check the link or return to the groups dashboard.</p>
            <Link
              href="/groups"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
            >
              <Users className="h-4 w-4" />
              <span>Back to groups</span>
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <NavBar />
      <section className="container pt-28 pb-16">
        <div className="space-y-12">
          <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60">
                {group.photoURL ? (
                  <Image src={group.photoURL} alt={`${group.name} avatar`} fill className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-brand-200">
                    <Users className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-white/40">Fishing crew</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{group.name}</h1>
                <p className="mt-2 text-sm text-white/60">{group.description || 'Bring your crew together to plan the next trip.'}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/50">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1">
                    <Shield className="h-3.5 w-3.5" /> {group.visibility === 'public' ? 'Public group' : 'Private group'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1">{membershipStatus}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-3 md:items-end">
              {groupError ? <p className="text-sm text-red-300">{groupError}</p> : null}
              {group.membership ? (
                group.membership.role !== 'owner' ? (
                  <button
                    type="button"
                    onClick={handleLeave}
                    disabled={membershipAction === 'leave'}
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-red-400 hover:text-red-200 disabled:opacity-50"
                  >
                    {membershipAction === 'leave' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                    <span>Leave group</span>
                  </button>
                ) : null
              ) : (
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={membershipAction === 'join'}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-brand-300 hover:text-brand-200 disabled:opacity-50"
                >
                  {membershipAction === 'join' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  <span>Join group</span>
                </button>
              )}
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
                <header className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-white/40">Catch feed</p>
                    <h2 className="text-lg font-semibold text-white">Featured catches</h2>
                  </div>
                </header>
                {canManage ? (
                  <form onSubmit={handleAddCatchToFeed} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Add catch by ID</label>
                    <div className="flex items-center gap-2">
                      <input
                        value={catchFormId}
                        onChange={(event) => setCatchFormId(event.target.value)}
                        placeholder="c8h42m1..."
                        className="h-10 flex-1 rounded-full border border-white/15 bg-slate-950/80 px-4 text-sm text-white placeholder:text-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
                        disabled={catchSubmitting}
                      />
                      <button
                        type="submit"
                        disabled={catchSubmitting}
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:opacity-50"
                      >
                        {catchSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                        <span>Add</span>
                      </button>
                    </div>
                    {catchFormError ? <p className="text-xs text-red-300">{catchFormError}</p> : null}
                  </form>
                ) : null}
                <GroupCatchFeed
                  catchIds={group.featuredCatchIds}
                  canManage={canManage}
                  onRemove={canManage ? handleRemoveCatch : undefined}
                />
              </section>

              <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
                <header className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-white/40">Events</p>
                    <h2 className="text-lg font-semibold text-white">Group calendar</h2>
                  </div>
                </header>
                {eventError ? <p className="text-sm text-red-300">{eventError}</p> : null}
                {canManage ? (
                  <form onSubmit={handleCreateEvent} className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Plan an event</label>
                    <input
                      value={eventForm.title}
                      onChange={(event) => setEventForm((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Sunrise topwater session"
                      className="h-10 w-full rounded-full border border-white/15 bg-slate-950/80 px-4 text-sm text-white placeholder:text-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
                      disabled={eventSubmitting}
                      required
                    />
                    <textarea
                      value={eventForm.description}
                      onChange={(event) => setEventForm((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="Meet at the marina at 5:30am. Bring frogs and buzzbaits."
                      className="w-full rounded-2xl border border-white/15 bg-slate-950/80 px-4 py-2 text-sm text-white placeholder:text-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
                      rows={3}
                      disabled={eventSubmitting}
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Starts</label>
                        <input
                          type="datetime-local"
                          value={eventForm.startAt}
                          onChange={(event) => setEventForm((prev) => ({ ...prev, startAt: event.target.value }))}
                          className="mt-1 h-10 w-full rounded-full border border-white/15 bg-slate-950/80 px-4 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
                          disabled={eventSubmitting}
                          required
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Ends (optional)</label>
                        <input
                          type="datetime-local"
                          value={eventForm.endAt}
                          onChange={(event) => setEventForm((prev) => ({ ...prev, endAt: event.target.value }))}
                          className="mt-1 h-10 w-full rounded-full border border-white/15 bg-slate-950/80 px-4 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
                          disabled={eventSubmitting}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Location</label>
                      <input
                        value={eventForm.locationName}
                        onChange={(event) => setEventForm((prev) => ({ ...prev, locationName: event.target.value }))}
                        placeholder="Lake Austin ramp"
                        className="mt-1 h-10 w-full rounded-full border border-white/15 bg-slate-950/80 px-4 text-sm text-white placeholder:text-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
                        disabled={eventSubmitting}
                      />
                    </div>
                    {eventFormError ? <p className="text-xs text-red-300">{eventFormError}</p> : null}
                    <button
                      type="submit"
                      disabled={eventSubmitting}
                      className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:opacity-50"
                    >
                      {eventSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                      <span>Create event</span>
                    </button>
                  </form>
                ) : null}

                {eventsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading events…</span>
                  </div>
                ) : events.length === 0 ? (
                  <p className="text-sm text-white/60">No events scheduled yet. Start by planning your next outing.</p>
                ) : (
                  <ul className="space-y-4">
                    {events.map((eventItem) => (
                      <li key={eventItem.id} className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-white">{eventItem.title}</p>
                            <p className="text-xs text-white/50">{formatDateLabel(eventItem.startAt)}</p>
                          </div>
                          {canManage ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(eventItem.id)}
                              disabled={Boolean(eventPending[eventItem.id])}
                              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 transition hover:border-red-400 hover:text-red-200 disabled:opacity-50"
                            >
                              {eventPending[eventItem.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              <span>Delete</span>
                            </button>
                          ) : null}
                        </div>
                        {eventItem.description ? <p className="text-sm text-white/60">{eventItem.description}</p> : null}
                        {eventItem.locationName ? (
                          <p className="inline-flex items-center gap-2 text-xs text-white/60">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{eventItem.locationName}</span>
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="space-y-6">
              <GroupChatPanel groupId={group.id} groupName={group.name} />

              <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
                <header className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-white/40">Roster</p>
                    <h2 className="text-lg font-semibold text-white">Group members</h2>
                  </div>
                </header>
                {memberError ? <p className="text-sm text-red-300">{memberError}</p> : null}
                {membersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading members…</span>
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-sm text-white/60">No members yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {members.map((member) => {
                      const profile = memberProfiles[member.userId];
                      const actionState = memberActions[member.userId];
                      return (
                        <li key={member.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-center gap-3">
                            <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
                              {profile?.photoURL ? (
                                <Image src={profile.photoURL} alt={profile.displayName} fill className="object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-white/30">
                                  <Users className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">{formatDisplayName(profile, 'Angler')}</p>
                              <p className="text-xs text-white/50">{member.role}</p>
                              {actionState?.error ? <p className="text-xs text-red-300">{actionState.error}</p> : null}
                            </div>
                          </div>
                          {isOwner && member.userId !== group.ownerId ? (
                            <div className="flex flex-wrap items-center gap-2">
                              {member.role !== 'admin' ? (
                                <button
                                  type="button"
                                  onClick={() => handleChangeRole(member.userId, 'admin')}
                                  disabled={actionState?.loading}
                                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 transition hover:border-brand-300 hover:text-brand-200 disabled:opacity-50"
                                >
                                  {actionState?.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crown className="h-3.5 w-3.5" />}
                                  <span>Promote</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleChangeRole(member.userId, 'member')}
                                  disabled={actionState?.loading}
                                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-50"
                                >
                                  {actionState?.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                                  <span>Demote</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(member.userId)}
                                disabled={actionState?.loading}
                                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 transition hover:border-red-400 hover:text-red-200 disabled:opacity-50"
                              >
                                {actionState?.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                                <span>Remove</span>
                              </button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
