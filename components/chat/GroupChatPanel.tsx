'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Loader2, Send } from 'lucide-react';

import { auth } from '@/lib/firebaseClient';
import {
  GroupChatMessage,
  sendGroupChatMessage,
  subscribeToGroupChatMessages,
} from '@/lib/firestore';

export type GroupChatPanelProps = {
  groupId: string;
  groupName?: string;
};

export default function GroupChatPanel({ groupId, groupName }: GroupChatPanelProps) {
  const [authUser] = useAuthState(auth);
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!groupId) return undefined;
    setLoading(true);
    setError(null);
    const unsubscribe = subscribeToGroupChatMessages(
      groupId,
      (next) => {
        setMessages(next);
        setLoading(false);
      },
      {
        onError: (err) => {
          console.error('Failed to load group chat messages', err);
          setError('Unable to load chat messages right now.');
          setLoading(false);
        },
      },
    );

    return () => unsubscribe();
  }, [groupId]);

  useEffect(() => {
    if (!endRef.current) return;
    endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authUser?.uid) {
      setError('You must sign in to chat with the group.');
      return;
    }
    const normalized = input.trim();
    if (!normalized) return;
    try {
      setSending(true);
      await sendGroupChatMessage({
        groupId,
        uid: authUser.uid,
        displayName: authUser.displayName || 'Angler',
        text: normalized,
        isPro: Boolean((authUser as { isPro?: boolean }).isPro),
        photoURL: authUser.photoURL,
      });
      setInput('');
    } catch (err) {
      console.error('Failed to send message', err);
      setError('We could not send that message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/5">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">Group chat</p>
          <h2 className="text-lg font-semibold text-white">{groupName || 'Channel'}</h2>
        </div>
        {sending ? <Loader2 className="h-4 w-4 animate-spin text-white/60" /> : null}
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading chat…</span>
          </div>
        ) : error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-white/50">No messages yet. Start the conversation!</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((message) => (
              <li key={message.id} className="rounded-2xl bg-white/5 p-3">
                <p className="text-xs text-white/50">{message.displayName}</p>
                <p className="mt-1 text-sm text-white/90">{message.text}</p>
                <p className="mt-1 text-[11px] text-white/40">
                  {message.createdAt ? message.createdAt.toLocaleString() : 'Sending…'}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>
      <footer className="border-t border-white/10 p-3">
        {authUser ? (
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Send a message to your crew"
              className="h-11 flex-1 rounded-full border border-white/15 bg-slate-950/60 px-4 text-sm text-white placeholder:text-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-white transition hover:bg-brand-400 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <p className="text-sm text-white/60">
            <strong>Sign in</strong> to participate in the group chat.
          </p>
        )}
      </footer>
    </section>
  );
}
