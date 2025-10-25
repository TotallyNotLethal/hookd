'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { app } from '@/lib/firebaseClient';
import { Home, PlusCircle, UserRound, LogIn, LogOut, Map as MapIcon, NotebookPen, Fish } from 'lucide-react';

export default function NavBar() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const auth = getAuth(app);
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  const tabs = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/map', icon: MapIcon, label: 'Map' },
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
            <Link href="/tools/fish-identifier" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Fish ID</Link>
            {!user ? (
              <>
                <Link href="/login" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Log in</Link>
                <Link href="/login" className="btn-primary">Sign up</Link>
              </>
            ) : (
              <>
                <Link href="/feed" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Feed</Link>
                <Link href="/profile" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Profile</Link>
                <button
                  onClick={() => signOut(getAuth(app))}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
                <Image
                  src={user.photoURL || '/logo.svg'}
                  alt="Account avatar"
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              </>
            )}
          </div>
        </div>

        {/* Mobile actions */}
        <nav className="sm:hidden mt-4 w-full">
          <ul className="flex w-full items-center justify-between gap-2 rounded-2xl bg-slate-900/60 px-3 py-2 border border-white/10 backdrop-blur">
            {tabs.map((t) => {
              const baseHref = t.href.split('?')[0];
              const active = baseHref === '/' ? pathname === '/' : pathname.startsWith(baseHref);
              const Icon = t.icon;
              return (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl transition ${
                      active ? 'bg-white/15 text-white' : 'hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm">{t.label}</span>
                  </Link>
                </li>
              );
            })}
            <li>
              <Link href="/tools/fish-identifier" className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10">
                <Fish className="w-5 h-5" />
                <span className="text-sm">Fish ID</span>
              </Link>
            </li>
            {!user ? (
              <li>
                <Link href="/login" className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10">
                  <LogIn className="w-5 h-5" />
                  <span className="text-sm">Login</span>
                </Link>
              </li>
            ) : (
              <li>
                <button
                  onClick={() => signOut(getAuth(app))}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="text-sm">Logout</span>
                </button>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
