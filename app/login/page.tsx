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
  const [authUser, setAuthUser] = useState<User | null>(null);
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
      setAuthUser(user);
      setLoading(true);
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

        if (!username) {
          console.log('[Auth] Missing username, redirecting to profile setup.');
          await router.replace('/profile?setup=1');
          return;
        }

        if (displayIsDefault) {
          await router.replace('/profile?setup=1');
        } else {
          await router.replace('/feed');
        }
      } catch (profileError) {
        console.error('[Auth] ⚠️ Failed to inspect profile after signup:', profileError);
        await router.replace('/profile?setup=1');
      }
    },
    [router],
  );

  const resetAuthHandling = useCallback(() => {
    handledAuthRef.current = false;
    setAuthUser(null);
    setLoading(false);
  }, []);

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
        setAuthUser(result.user);
        await handleAuthSuccess(result.user);
        return;
      } else {
        console.log('[Auth] No user from redirect result.');
      }

      console.log('[Auth] Setting up onAuthStateChanged listener...');
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          console.log('[Auth] 🔄 onAuthStateChanged fired, user:', user.uid);
          setAuthUser(user);
          if (!handledAuthRef.current) {
            setLoading(true);
          }
          handleAuthSuccess(user);
        } else {
          console.log('[Auth] onAuthStateChanged fired, no user.');
          resetAuthHandling();
        }
      });

      return () => unsubscribe();
    })();
  }, [handleAuthSuccess, resetAuthHandling]);

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

    const useRedirect = isMobileOrStandalone();

    try {
      const auth = getAuth(app);
      const provider = new GoogleAuthProvider();

      if (useRedirect) {
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
      resetAuthHandling();
      return;
    }

    if (!useRedirect && !handledAuthRef.current) {
      setLoading(false);
    }
  }

  const isProcessingAuth = loading || !!authUser;

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md glass rounded-3xl p-8">
        <h1 className="text-3xl font-semibold mb-2">Welcome</h1>
        <p className="text-white/70 mb-6">Sign in to continue to Hook&apos;d</p>

        <button
          onClick={google}
          className="btn-primary w-full"
          disabled={isProcessingAuth}
        >
          {isProcessingAuth ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                ></path>
              </svg>
              <span>{authUser ? 'Finishing sign-in…' : 'Please wait…'}</span>
            </span>
          ) : (
            'Continue with Google'
          )}
        </button>

        {error && (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        )}
      </div>
    </main>
  );
}
