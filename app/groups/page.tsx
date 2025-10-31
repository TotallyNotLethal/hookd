'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthState } from 'react-firebase-hooks/auth';
import { CalendarDays, Loader2, PlusCircle, Shield, Users } from 'lucide-react';

import NavBar from '@/components/NavBar';
import { auth } from '@/lib/firebaseClient';

const DEFAULT_FORM = {
  name: '',
  description: '',
  visibility: 'private' as 'private' | 'public',
};

type GroupSummary = {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'private';
  ownerId: string;
  photoURL: string | null;
  featuredCatchIds: string[];
  createdAt: string;
  updatedAt: string;
  membership: { role: string; status: string } | null;
};

export default function GroupsIndexPage() {
  const [authUser, authLoading] = useAuthState(auth);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!authUser) {
      setGroups([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const token = await authUser.getIdToken();
        const response = await fetch('/api/groups', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error(`Failed to load groups (${response.status})`);
        }
        const payload = (await response.json()) as { groups?: GroupSummary[] };
        if (!cancelled) {
          setGroups(payload.groups ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load groups.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authUser) {
      setFormError('You must sign in to create a group.');
      return;
    }

    const trimmedName = form.name.trim();
    if (trimmedName.length < 3) {
      setFormError('Please enter a name with at least 3 characters.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const token = await authUser.getIdToken();
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: trimmedName,
          description: form.description.trim() || undefined,
          visibility: form.visibility,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = typeof payload?.error === 'string' ? payload.error : 'Unable to create that group.';
        throw new Error(message);
      }
      const created = (await response.json()) as GroupSummary;
      setGroups((prev) => [created, ...prev.filter((entry) => entry.id !== created.id)]);
      setForm(DEFAULT_FORM);
      setIsCreating(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create that group.');
    } finally {
      setSubmitting(false);
    }
  };

  const content = useMemo(() => {
    if (authLoading) {
      return (
        <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Checking your session…</span>
        </div>
      );
    }

    if (!authUser) {
      return (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
          <p className="text-lg font-semibold text-white">Sign in to manage crews</p>
          <p className="mt-2 text-sm text-white/60">
            Join or create fishing crews to share catches, plan events, and stay connected with your favorite anglers.
          </p>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading your groups…</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-3xl border border-red-500/40 bg-red-500/10 p-6 text-red-200">
          <p className="text-lg font-semibold">We couldn&apos;t load your groups</p>
          <p className="mt-2 text-sm">{error}</p>
        </div>
      );
    }

    if (!groups.length) {
      return (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
          <p className="text-lg font-semibold text-white">Build your first crew</p>
          <p className="mt-2 text-sm text-white/60">
            Create a group to organize catch logs, group chat, and fishing meetups for your friends and family.
          </p>
        </div>
      );
    }

    return (
      <div className="grid gap-6 md:grid-cols-2">
        {groups.map((group) => (
          <Link
            key={group.id}
            href={`/groups/${group.id}`}
            className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:border-brand-300 hover:text-white"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-100">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{group.name}</p>
                  <p className="text-xs text-white/60">{group.visibility === 'public' ? 'Public crew' : 'Private crew'}</p>
                </div>
              </div>
              {group.membership ? (
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-wide text-white/60">
                  {group.membership.role}
                </span>
              ) : null}
            </div>
            {group.description ? (
              <p className="mt-4 text-sm text-white/60 line-clamp-3">{group.description}</p>
            ) : null}
            <div className="mt-6 flex items-center gap-3 text-xs text-white/40">
              <CalendarDays className="h-4 w-4" />
              <span>Updated {new Date(group.updatedAt).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
      </div>
    );
  }, [authLoading, authUser, error, groups, loading]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <NavBar />
      <section className="container pt-28 pb-16">
        <header className="mb-12 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Crews</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Groups &amp; communities</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/60">
              Manage fishing crews, plan outings, and curate shared catch feeds. Groups combine chat, events, and curated
              catches so everyone stays in sync.
            </p>
          </div>
          {authUser ? (
            <button
              type="button"
              onClick={() => {
                setIsCreating((prev) => !prev);
                setFormError(null);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-brand-300 hover:text-brand-200"
            >
              <PlusCircle className="h-4 w-4" />
              <span>{isCreating ? 'Cancel' : 'New group'}</span>
            </button>
          ) : null}
        </header>

        {isCreating ? (
          <form onSubmit={handleCreate} className="mb-12 space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div>
              <label className="text-sm font-medium text-white">Group name</label>
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Hook'd Legends"
                className="mt-1 w-full rounded-2xl border border-white/15 bg-slate-950/60 px-4 py-2 text-sm text-white placeholder:text-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
                disabled={submitting}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-white">Description</label>
              <textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Share updates, coordinate trips, and celebrate your crew's catches."
                className="mt-1 w-full rounded-2xl border border-white/15 bg-slate-950/60 px-4 py-2 text-sm text-white placeholder:text-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
                rows={3}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-sm font-medium text-white">Visibility</label>
              <div className="flex items-center gap-3 text-sm text-white/70">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    className="h-4 w-4"
                    checked={form.visibility === 'private'}
                    onChange={() => setForm((prev) => ({ ...prev, visibility: 'private' }))}
                    disabled={submitting}
                  />
                  <span className="inline-flex items-center gap-1">
                    <Shield className="h-4 w-4" />
                    Private
                  </span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    className="h-4 w-4"
                    checked={form.visibility === 'public'}
                    onChange={() => setForm((prev) => ({ ...prev, visibility: 'public' }))}
                    disabled={submitting}
                  />
                  <span>Public</span>
                </label>
              </div>
            </div>
            {formError ? <p className="text-sm text-red-300">{formError}</p> : null}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                <span>Create group</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setForm(DEFAULT_FORM);
                  setFormError(null);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {content}
      </section>
    </main>
  );
}
