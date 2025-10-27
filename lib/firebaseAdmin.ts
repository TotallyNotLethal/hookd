import {
  App,
  AppOptions,
  cert,
  getApps,
  initializeApp,
  applicationDefault,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

let adminApp: App | null = null;

const STORAGE_BUCKET = 'hookd-b7ae6.firebasestorage.app';

function initializeAdminApp() {
  if (adminApp) {
    return adminApp;
  }

  const existing = getApps();
  if (existing.length) {
    adminApp = existing[0]!;
    return adminApp;
  }

  let credential: AppOptions['credential'] | undefined;
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
    } else {
      credential = applicationDefault();
    }
  } catch (error) {
    console.warn('Firebase admin credential initialization failed', error);
    credential = undefined;
  }

  const options: AppOptions = {
    projectId: process.env.FIREBASE_PROJECT_ID || 'hookd-b7ae6',
    storageBucket: STORAGE_BUCKET,
  };

  if (credential) {
    options.credential = credential;
  }

  adminApp = initializeApp(options);

  return adminApp;
}

export function getAdminApp() {
  return initializeAdminApp();
}

export const adminDb = getFirestore(initializeAdminApp());
export const adminStorage = getStorage(initializeAdminApp()).bucket(STORAGE_BUCKET);
