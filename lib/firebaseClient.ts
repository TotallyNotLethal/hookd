'use client';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  type User,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// --- Config
const firebaseConfig = {
  apiKey: 'AIzaSyDmF3UWRSfMILLTMmzU1_PishWAZNlphtk',
  authDomain: 'hookd.fish',
  projectId: 'hookd-b7ae6',
  storageBucket: 'hookd-b7ae6.firebasestorage.app',
  messagingSenderId: '627079728513',
  appId: '1:627079728513:web:285951645efe65a065ac80',
  measurementId: 'G-ZRHCCWK1BQ',
};

// --- Ensure single instance
let app: FirebaseApp;
if (!getApps().length) app = initializeApp(firebaseConfig);
else app = getApp();

// --- Always safe exports (SSR-compatible)
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

let authPersistencePromise: Promise<void> | null = null;

export function ensureAuthPersistence(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (!authPersistencePromise) {
    authPersistencePromise = (async () => {
      try {
        await setPersistence(auth, indexedDBLocalPersistence);
      } catch (error) {
        console.warn('[Auth] indexedDBLocalPersistence unavailable, falling back.', error);
        await setPersistence(auth, browserLocalPersistence);
      }
    })();
  }

  return authPersistencePromise;
}

export async function waitForAuthenticatedUser(): Promise<User | null> {
  await ensureAuthPersistence();

  if (auth.currentUser) {
    return auth.currentUser;
  }

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

// --- Guard storage behind a browser check
let _storage: FirebaseStorage | null = null;
export const getStorageSafe = (): FirebaseStorage | null => {
  if (typeof window === 'undefined') return null;
  if (!_storage) {
    _storage = getStorage(app, 'gs://hookd-b7ae6.firebasestorage.app');
  }
  return _storage;
};

// For convenience, still export `storage` (lazy initialized)
export const storage = typeof window !== 'undefined'
  ? getStorage(app, 'gs://hookd-b7ae6.firebasestorage.app')
  : null;

if (typeof window !== 'undefined') {
  void ensureAuthPersistence();
}

// --- Export app for utilities
export { app };
