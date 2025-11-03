'use client';

import Modal from '@/components/ui/Modal';
import { ensureUserProfile, type HookdUser } from '@/lib/firestore';
import { app, db } from '@/lib/firebaseClient';
import { validateAndNormalizeUsername } from '@/lib/username';
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

export const LOGIN_REDIRECT_STORAGE_KEY = 'hookd:auth:loginRedirect';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export default function LoginModal({ open, onClose }: LoginModalProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const handledAuthRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  const resetAuthHandling = useCallback(() => {
    handledAuthRef.current = false;
    setAuthUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) {
      setError(null);
      resetAuthHandling();
    }
  }, [open, resetAuthHandling]);

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

      let targetRoute: string | null = null;

      try {
        await ensureUserProfile(user);

        const profileSnap = await getDoc(doc(db, 'users', user.uid));
        const profileData = profileSnap.exists()
          ? (profileSnap.data() as HookdUser)
          : null;
        let username = '';
        if (typeof profileData?.username === 'string') {
          try {
            username = validateAndNormalizeUsername(profileData.username);
          } catch {
            username = '';
          }
        }
        const displayNameRaw =
          (typeof profileData?.displayName === 'string'
            ? profileData.displayName
            : user.displayName) ?? '';
        const displayName = displayNameRaw.trim();
        const displayIsDefault = !displayName || displayName.toLowerCase() === 'angler';

        if (!username) {
          console.log('[Auth] Missing username, redirecting to profile setup.');
          targetRoute = '/profile?setup=1';
        } else if (displayIsDefault) {
          targetRoute = '/profile?setup=1';
        } else {
          targetRoute = '/feed';
        }
      } catch (profileError) {
        console.error('[Auth] ⚠️ Failed to finish signup flow:', profileError);
        setError('We had trouble finishing sign-in. Please try again.');
        resetAuthHandling();
        return;
      }

      try {
        if (targetRoute) {
          await router.replace(targetRoute);
        }
      } finally {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
        }
        onClose();
      }
    },
    [onClose, resetAuthHandling, router],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const auth = getAuth(app);
    let unsubscribeAuth: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      console.log('[Auth] Starting auth initialization...');

      let persistenceToUse = browserLocalPersistence;
      try {
        const ua = navigator.userAgent || '';
        const isChromeMobile = /Chrome/i.test(ua) && /Mobi|Android/i.test(ua);
        if (isChromeMobile) {
          console.log('[Auth] Detected Chrome mobile – forcing indexedDBLocalPersistence.');
          persistenceToUse = indexedDBLocalPersistence;
        }
      } catch (err) {
        console.warn('[Auth] Error detecting userAgent for mobile/browser check:', err);
      }

      try {
        await setPersistence(auth, persistenceToUse);
        console.log(
          '[Auth] Persistence set to:',
          persistenceToUse === browserLocalPersistence
            ? 'browserLocalPersistence'
            : 'indexedDBLocalPersistence',
        );
      } catch (err) {
        console.warn(
          '[Auth] setPersistence failed with',
          persistenceToUse,
          '— fallback to indexedDBLocalPersistence if not already.',
        );
        await setPersistence(auth, indexedDBLocalPersistence);
        console.log('[Auth] Persistence fallback to indexedDBLocalPersistence.');
      }

      console.log('[Auth] Attempting getRedirectResult...');
      const result: UserCredential | null = await getRedirectResult(auth).catch((err) => {
        console.error('[Auth] ❌ getRedirectResult error:', err);
        setError('Google sign-in failed during redirect. Please try again.');
        resetAuthHandling();
        return null;
      });

      if (cancelled) {
        return;
      }

      if (result && result.user) {
        console.log('[Auth] 🎯 Redirect result user found:', result.user.uid);
        setAuthUser(result.user);
        await handleAuthSuccess(result.user);
        return;
      } else {
        console.log('[Auth] No user from redirect result.');
      }

      console.log('[Auth] Setting up onAuthStateChanged listener...');
      unsubscribeAuth = onAuthStateChanged(auth, (user) => {
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
    })();

    return () => {
      cancelled = true;
      if (typeof unsubscribeAuth === 'function') {
        unsubscribeAuth();
      }
    };
  }, [handleAuthSuccess, open, resetAuthHandling]);

  const isMobileOrStandalone = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isMobile = /Mobi|Android/i.test(ua);
    const isStandalone =
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator as any).standalone === true;
    return isMobile || isStandalone;
  }, []);

  const isProcessingAuth = loading || !!authUser;

  const handleClose = useCallback(() => {
    if (!isProcessingAuth) {
      onClose();
    }
  }, [isProcessingAuth, onClose]);

  const startGoogleSignIn = useCallback(async () => {
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
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(LOGIN_REDIRECT_STORAGE_KEY, '1');
        }
        await signInWithRedirect(auth, provider);
        return;
      }

      console.log('[Auth] Desktop flow — using popup.');
      await setPersistence(auth, browserLocalPersistence);
      const res = (await signInWithPopup(auth, provider)) as UserCredential;
      console.log('[Auth] Popup result returned, user:', res.user?.uid);
      await handleAuthSuccess(res.user);
    } catch (err) {
      console.error('[Auth] ❌ Google login failed:', err);
      setError('Google sign-in failed. Please try again.');
      resetAuthHandling();
      if (!useRedirect) {
        setLoading(false);
      }
      return;
    }

    if (!useRedirect && !handledAuthRef.current) {
      setLoading(false);
    }
  }, [handleAuthSuccess, isMobileOrStandalone, resetAuthHandling]);

  const authStatusMessage = useMemo(() => {
    if (!isProcessingAuth) {
      return 'Continue with Google';
    }

    return authUser ? 'Finishing sign-in…' : 'Please wait…';
  }, [authUser, isProcessingAuth]);

  return (
    <Modal open={open} onClose={handleClose} labelledBy={titleId} describedBy={descriptionId}>
      <div className="relative w-full max-w-md">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          aria-label="Close sign in modal"
          disabled={isProcessingAuth}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="p-8">
          <h1 id={titleId} className="text-3xl font-semibold mb-2">
            Welcome
          </h1>
          <p id={descriptionId} className="text-white/70 mb-6">
            Sign in to continue to Hook&apos;d
          </p>
          <button
            type="button"
            onClick={startGoogleSignIn}
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
                <span>{authStatusMessage}</span>
              </span>
            ) : (
              'Continue with Google'
            )}
          </button>
          {error ? (
            <p className="mt-4 text-center text-sm text-red-400">{error}</p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
