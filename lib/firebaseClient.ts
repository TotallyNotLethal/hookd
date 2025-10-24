'use client';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// --- Config
const firebaseConfig = {
  apiKey: 'AIzaSyDmF3UWRSfMILLTMmzU1_PishWAZNlphtk',
  authDomain: 'hookd-b7ae6.firebaseapp.com',
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

// --- Export DB/Auth immediately (safe on both server + client)
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// --- Defer Storage creation until we’re in the browser
export let storage: FirebaseStorage | null = null;
if (typeof window !== 'undefined') {
  storage = getStorage(app, 'gs://hookd-b7ae6.firebasestorage.app');
}

// --- Export app for utilities
export { app };
