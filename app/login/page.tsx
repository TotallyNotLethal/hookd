'use client';
import { app } from '@/lib/firebaseClient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  User,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { ensureUserProfile } from '@/lib/firestore';

export default function Page() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const handledAuthRef = useRef(false);

  const handleAuthSuccess = useCallback(
    async (user: User | null) => {
      if (!user || handledAuthRef.current) return;
      handledAuthRef.current = true;
      await ensureUserProfile(user);
      router.replace('/feed');
    },
    [router],
  );

  useEffect(() => {
    const auth = getAuth(app);

    // Handle redirect results from mobile login
    getRedirectResult(auth)
      .then(async (credential) => {
        if (credential?.user) {
          await handleAuthSuccess(credential.user);
          return;
        }

        if (auth.currentUser) {
          await handleAuthSuccess(auth.currentUser);
        }
      })
      .catch((err) => {
        console.error('Google redirect login failed', err);
        setError('Google sign-in failed. Please try again.');
      });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) handleAuthSuccess(user);
    });

    return () => unsubscribe();
  }, [handleAuthSuccess]);

  // Detect if we're on mobile or in a standalone PWA
  const isMobileOrStandalone = () => {
    if (typeof window === 'undefined') return false;

    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const isStandalone =
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator as any).standalone === true;

    return isMobile || isStandalone;
  };

  async function google() {
    setError(null);
    setLoading(true);

    try {
      const auth = getAuth(app);
      const provider = new GoogleAuthProvider();

      // Use redirect on mobile or standalone PWAs — popup for desktop
      if (isMobileOrStandalone()) {
        try {
          await setPersistence(auth, browserLocalPersistence);
        } catch (err) {
          console.warn('Falling back to IndexedDB persistence for mobile', err);
          await setPersistence(auth, indexedDBLocalPersistence);
        }
        await signInWithRedirect(auth, provider);
        return;
      }

      // Desktop flow with popup
      await setPersistence(auth, browserLocalPersistence);
      const res = await signInWithPopup(auth, provider);
      await handleAuthSuccess(res.user);
    } catch (err: any) {
      console.error('Google login failed', err);
      setError('Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md glass rounded-3xl p-8">
        <h1 className="text-3xl font-semibold mb-2">Welcome</h1>
        <p className="text-white/70 mb-6">Sign in to continue to Hook&apos;d</p>

        <button
          onClick={google}
          className="btn-primary w-full"
          disabled={loading}
        >
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>

        {error && (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        )}
      </div>
    </main>
  );
}
