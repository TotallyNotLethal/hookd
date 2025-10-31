'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';

import NavBar from '@/components/NavBar';
import { auth } from '@/lib/firebaseClient';
import {
  subscribeToPendingUserReports,
  subscribeToUser,
  type HookdUser,
  type UserReport,
} from '@/lib/firestore';

const formatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export default function UserReportsPage() {
  const [authUser] = useAuthState(auth);
  const [profile, setProfile] = useState<HookdUser | null>(null);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const defer = useCallback((fn: () => void) => {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(fn);
    } else {
      Promise.resolve().then(fn);
    }
  }, []);

  useEffect(() => {
    if (!authUser?.uid) {
      defer(() => setProfile(null));
      return;
    }

    const unsubscribe = subscribeToUser(authUser.uid, (data) => {
      defer(() => setProfile(data));
    });

    return () => {
      unsubscribe();
    };
  }, [authUser?.uid, defer]);

  const isModerator = Boolean(profile?.isModerator);
  const isTester = Boolean(profile?.isTester);
  const hasReviewAccess = isModerator || isTester;
  const roleLabel = isModerator ? 'moderator' : isTester ? 'tester' : 'reviewer';

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isMounted = true;

    if (!authUser?.uid) {
      defer(() => {
        setReports([]);
        setLoading(false);
      });
      return () => {};
    }

    if (!profile) {
      defer(() => setLoading(true));
      return () => {};
    }

    if (!hasReviewAccess) {
      defer(() => {
        setReports([]);
        setLoading(false);
      });
      return () => {};
    }

    defer(() => {
      setLoading(true);
      setError(null);
    });

    (async () => {
      try {
        unsubscribe = await subscribeToPendingUserReports(
          authUser.uid,
          (items) => {
            if (!isMounted) return;
            defer(() => {
              setReports(items);
              setLoading(false);
            });
          },
          {
            onError: (err) => {
              console.error('Failed to load user reports', err);
              if (!isMounted) return;
              defer(() => {
                setError('We could not load user reports.');
                setLoading(false);
              });
            },
          },
        );
      } catch (err) {
        console.error('Failed to subscribe to user reports', err);
        if (!isMounted) return;
        defer(() => {
          setError('Moderator or tester access is required to review reports.');
          setLoading(false);
        });
      }
    })();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [authUser?.uid, defer, hasReviewAccess, profile]);

  const hasReports = reports.length > 0;

  const content = useMemo(() => {
    if (!authUser) {
      return (
        <div className="card p-6">
          <p className="text-white/70">Sign in with a moderator or tester account to review user reports.</p>
        </div>
      );
    }

    if (!profile) {
      return (
        <div className="card flex items-center gap-3 p-6 text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          {`Loading your ${roleLabel} permissions…`}
        </div>
      );
    }

    if (!hasReviewAccess) {
      return (
        <div className="card flex items-center gap-3 border-red-500/30 bg-red-500/10 p-6 text-sm text-red-100">
          <ShieldAlert className="h-5 w-5" />
          <span>You need moderator or tester access to view pending user reports.</span>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="card flex items-center gap-3 p-6 text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading pending reports…
        </div>
      );
    }

    if (error) {
      return (
        <div className="card border-red-500/30 bg-red-500/10 p-6 text-sm text-red-100">{error}</div>
      );
    }

    if (!hasReports) {
      return (
        <div className="card p-6 text-sm text-white/70">
          <p>No pending user reports at the moment. Check back later.</p>
        </div>
      );
    }

    return (
      <div className="card divide-y divide-white/10 overflow-hidden">
        {reports.map((report) => {
          const createdLabel = report.createdAt ? formatter.format(report.createdAt) : 'Pending';
          return (
            <div key={report.id} className="grid gap-3 p-4 sm:grid-cols-2 sm:items-start">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">Reported Angler</div>
                <Link
                  href={`/profile/${report.reportedUid}`}
                  className="text-sm font-semibold text-white transition hover:text-brand-300"
                >
                  {report.reportedUid}
                </Link>
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">Reporter</div>
                <Link
                  href={`/profile/${report.reporterUid}`}
                  className="text-sm text-white/70 transition hover:text-brand-200"
                >
                  {report.reporterUid}
                </Link>
                <div className="text-xs text-white/40">Filed {createdLabel}</div>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">Reason</p>
                  <p className="whitespace-pre-wrap rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                    {report.reason}
                  </p>
                </div>
                {report.details ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/40">Details</p>
                    <p className="whitespace-pre-wrap rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                      {report.details}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [authUser, error, hasReports, hasReviewAccess, loading, profile, reports, roleLabel]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <NavBar />
      <section className="container pt-28 pb-16">
        <header className="mb-8 space-y-2">
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-white/60">
            <ShieldAlert className="h-4 w-4" />
            <span>User Safety</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Pending User Reports</h1>
          <p className="text-white/70">
            Review community reports submitted by anglers. Mark incidents as resolved in the moderation tools.
          </p>
        </header>
        {content}
      </section>
    </main>
  );
}
