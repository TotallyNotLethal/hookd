import 'server-only';

import { getAuth, type Auth } from 'firebase-admin/auth';

import { getAdminApp } from '../firebaseAdmin';

let adminAuth: Auth | null = null;

export function getAdminAuth(): Auth {
  if (adminAuth) return adminAuth;
  adminAuth = getAuth(getAdminApp());
  return adminAuth;
}
