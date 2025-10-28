'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Loader2, MessageCircle, MessageSquare, MessageSquarePlus, Users, X } from 'lucide-react';

import NavBar from '@/components/NavBar';
import DirectMessageThreadsList from '@/components/direct-messages/DirectMessageThreadsList';
import Modal from '@/components/ui/Modal';
import { auth } from '@/lib/firebaseClient';
import {
  ChatMessage,
  ChatPresence,
  Team,
  sendChatMessage,
  subscribeToChatMessages,
  subscribeToChatPresence,
  subscribeToTeamsForUser,
  subscribeToUser,
  updateChatPresence,
} from '@/lib/firestore';

type UserProfile = {
  uid: string;
  displayName?: string | null;
  photoURL?: string | null;
  [key: string]: unknown;
};

export default function ChatPage() {
  const [user] = useAuthState(auth);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [presenceCount, setPresenceCount] = useState<number | null>(null);
  const [isDmModalOpen, setIsDmModalOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      setPresenceCount(null);
      return;
    }

    let isActive = true;

    const sendHeartbeat = async () => {
      try {
        await updateChatPresence(user.uid);
      } catch (err) {
        console.error('Failed to update chat presence', err);
      }
    };

    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 30_000);

    const unsubscribe = subscribeToChatPresence((presence: ChatPresence[]) => {
      if (!isActive) return;
      setPresenceCount(presence.length);
    }, {
      onError: (err) => {
        console.error('Failed to subscribe to chat presence', err);
      },
    });

    return () => {
      isActive = false;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      setPresenceCount(null);
      unsubscribe();
    };
  }, [user?.uid]);

  useEffect(() => {
    const unsubscribe = subscribeToChatMessages((incoming) => {
      setMessages(incoming);
      setIsLoading(false);
    }, {
      onError: (err) => {
        setError('We could not load the chat right now. Please try again.');
        console.error(err);
      },
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!endRef.current) return;
    endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

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
    if (!user?.uid) {
      setTeams([]);
      return;
    }

    const unsubscribe = subscribeToTeamsForUser(user.uid, (next) => {
      setTeams(next);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const formattedMessages = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return messages.map((message) => ({
      ...message,
      displayName: typeof message.displayName === 'string' && message.displayName.trim()
        ? message.displayName
        : 'Angler',
      photoURL: message.photoURL || null,
      isPro: Boolean(message.isPro),
      timestampLabel: message.createdAt ? formatter.format(message.createdAt) : 'Sending…',
    }));
  }, [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSendError(null);

    if (!user) {
      setSendError('Sign in to share a message with the community.');
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    try {
      setIsSending(true);
      const displayName = userProfile?.displayName && userProfile.displayName.trim()
        ? userProfile.displayName.trim()
        : 'Angler';
      const photoURL = userProfile?.photoURL && typeof userProfile.photoURL === 'string'
        ? userProfile.photoURL
        : null;

      await sendChatMessage({
        uid: user.uid,
        displayName,
        text: trimmed,
        isPro: Boolean(userProfile?.isPro),
        photoURL,
      });
      setInput('');
    } catch (err) {
      console.error('Failed to send chat message', err);
      setSendError('Unable to send that message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <NavBar />
      <section className="container pt-28 pb-16">
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-white/60">
              <MessageSquare className="h-4 w-4" />
              <span>Community Board</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Live Chat</h1>
            <p className="text-white/70 max-w-2xl">
              Share quick updates, celebrate catches, and plan your next trip with the Hook&apos;d crew. Messages update in real time
              so you&apos;re always in the loop.
            </p>
          </header>

          {teams.length > 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/50">
                <Users className="h-4 w-4" />
                <span>Your team channels</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {teams.map((team) => (
                  <Link
                    key={team.id}
                    href={`/teams/${team.id}/chat`}
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/80 transition hover:border-brand-300 hover:text-brand-200"
                  >
                    <span>{team.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="glass border border-white/10 rounded-3xl p-0 overflow-hidden shadow-2xl shadow-slate-950/50">
            <div className="flex flex-col gap-4 border-b border-white/10 bg-white/5 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-medium">General Channel</h2>
                <p className="text-xs text-white/60">Seamless, community-wide conversations</p>
              </div>
              <div className="flex flex-col items-end gap-3 md:flex-row md:items-center md:gap-6">
                <button
                  type="button"
                  onClick={() => setIsDmModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  <MessageCircle className="h-4 w-4" />
                  Direct messages
                </button>
                <div className="text-right text-xs text-white/50">
                  <div>
                    {isLoading ? 'Loading…' : `${messages.length} message${messages.length === 1 ? '' : 's'}`}
                  </div>
                  <div className="text-white/60">
                    {presenceCount === null
                      ? '— anglers online'
                      : `${presenceCount} angler${presenceCount === 1 ? '' : 's'} online`}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex h-[60vh] flex-col">
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-slate-950/40" aria-live="polite">
                {error ? (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                    {error}
                  </div>
                ) : null}

                {!error && isLoading ? (
                  <div className="flex items-center gap-3 text-sm text-white/70">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting anglers…
                  </div>
                ) : null}

                {!error && !isLoading && formattedMessages.length === 0 ? (
                  <p className="text-sm text-white/60">Be the first to start the conversation!</p>
                ) : null}

                {formattedMessages.map((message) => (
                  <article key={message.id} className="flex items-start gap-3 text-sm">
                    <Link
                      href={`/profile/${message.uid}`}
                      prefetch={false}
                      className="group relative block h-10 w-10 flex-none overflow-hidden rounded-full border border-white/10 bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    >
                      {message.photoURL ? (
                        <Image
                          src={message.photoURL}
                          alt={message.displayName}
                          fill
                          className="object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs uppercase text-white/70">
                          {message.displayName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="sr-only">View {message.displayName}&apos;s profile</span>
                    </Link>
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-white/60">
                        <Link
                          href={`/profile/${message.uid}`}
                          prefetch={false}
                          className="rounded font-medium text-white transition hover:text-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                        >
                          {message.displayName}
                        </Link>
                        {message.isPro ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-amber-200">
                            Pro
                          </span>
                        ) : null}
                        <span>{message.timestampLabel}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90">
                        {message.text}
                      </p>
                    </div>
                  </article>
                ))}
                <div ref={endRef} />
              </div>

              <div className="border-t border-white/10 bg-slate-950/60 p-4">
                {!user ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                    <p>Sign in to join the conversation and sync your messages across devices.</p>
                    <div>
                      <Link href="/login" className="btn-primary inline-flex items-center justify-center px-4 py-2 text-sm">
                        Log in to chat
                      </Link>
                    </div>
                  </div>
                ) : null}

                <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
                  <label htmlFor="chat-input" className="text-xs uppercase tracking-[0.2em] text-white/50">
                    Message
                  </label>
                  <textarea
                    id="chat-input"
                    name="message"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder={user ? 'Share a fishing report, plan a meetup, or drop a quick hello…' : 'Sign in to share a message.'}
                    className="min-h-[96px] w-full resize-y rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300/40 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!user || isSending}
                    maxLength={2000}
                    required
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs text-white/40">Messages update instantly for everyone online.</span>
                    <button
                      type="submit"
                      className="btn-primary inline-flex items-center justify-center px-5 py-2 text-sm disabled:opacity-60"
                      disabled={!user || isSending}
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
                  {sendError ? (
                    <p className="text-xs text-red-300">{sendError}</p>
                  ) : null}
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
      <Modal
        open={isDmModalOpen}
        onClose={() => setIsDmModalOpen(false)}
        labelledBy="direct-messages-modal-title"
        contentClassName="max-w-2xl"
      >
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="direct-messages-modal-title" className="text-xl font-semibold text-white">
                Direct Messages
              </h2>
              <p className="text-sm text-white/60">Check private conversations without leaving chat.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsDmModalOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              aria-label="Close direct messages"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            {user ? (
              <DirectMessageThreadsList
                currentUserId={user.uid}
                className="space-y-4"
                onThreadNavigate={() => setIsDmModalOpen(false)}
              />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
                <p className="mb-3">Sign in to view and send private messages.</p>
                <Link href="/login" className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm">
                  <MessageSquarePlus className="h-4 w-4" />
                  Log in to message anglers
                </Link>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
