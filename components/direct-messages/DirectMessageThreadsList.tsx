'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { DirectMessageThread, subscribeToDirectMessageThreads } from '@/lib/firestore';

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

type DirectMessageThreadsListProps = {
  currentUserId: string | null | undefined;
  onThreadNavigate?: () => void;
  className?: string;
};

export default function DirectMessageThreadsList({
  currentUserId,
  onThreadNavigate,
  className,
}: DirectMessageThreadsListProps) {
  const [threads, setThreads] = useState<DirectMessageThread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defer = useCallback((fn: () => void) => {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(fn);
    } else {
      Promise.resolve().then(fn);
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      defer(() => {
        setThreads([]);
        setIsLoading(false);
        setError(null);
      });
      return;
    }

    defer(() => {
      setIsLoading(true);
      setError(null);
    });

    const unsubscribe = subscribeToDirectMessageThreads(
      currentUserId,
      (incoming) => {
        setThreads(incoming);
        setIsLoading(false);
      },
      {
        onError: (err) => {
          console.error('Failed to load direct messages', err);
          setError('We could not load your messages. Please try again.');
          setIsLoading(false);
        },
      },
    );

    return () => {
      unsubscribe();
    };
  }, [currentUserId, defer]);

  const listItems = useMemo<ThreadListItem[]>(() => {
    if (!currentUserId) return [];

    return threads
      .map((thread) => {
        const otherUid = thread.participants.find((id) => id !== currentUserId) ?? thread.participants[0] ?? null;
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
      })
      .filter((item) => Boolean(item.otherUid));
  }, [threads, currentUserId]);

  return (
    <div className={className}>
      {error ? <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}

      {!error && isLoading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your conversations…
        </div>
      ) : null}

      {!error && !isLoading && listItems.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
          <p>No private messages yet. Visit someone&apos;s profile to start a conversation.</p>
        </div>
      ) : null}

      {listItems.length > 0 ? (
        <div className="mt-4 divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10">
          {listItems.map((item) => (
            <Link
              key={item.thread.id}
              href={`/messages/${item.otherUid}`}
              prefetch={false}
              className="flex items-center gap-4 bg-slate-950/60 px-4 py-3 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              onClick={onThreadNavigate}
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
      ) : null}
    </div>
  );
}
