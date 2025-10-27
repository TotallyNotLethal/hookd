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
  UserCredential,
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
      if (!user) {
        console.log('[Auth] handleAuthSuccess called but no user.');
        return;
      }
      if (handledAuthRef.current) {
        console.log('[Auth] Already handled user once, skipping.');
        return;
      }

      handledAuthRef.current = true;
      console.log('[Auth] ✅ Auth success, ensuring profile and redirecting...');
      await ensureUserProfile(user);
      router.replace('/feed');
    },
    [router],
  );

  useEffect(() => {
    const auth = getAuth(app);

    (async () => {
      console.log('[Auth] Setting persistence...');
      try {
        await setPersistence(auth, browserLocalPersistence);
        console.log('[Auth] Persistence set to browserLocalPersistence.');
      } catch (err) {
        console.warn('[Auth] browserLocalPersistence failed, falling back...', err);
        await setPersistence(auth, indexedDBLocalPersistence);
        console.log('[Auth] Persistence set to indexedDBLocalPersistence.');
      }

      console.log('[Auth] Checking redirect result...');
      const result: UserCredential | null = await getRedirectResult(auth).catch((err) => {
        console.error('[Auth] ❌ Redirect result error:', err);
        setError('Google sign-in failed. Please try again.');
        return null;
      });

      if (result && result.user) {
        console.log('[Auth] 🎯 Redirect result found user:', result.user.uid);
        await handleAuthSuccess(result.user);
        return;
      } else {
        console.log('[Auth] No redirect result user found.');
      }

      console.log('[Auth] Listening for auth state changes...');
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          console.log('[Auth] 🔄 onAuthStateChanged fired, user present:', user.uid);
          handleAuthSuccess(user);
        } else {
          console.log('[Auth] onAuthStateChanged fired, no user.');
        }
      });
      return () => unsubscribe();
    })();
  }, [handleAuthSuccess]);

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
    console.log('[Auth] Google sign-in started...');

    try {
      const auth = getAuth(app);
      const provider = new GoogleAuthProvider();

      if (isMobileOrStandalone()) {
        console.log('[Auth] Detected mobile or standalone, using redirect...');
        try {
          await setPersistence(auth, browserLocalPersistence);
        } catch (err) {
          console.warn('[Auth] browserLocalPersistence unavailable, using IndexedDB.', err);
          await setPersistence(auth, indexedDBLocalPersistence);
        }
        await signInWithRedirect(auth, provider);
        return;
      }

      console.log('[Auth] Using popup login (desktop)...');
      await setPersistence(auth, browserLocalPersistence);
      const res = (await signInWithPopup(auth, provider)) as UserCredential;
      console.log('[Auth] Popup result user:', res.user?.uid);
      await handleAuthSuccess(res.user);
    } catch (err: any) {
      console.error('[Auth] ❌ Google login failed:', err);
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
