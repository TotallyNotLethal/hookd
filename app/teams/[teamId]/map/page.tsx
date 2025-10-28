'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Loader2, MapPin, Users } from 'lucide-react';

import NavBar from '@/components/NavBar';
import { auth } from '@/lib/firebaseClient';
import { subscribeToTeam, type Team } from '@/lib/firestore';

const FishingMap = dynamic(() => import('@/components/FishingMap'), {
  ssr: false,
  loading: () => <div className="p-6 text-white/60">Loading crew map…</div>,
});

export default function TeamMapPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params?.teamId;
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [authUser] = useAuthState(auth);

  useEffect(() => {
    if (!teamId) {
      return;
    }

    const unsubscribe = subscribeToTeam(teamId, (next) => {
      setTeam(next);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [teamId]);

  const isMember = Boolean(team && authUser?.uid && team.memberUids.includes(authUser.uid));

  if (!teamId) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
        <NavBar />
        <section className="container pt-28 pb-16">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
            <p className="text-lg font-semibold text-white">Team not found</p>
            <p className="mt-2 text-sm text-white/60">
              We couldn&apos;t find that crew. Double-check the invite link or head back to the teams dashboard.
            </p>
            <Link
              href="/teams"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-brand-300 hover:text-brand-200"
            >
              <Users className="h-4 w-4" />
              <span>Back to teams</span>
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
        {loading ? (
          <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading crew map…</span>
          </div>
        ) : !team ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
            <p className="text-lg font-semibold text-white">Team not found</p>
            <p className="mt-2 text-sm text-white/60">
              We couldn&apos;t find that crew. Double-check the invite link or head back to the teams dashboard.
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
          <div className="space-y-10">
            <header className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/50">
                <MapPin className="h-3.5 w-3.5" />
                <span>Crew map</span>
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{team.name}</h1>
              <p className="mt-2 text-sm text-white/60">
                Private hotspots for {team.memberUids.length} anglers. Only members of this crew can see and contribute pins.
              </p>
            </header>

            {isMember ? (
              <div className="space-y-6">
                <p className="text-sm text-white/60">
                  Every public catch from your crew appears on this map so you can coordinate meetups, plan drifts, and revisit productive water together.
                </p>
                <FishingMap
                  allowedUids={team.memberUids}
                  includeReferenceSpots={false}
                  showRegulationsToggle={false}
                />
              </div>
            ) : (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
                <p className="font-semibold text-white">Crew only</p>
                <p className="mt-2">
                  Join this team to unlock the shared map with pins and catches from the entire crew.
                </p>
                <Link
                  href={`/teams/${team.id}`}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs uppercase tracking-wide text-white/70 transition hover:border-brand-300 hover:text-brand-200"
                >
                  <Users className="h-4 w-4" />
                  <span>View team overview</span>
                </Link>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
