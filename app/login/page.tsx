'use client';
import { app, db } from '@/lib/firebaseClient';
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
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { ensureUserProfile, type HookdUser } from '@/lib/firestore';

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
      console.log('[Auth] ✅ Auth success, user-uid:', user.uid);
      await ensureUserProfile(user);
      try {
        const profileSnap = await getDoc(doc(db, 'users', user.uid));
        const profileData = profileSnap.exists()
          ? (profileSnap.data() as HookdUser)
          : null;
        const username =
          typeof profileData?.username === 'string'
            ? profileData.username.trim()
            : '';
        const displayNameRaw =
          (typeof profileData?.displayName === 'string'
            ? profileData.displayName
            : user.displayName) ?? '';
        const displayName = displayNameRaw.trim();
        const displayIsDefault = !displayName || displayName.toLowerCase() === 'angler';

        if (!username || displayIsDefault) {
          router.replace('/profile?setup=1');
        } else {
          router.replace('/feed');
        }
      } catch (profileError) {
        console.error('[Auth] ⚠️ Failed to inspect profile after signup:', profileError);
        router.replace('/profile?setup=1');
      }
    },
    [router],
  );

  useEffect(() => {
    const auth = getAuth(app);

    (async () => {
      console.log('[Auth] Starting auth initialization...');

      // Determine persistence type for this context
      let persistenceToUse = browserLocalPersistence;
      try {
        // Detect Chrome mobile or other restrictive browser
        const ua = navigator.userAgent || '';
        const isChromeMobile =
          /Chrome/i.test(ua) && /Mobi|Android/i.test(ua);
        if (isChromeMobile) {
          console.log('[Auth] Detected Chrome mobile – forcing indexedDBLocalPersistence.');
          persistenceToUse = indexedDBLocalPersistence;
        }
      } catch (err) {
        console.warn('[Auth] Error detecting userAgent for mobile/browser check:', err);
      }

      try {
        await setPersistence(auth, persistenceToUse);
        console.log('[Auth] Persistence set to:', persistenceToUse === browserLocalPersistence ? 'browserLocalPersistence' : 'indexedDBLocalPersistence');
      } catch (err) {
        console.warn('[Auth] setPersistence failed with', persistenceToUse, '— fallback to indexedDBLocalPersistence if not already.');
        await setPersistence(auth, indexedDBLocalPersistence);
        console.log('[Auth] Persistence fallback to indexedDBLocalPersistence.');
      }

      console.log('[Auth] Attempting getRedirectResult...');
      const result: UserCredential | null = await getRedirectResult(auth).catch((err) => {
        console.error('[Auth] ❌ getRedirectResult error:', err);
        setError('Google sign-in failed during redirect. Please try again.');
        return null;
      });

      if (result && result.user) {
        console.log('[Auth] 🎯 Redirect result user found:', result.user.uid);
        await handleAuthSuccess(result.user);
        return;
      } else {
        console.log('[Auth] No user from redirect result.');
      }

      console.log('[Auth] Setting up onAuthStateChanged listener...');
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          console.log('[Auth] 🔄 onAuthStateChanged fired, user:', user.uid);
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
    const ua = navigator.userAgent || '';
    const isMobile = /Mobi|Android/i.test(ua);
    const isStandalone =
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator as any).standalone === true;
    return isMobile || isStandalone;
  };

  async function google() {
    setError(null);
    setLoading(true);
    console.log('[Auth] Google sign-in clicked — starting flow.');

    try {
      const auth = getAuth(app);
      const provider = new GoogleAuthProvider();

      if (isMobileOrStandalone()) {
        console.log('[Auth] Detected mobile/standalone — using redirect flow.');
        await setPersistence(auth, indexedDBLocalPersistence);
        console.log('[Auth] Persistence set (redirect) to indexedDBLocalPersistence.');
        await signInWithRedirect(auth, provider);
        // do not continue code past this – browser will redirect away
        return;
      }

      console.log('[Auth] Desktop flow — using popup.');
      await setPersistence(auth, browserLocalPersistence);
      const res = (await signInWithPopup(auth, provider)) as UserCredential;
      console.log('[Auth] Popup result returned, user:', res.user?.uid);
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
