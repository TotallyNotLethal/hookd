'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { app } from '@/lib/firebaseClient';
import { HookdUser, subscribeToUser } from '@/lib/firestore';
import {
  Home,
  PlusCircle,
  UserRound,
  LogIn,
  LogOut,
  Map as MapIcon,
  NotebookPen,
  Fish,
  Menu,
  X,
  MessageCircle,
  MessageSquare,
} from 'lucide-react';

export default function NavBar() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [profile, setProfile] = useState<HookdUser | null>(null);

  useEffect(() => {
    const auth = getAuth(app);
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = undefined;
      }

      if (u) {
        unsubscribeProfile = subscribeToUser(u.uid, (data) => {
          setProfile(data);
        });
      } else {
        setProfile(null);
      }
    });

    return () => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
      unsubscribeAuth();
    };
  }, []);

  const tabs = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/map', icon: MapIcon, label: 'Map' },
    { href: '/chat', icon: MessageSquare, label: 'Chat' },
    { href: '/messages', icon: MessageCircle, label: 'Messages' },
    { href: '/feed?compose=1', icon: PlusCircle, label: 'Add Catch' },
    { href: '/logbook', icon: NotebookPen, label: 'Logbook' },
    { href: '/profile', icon: UserRound, label: 'Profile' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur border-b border-white/10">
      <div className="container py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.svg" alt="Hook'd" width={36} height={36} className="rounded-xl shadow-glow" />
            <span className="text-xl font-semibold tracking-tight">Hook&apos;d</span>
          </Link>

          {/* Desktop actions */}
          <div className="hidden sm:flex items-center gap-3">
            <Link href="/map" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Map</Link>
            <Link href="/logbook" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Logbook</Link>
            <Link href="/chat" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Chat</Link>
            <Link href="/messages" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Messages</Link>
            <Link href="/tools/fish-identifier" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Fish ID</Link>
            {!user ? (
              <>
                <Link href="/login" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Log in</Link>
                <Link href="/login" className="btn-primary">Sign up</Link>
              </>
            ) : (
              <>
                <Link href="/feed" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Feed</Link>
                <Link href="/messages" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Messages</Link>
                <Link href="/profile" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Profile</Link>
                <button
                  onClick={() => signOut(getAuth(app))}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
                <Image
                  src={profile?.photoURL || user?.photoURL || '/logo.svg'}
                  alt={profile?.displayName || user?.displayName || 'Account avatar'}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              </>
            )}
          </div>

          {/* Mobile menu trigger */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="sm:hidden inline-flex items-center justify-center rounded-xl border border-white/15 p-2 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile drawer menu */}
        <div className="sm:hidden">
          {/* Overlay */}
          {isMobileMenuOpen ? (
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-30 bg-black/40"
            />
          ) : null}

          <nav
            className={`fixed inset-y-0 left-0 z-40 w-72 max-w-full transform border-r border-white/10 bg-slate-950/80 px-6 py-6 transition-transform duration-300 ease-in-out backdrop-blur ${
              isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            aria-hidden={!isMobileMenuOpen}
          >
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-3" onClick={() => setIsMobileMenuOpen(false)}>
                <Image src="/logo.svg" alt="Hook'd" width={32} height={32} className="rounded-xl shadow-glow" />
                <span className="text-lg font-semibold tracking-tight">Hook&apos;d</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="inline-flex items-center justify-center rounded-xl border border-white/15 p-2 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <ul className="mt-6 flex flex-col gap-2">
              {tabs.map((t) => {
                const baseHref = t.href.split('?')[0];
                const active = baseHref === '/' ? pathname === '/' : pathname.startsWith(baseHref);
                const Icon = t.icon;
                return (
                  <li key={t.href}>
                    <Link
                      href={t.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition bg-slate-900/95 shadow-inner ${
                        active
                          ? 'ring-1 ring-white/20 text-white'
                          : 'hover:bg-slate-900/95 hover:ring-1 hover:ring-white/10'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{t.label}</span>
                    </Link>
                  </li>
                );
              })}
              <li>
                <Link
                  href="/tools/fish-identifier"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition bg-slate-900/80 shadow-inner hover:bg-slate-900/95 hover:ring-1 hover:ring-white/10"
                >
                  <Fish className="h-5 w-5" />
                  <span>Fish ID</span>
                </Link>
              </li>
              {!user ? (
                <li>
                  <Link
                    href="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition bg-slate-900/80 shadow-inner hover:bg-slate-900/95 hover:ring-1 hover:ring-white/10"
                  >
                    <LogIn className="h-5 w-5" />
                    <span>Login</span>
                  </Link>
                </li>
              ) : (
                <li>
                  <button
                    onClick={() => {
                      signOut(getAuth(app));
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition bg-slate-900/80 shadow-inner hover:bg-slate-900/95 hover:ring-1 hover:ring-white/10"
                  >
                    <LogOut className="h-5 w-5" />
                    <span>Logout</span>
                  </button>
                </li>
              )}
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}
