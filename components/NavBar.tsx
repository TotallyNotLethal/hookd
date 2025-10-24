'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { app } from '@/lib/firebaseClient';
import { Home, PlusCircle, UserRound, LogIn, LogOut } from 'lucide-react';

export default function NavBar() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const auth = getAuth(app);
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  const tabs = [
    { href: '/feed', icon: Home, label: 'Home' },
    { href: '/feed?compose=1', icon: PlusCircle, label: 'Add' },
    { href: '/profile', icon: UserRound, label: 'Profile' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-30">
      <div className="container py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.svg" alt="Hook'd" width={36} height={36} className="rounded-xl shadow-glow" />
          <span className="text-xl font-semibold tracking-tight">Hook&apos;d</span>
        </Link>

        {/* Desktop actions */}
        <div className="hidden sm:flex items-center gap-3">
          {!user ? (
            <>
              <Link href="/login" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5">Log in</Link>
              <Link href="/login" className="btn-primary">Sign up</Link>
            </>
          ) : (
            <>
              <Link href="/feed" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5">Feed</Link>
              <Link href="/profile" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5">Profile</Link>
              <button
                onClick={() => signOut(getAuth(app))}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
              <Image
                src={user.photoURL || '/logo.svg'}
                alt="avatar"
                width={32}
                height={32}
                className="rounded-full"
              />
            </>
          )}
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Bottom nav for mobile */}
      <nav className="sm:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
        <ul className="flex items-center gap-2 rounded-2xl glass px-3 py-2">
          {tabs.map((t) => {
            const active = pathname.startsWith(t.href.split('?')[0]);
            const Icon = t.icon;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm">{t.label}</span>
                </Link>
              </li>
            );
          })}
          {!user ? (
            <li>
              <Link href="/login" className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5">
                <LogIn className="w-5 h-5" />
                <span className="text-sm">Login</span>
              </Link>
            </li>
          ) : (
            <li>
              <button
                onClick={() => signOut(getAuth(app))}
                className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5"
              >
                <LogOut className="w-5 h-5" />
                <span className="text-sm">Logout</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}
