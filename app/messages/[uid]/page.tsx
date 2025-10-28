'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import clsx from 'clsx';
import { Loader2, Lock, MailPlus } from 'lucide-react';

import NavBar from '@/components/NavBar';
import { auth } from '@/lib/firebaseClient';
import {
  DirectMessage,
  getDirectMessageThreadId,
  sendDirectMessage,
  subscribeToDirectMessages,
  subscribeToUser,
} from '@/lib/firestore';

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

type UserProfile = {
  uid: string;
  displayName?: string | null;
  username?: string | null;
  photoURL?: string | null;
  blockedUserIds?: string[];
  blockedByUserIds?: string[];
  [key: string]: unknown;
};

type FormattedDirectMessage = DirectMessage & {
  timestampLabel: string;
  isOwn: boolean;
};

function deriveDisplayName(profile: UserProfile | null | undefined, fallback?: string | null) {
  if (!profile) return fallback ?? null;
  if (typeof profile.displayName === 'string' && profile.displayName.trim()) {
    return profile.displayName.trim();
  }
  if (typeof profile.username === 'string' && profile.username.trim()) {
    return profile.username.trim();
  }
  return fallback ?? null;
}

function derivePhotoURL(profile: UserProfile | null | undefined, fallback?: string | null) {
  if (profile?.photoURL && typeof profile.photoURL === 'string' && profile.photoURL.trim()) {
    return profile.photoURL;
  }
  return fallback ?? null;
}

export default function DirectMessagePage() {
  const params = useParams<{ uid: string }>();
  const otherUid = params?.uid;
  const [user] = useAuthState(auth);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setUserProfile(null);
      return;
    }

    const unsubscribe = subscribeToUser(user.uid, (data) => {
      setUserProfile(data);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!otherUid) {
      setOtherProfile(null);
      return;
    }

    const unsubscribe = subscribeToUser(otherUid, (data) => {
      setOtherProfile(data);
    });

    return () => {
      unsubscribe();
    };
  }, [otherUid]);

  const viewerUid = user?.uid ?? null;
  const otherUserUid = otherUid ?? null;

  const viewerBlockedOther = useMemo(() => {
    if (!viewerUid || !otherUserUid) return false;
    const blocked = Array.isArray(userProfile?.blockedUserIds) ? userProfile.blockedUserIds : [];
    return blocked.includes(otherUserUid);
  }, [viewerUid, otherUserUid, userProfile?.blockedUserIds]);

  const viewerBlockedByOther = useMemo(() => {
    if (!viewerUid || !otherUserUid) return false;
    const blockedBy = Array.isArray(userProfile?.blockedByUserIds) ? userProfile.blockedByUserIds : [];
    return blockedBy.includes(otherUserUid);
  }, [viewerUid, otherUserUid, userProfile?.blockedByUserIds]);

  const otherBlockedViewer = useMemo(() => {
    if (!viewerUid || !otherUserUid) return false;
    const blocked = Array.isArray(otherProfile?.blockedUserIds) ? otherProfile.blockedUserIds : [];
    return blocked.includes(viewerUid);
  }, [viewerUid, otherUserUid, otherProfile?.blockedUserIds]);

  const otherBlockedByViewer = useMemo(() => {
    if (!viewerUid || !otherUserUid) return false;
    const blockedBy = Array.isArray(otherProfile?.blockedByUserIds) ? otherProfile.blockedByUserIds : [];
    return blockedBy.includes(viewerUid);
  }, [viewerUid, otherUserUid, otherProfile?.blockedByUserIds]);

  const conversationBlocked = useMemo(
    () => Boolean(viewerBlockedOther || viewerBlockedByOther || otherBlockedViewer || otherBlockedByViewer),
    [viewerBlockedOther, viewerBlockedByOther, otherBlockedViewer, otherBlockedByViewer],
  );

  const mutualBlock = viewerBlockedOther && (viewerBlockedByOther || otherBlockedViewer);

  const blockNotice = useMemo(() => {
    if (!conversationBlocked) return null;
    if (mutualBlock) {
      return 'You and this angler have blocked each other. Unblock them from your profiles to resume chatting.';
    }
    if (viewerBlockedOther) {
      return 'You have blocked this angler. Unblock them from their profile to continue messaging.';
    }
    return 'This angler has blocked you. Messaging is disabled.';
  }, [conversationBlocked, mutualBlock, viewerBlockedOther]);

  useEffect(() => {
    if (!user?.uid || !otherUid) {
      setError(null);
      setIsLoading(false);
      setMessages([]);
      return;
    }

    if (user.uid === otherUid) {
      setError('You cannot send a private message to yourself.');
      setIsLoading(false);
      setMessages([]);
      return;
    }

    if (conversationBlocked) {
      setError(null);
      setIsLoading(false);
      setMessages([]);
      return;
    }

    setError(null);
    setIsLoading(true);
    const threadId = getDirectMessageThreadId(user.uid, otherUid);
    const unsubscribe = subscribeToDirectMessages(threadId, (incoming) => {
      setMessages(incoming);
      setIsLoading(false);
    }, {
      onError: (err) => {
        console.error('Failed to load direct messages', err);
        setError('We could not load this conversation. Please try again.');
        setIsLoading(false);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [conversationBlocked, otherUid, user?.uid]);

  useEffect(() => {
    if (!endRef.current) return;
    endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const formattedMessages = useMemo<FormattedDirectMessage[]>(() => {
    return messages.map((message) => ({
      ...message,
      timestampLabel: message.createdAt ? timestampFormatter.format(message.createdAt) : 'Sending…',
      isOwn: message.senderUid === user?.uid,
    }));
  }, [messages, user?.uid]);

  const otherDisplayName = deriveDisplayName(otherProfile, 'Angler') ?? 'Angler';
  const otherPhotoURL = derivePhotoURL(otherProfile, null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSendError(null);

    if (!user) {
      setSendError('Sign in to send a private message.');
      return;
    }

    if (!otherUid || user.uid === otherUid) {
      setSendError('Unable to send this message.');
      return;
    }

    if (conversationBlocked) {
      setSendError('Messaging is disabled for this conversation.');
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    const senderDisplayName = deriveDisplayName(userProfile, user.displayName || 'Angler') || 'Angler';
    const senderPhotoURL = derivePhotoURL(userProfile, user.photoURL ?? null);
    const recipientDisplayName = deriveDisplayName(otherProfile, 'Angler') || 'Angler';
    const recipientPhotoURL = derivePhotoURL(otherProfile, null);

    try {
      setIsSending(true);
      await sendDirectMessage({
        senderUid: user.uid,
        recipientUid: otherUid,
        text: trimmed,
        senderDisplayName,
        senderPhotoURL,
        recipientDisplayName,
        recipientPhotoURL,
      });
      setInput('');
    } catch (err) {
      console.error('Failed to send direct message', err);
      setSendError('We could not send that message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const conversationUnavailable = !otherProfile && !isLoading && !error;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <NavBar />
      <section className="container pt-28 pb-16">
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-white/60">
              <Lock className="h-4 w-4" />
              <span>Private Conversation</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Direct Message</h1>
            <p className="text-white/70 max-w-2xl">
              This space is just between you and {otherDisplayName}.
            </p>
          </header>

          <div className="glass border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-slate-950/50">
            {!otherUid ? (
              <div className="p-8 text-sm text-white/70">This conversation could not be found.</div>
            ) : !user ? (
              <div className="flex flex-col items-center gap-4 p-8 text-center text-sm text-white/70">
                <p>Sign in to send private messages.</p>
                <Link href="/login" className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm">
                  <MailPlus className="h-4 w-4" />
                  Log in to continue
                </Link>
              </div>
            ) : user.uid === otherUid ? (
              <div className="p-8 text-sm text-white/70">
                You can&apos;t send a private message to yourself.
              </div>
            ) : (
              <div className="flex h-[70vh] flex-col">
                <div className="flex items-center gap-4 border-b border-white/10 bg-white/5 px-6 py-4">
                  <div className="relative h-12 w-12 overflow-hidden rounded-full border border-white/10 bg-slate-800">
                    {otherPhotoURL ? (
                      <Image src={otherPhotoURL} alt={otherDisplayName} fill className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm uppercase text-white/70">
                        {otherDisplayName.slice(0, 2)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{otherDisplayName}</p>
                    <p className="text-xs text-white/60">Private chat room</p>
                  </div>
                  <Link
                    href={`/profile/${otherUid}`}
                    prefetch={false}
                    className="rounded-xl border border-white/15 px-3 py-1 text-xs text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  >
                    View profile
                  </Link>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto bg-slate-950/40 px-6 py-4" aria-live="polite">
                  {blockNotice ? (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                      {blockNotice}
                    </div>
                  ) : null}
                  {error ? (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
                  ) : null}

                  {!error && isLoading ? (
                    <div className="flex items-center gap-3 text-sm text-white/70">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading conversation…
                    </div>
                  ) : null}

                  {!error && !isLoading && conversationUnavailable ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                      This angler&apos;s profile is unavailable, but you can still review previous messages.
                    </div>
                  ) : null}

                  {!error && !isLoading && !conversationBlocked && formattedMessages.length === 0 ? (
                    <p className="text-sm text-white/60">Say hello to start your private chat.</p>
                  ) : null}

                  {formattedMessages.map((message) => (
                    <div key={message.id} className={clsx('flex', message.isOwn ? 'justify-end' : 'justify-start')}>
                      <div
                        className={clsx(
                          'max-w-[80%] rounded-2xl border px-4 py-3 text-sm shadow-lg',
                          message.isOwn
                            ? 'bg-brand-500/90 text-white border-transparent'
                            : 'bg-white/10 text-white/90 border-white/10',
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{message.text}</p>
                        <span className="mt-2 block text-right text-[0.65rem] uppercase tracking-wide text-white/60">
                          {message.timestampLabel}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>

                <div className="border-t border-white/10 bg-slate-950/60 p-4">
                  <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                    <label htmlFor="dm-input" className="text-xs uppercase tracking-[0.2em] text-white/50">
                      Message
                    </label>
                    <textarea
                      id="dm-input"
                      name="message"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder={conversationBlocked ? 'Messaging is disabled.' : `Write a private note to ${otherDisplayName}…`}
                      className="min-h-[120px] w-full resize-y rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300/40 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSending || conversationBlocked}
                      maxLength={2000}
                      required
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs text-white/40">
                        {conversationBlocked
                          ? 'Messaging is currently disabled for this conversation.'
                          : `Only you and ${otherDisplayName} can see this chat.`}
                      </span>
                      <button
                        type="submit"
                        className="btn-primary inline-flex items-center justify-center px-5 py-2 text-sm disabled:opacity-60"
                        disabled={isSending || conversationBlocked}
                      >
                        {isSending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending…
                          </>
                        ) : (
                          'Send message'
                        )}
                      </button>
                    </div>
                    {sendError ? <p className="text-xs text-red-300">{sendError}</p> : null}
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
