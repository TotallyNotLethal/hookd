'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Loader2, MessageCircle, MessageSquarePlus } from 'lucide-react';

import NavBar from '@/components/NavBar';
import { auth } from '@/lib/firebaseClient';
import {
  DirectMessageThread,
  subscribeToDirectMessageThreads,
} from '@/lib/firestore';

const formatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

type ThreadListItem = {
  thread: DirectMessageThread;
  otherUid: string | null;
  displayName: string;
  photoURL: string | null;
  updatedAtLabel: string;
  lastMessage: string | null;
};

export default function MessagesPage() {
  const [user] = useAuthState(auth);
  const [threads, setThreads] = useState<DirectMessageThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setThreads([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    const unsubscribe = subscribeToDirectMessageThreads(user.uid, (incoming) => {
      setThreads(incoming);
      setIsLoading(false);
    }, {
      onError: (err) => {
        console.error('Failed to load direct messages', err);
        setError('We could not load your messages. Please try again.');
        setIsLoading(false);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  const listItems = useMemo<ThreadListItem[]>(() => {
    if (!user?.uid) return [];

    return threads.map((thread) => {
      const otherUid = thread.participants.find((id) => id !== user.uid) ?? thread.participants[0] ?? null;
      const profile = otherUid && thread.participantProfiles ? thread.participantProfiles[otherUid] : null;
      const displayName = profile?.displayName?.trim() || 'Angler';
      const photoURL = profile?.photoURL ?? null;
      const updatedAtLabel = thread.updatedAt ? formatter.format(thread.updatedAt) : 'Just now';
      const lastMessage = thread.lastMessage ?? null;

      return {
        thread,
        otherUid,
        displayName,
        photoURL,
        updatedAtLabel,
        lastMessage,
      };
    }).filter((item) => Boolean(item.otherUid));
  }, [threads, user?.uid]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <NavBar />
      <section className="container pt-28 pb-16">
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-white/60">
              <MessageCircle className="h-4 w-4" />
              <span>Private Messages</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Direct Messages</h1>
            <p className="text-white/70 max-w-2xl">
              Keep the conversation going in one-on-one chats with fellow anglers. Start a new private message from someone&apos;s profile.
            </p>
          </header>

          <div className="glass border border-white/10 rounded-3xl p-0 overflow-hidden shadow-2xl shadow-slate-950/50">
            {!user ? (
              <div className="p-8 text-center text-sm text-white/70">
                <p className="mb-4">Sign in to view and send private messages.</p>
                <Link href="/login" className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm">
                  <MessageSquarePlus className="h-4 w-4" />
                  Log in to message anglers
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {error ? (
                  <div className="p-6 text-sm text-red-200">{error}</div>
                ) : null}

                {!error && isLoading ? (
                  <div className="flex items-center gap-3 p-6 text-sm text-white/70">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading your conversations…
                  </div>
                ) : null}

                {!error && !isLoading && listItems.length === 0 ? (
                  <div className="p-6 text-sm text-white/60">
                    <p>No private messages yet. Visit someone&apos;s profile to start a conversation.</p>
                  </div>
                ) : null}

                {listItems.map((item) => (
                  <Link
                    key={item.thread.id}
                    href={`/messages/${item.otherUid}`}
                    prefetch={false}
                    className="flex items-center gap-4 p-6 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  >
                    <div className="relative h-12 w-12 overflow-hidden rounded-full border border-white/10 bg-slate-800">
                      {item.photoURL ? (
                        <Image src={item.photoURL} alt={item.displayName} fill className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm uppercase text-white/70">
                          {item.displayName.slice(0, 2)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-white/50">
                        <span className="text-sm font-semibold text-white">{item.displayName}</span>
                        <span>{item.updatedAtLabel}</span>
                      </div>
                      <p className="line-clamp-2 text-sm text-white/70">
                        {item.lastMessage || 'Tap to continue the conversation.'}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
