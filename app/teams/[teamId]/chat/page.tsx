'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { ArrowLeft, Loader2, MessageCircle } from 'lucide-react';

import NavBar from '@/components/NavBar';
import { useProAccess } from '@/hooks/useProAccess';
import {
  HookdUser,
  Team,
  TeamChatMessage,
  sendTeamChatMessage,
  subscribeToTeam,
  subscribeToTeamChatMessages,
  subscribeToUser,
} from '@/lib/firestore';
import { auth } from '@/lib/firebaseClient';

export default function TeamChatPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params?.teamId;
  const [user] = useAuthState(auth);
  const { isPro, loading: proLoading } = useProAccess();
  const [team, setTeam] = useState<Team | null>(null);
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [profile, setProfile] = useState<HookdUser | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!teamId) return;
    const unsubscribe = subscribeToTeam(teamId, (next) => {
      setTeam(next);
    });
    return () => unsubscribe();
  }, [teamId]);

  useEffect(() => {
    if (!teamId) {
      setMessages([]);
      return;
    }

    const unsubscribe = subscribeToTeamChatMessages(teamId, (incoming) => {
      setMessages(incoming);
      setIsLoading(false);
    }, {
      onError: (err) => {
        console.error('Failed to load team chat messages', err);
        setError('We could not load this chat. Please try again later.');
      },
    });

    return () => {
      unsubscribe();
    };
  }, [teamId]);

  useEffect(() => {
    if (!user?.uid) {
      setProfile(null);
      return;
    }

    setProfileError(null);
    const unsubscribe = subscribeToUser(user.uid, (data) => {
      if (!data) {
        setProfileError('We could not load your profile details.');
      }
      setProfile(data);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!endRef.current) return;
    endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const isMember = useMemo(() => {
    if (!user?.uid || !team) return false;
    return team.memberUids.includes(user.uid);
  }, [team, user?.uid]);

  const canChat = Boolean(user && isPro && isMember);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!teamId || !user) {
      setError('Sign in to send messages.');
      return;
    }

    if (!canChat) {
      setError('Only Pro team members can send messages in this channel.');
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    const displayName = profile?.displayName?.trim() || 'Angler';
    const photoURL = profile?.photoURL && typeof profile.photoURL === 'string'
      ? profile.photoURL
      : null;

    try {
      setIsSending(true);
      await sendTeamChatMessage(teamId, {
        uid: user.uid,
        displayName,
        text: trimmed,
        photoURL,
      });
      setInput('');
    } catch (err: any) {
      console.error('Failed to send team chat message', err);
      setError(err?.message ?? 'Unable to send that message.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <NavBar />
      <section className="container pt-nav pb-16">
        <header className="mb-6 flex flex-col gap-2">
          <Link
            href="/teams"
            className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to teams
          </Link>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/60">
            <MessageCircle className="h-4 w-4" />
            <span>Team Channel</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {team ? team.name : 'Team chat'}
          </h1>
          <p className="max-w-2xl text-white/70">
            Coordinate in real time with your crew. Messages stay private to team members.
          </p>
        </header>

        {!teamId ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
            We couldn&apos;t determine which team you wanted to view.
          </div>
        ) : team === null ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
            We couldn&apos;t find that team. It may have been removed.
          </div>
        ) : !user ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
            Sign in to join the conversation with your teammates.
          </div>
        ) : proLoading ? (
          <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading your access…</span>
          </div>
        ) : !isPro ? (
          <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6 text-sm text-amber-100">
            Upgrade to Hook&apos;d Pro to participate in team-only channels.
          </div>
        ) : !isMember ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
            You&apos;re not a member of this team yet. Accept your invite to chat.
          </div>
        ) : (
          <div className="glass rounded-3xl border border-white/10 bg-white/5">
            <div className="flex flex-col gap-4 border-b border-white/10 bg-white/5 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-medium text-white">{team.name}</h2>
                <p className="text-sm text-white/60">
                  {(team.memberCount ?? team.memberUids.length)} members • Private team chat
                </p>
              </div>
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
              >
                <MessageCircle className="h-4 w-4" />
                Community chat
              </Link>
            </div>

            <div className="flex flex-col gap-6 p-6">
              {error ? (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}
              {profileError ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  {profileError}
                </div>
              ) : null}

              <div className="space-y-4">
                {isLoading ? (
                  <div className="flex items-center gap-3 text-sm text-white/60">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading messages…</span>
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-white/60">No messages yet. Say hello!</p>
                ) : null}

                {messages.map((message) => (
                  <article key={message.id} className="flex items-start gap-3 text-sm">
                    <Link
                      href={`/profile/${message.uid}`}
                      prefetch={false}
                      className="group relative block h-10 w-10 flex-none overflow-hidden rounded-full border border-white/10 bg-slate-800"
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
                      <span className="sr-only">View profile</span>
                    </Link>
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-white/60">
                        <Link
                          href={`/profile/${message.uid}`}
                          prefetch={false}
                          className="rounded font-medium text-white transition hover:text-brand-200"
                        >
                          {message.displayName}
                        </Link>
                        {message.createdAt ? (
                          <time dateTime={message.createdAt.toISOString()}>
                            {new Intl.DateTimeFormat(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            }).format(message.createdAt)}
                          </time>
                        ) : (
                          <span>Sending…</span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90">
                        {message.text}
                      </p>
                    </div>
                  </article>
                ))}
                <div ref={endRef} />
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <label htmlFor="team-chat-input" className="text-xs uppercase tracking-[0.2em] text-white/50">
                  Message
                </label>
                <textarea
                  id="team-chat-input"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Share a note with your teammates…"
                  className="min-h-[96px] w-full resize-y rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300/40"
                  maxLength={2000}
                  disabled={isSending}
                  required
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-white/40">Only members of {team.name} can see this chat.</span>
                  <button
                    type="submit"
                    className="btn-primary inline-flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-60"
                    disabled={isSending}
                  >
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    <span>{isSending ? 'Sending…' : 'Send message'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
