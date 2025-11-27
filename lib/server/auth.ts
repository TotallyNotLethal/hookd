import 'server-only';

import { getAdminAuth } from './firebaseAdminAuth';

export type AuthenticatedUser = { uid: string };

let testAuthOverride:
  | ((request: Request) => Promise<AuthenticatedUser | null> | AuthenticatedUser | null)
  | null = null;

export function setAuthTestOverride(
  override?: (request: Request) => Promise<AuthenticatedUser | null> | AuthenticatedUser | null,
) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test hooks are not available in production.');
  }
  testAuthOverride = override ?? null;
}

export async function requireAuth(request: Request): Promise<AuthenticatedUser> {
  if (testAuthOverride) {
    const result = await testAuthOverride(request);
    if (result && result.uid) {
      return result;
    }
    const error = new Error('Unauthorized');
    (error as Error & { code?: string }).code = 'unauthorized';
    throw error;
  }

  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    const error = new Error('Missing authorization token.');
    (error as Error & { code?: string }).code = 'unauthorized';
    throw error;
  }

  const token = header.slice(7).trim();
  if (!token) {
    const error = new Error('Missing authorization token.');
    (error as Error & { code?: string }).code = 'unauthorized';
    throw error;
  }

  try {
    const auth = getAdminAuth();
    const hasCredential = Boolean(auth.app.options?.credential);
    // Revocation checks require admin credentials. In local development the
    // Firebase admin SDK is often initialised without a service account, which
    // would cause verifyIdToken(..., true) to throw even for valid sessions.
    // Skip the revocation check when no credential is configured so that
    // authenticated users can still call the API in that environment.
    const decoded = await auth.verifyIdToken(token, hasCredential);
    if (!decoded?.uid) {
      throw new Error('Token missing uid');
    }
    return { uid: decoded.uid };
  } catch (error) {
    const err = new Error('Unauthorized');
    (err as Error & { code?: string }).code = 'unauthorized';
    throw err;
  }
}
