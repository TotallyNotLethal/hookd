'use client';

import Link from 'next/link';
import { useAuthState } from 'react-firebase-hooks/auth';
import { MessageCircle, MessageSquarePlus } from 'lucide-react';

import NavBar from '@/components/NavBar';
import LoginButton from '@/components/auth/LoginButton';
import DirectMessageThreadsList from '@/components/direct-messages/DirectMessageThreadsList';
import { auth } from '@/lib/firebaseClient';

export default function MessagesPage() {
  const [user] = useAuthState(auth);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <NavBar />
      <section className="container pt-nav pb-16">
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

          <div className="glass border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-slate-950/50">
            {!user ? (
              <div className="p-8 text-center text-sm text-white/70">
                <p className="mb-4">Sign in to view and send private messages.</p>
                <LoginButton className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm">
                  <MessageSquarePlus className="h-4 w-4" />
                  Log in to message anglers
                </LoginButton>
              </div>
            ) : (
              <div className="p-6">
                <DirectMessageThreadsList currentUserId={user.uid} className="space-y-4" />
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
