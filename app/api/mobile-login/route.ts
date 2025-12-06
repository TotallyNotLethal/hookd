import { NextResponse } from 'next/server';

import { getAdminAuth } from '@/lib/server/firebaseAdminAuth';

export const runtime = 'nodejs';

const TWO_WEEKS_IN_MS = 1000 * 60 * 60 * 24 * 14;
const TWO_WEEKS_IN_SECONDS = Math.floor(TWO_WEEKS_IN_MS / 1000);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const idToken = typeof body?.idToken === 'string' ? body.idToken : null;
    const redirectPath = typeof body?.redirectPath === 'string' ? body.redirectPath : undefined;

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken in request body.' }, { status: 400 });
    }

    const auth = getAdminAuth();
    const hasCredential = Boolean(auth.app.options?.credential);
    const decoded = await auth.verifyIdToken(idToken, hasCredential);

    if (!decoded?.uid) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: TWO_WEEKS_IN_MS });

    const safeRedirectPath = redirectPath?.startsWith('/') ? redirectPath : '/app';
    const loginUrl = new URL('/api/mobile-auth', request.url);
    loginUrl.searchParams.set('session', sessionCookie);
    loginUrl.searchParams.set('redirect', safeRedirectPath);

    const response = NextResponse.json({
      uid: decoded.uid,
      sessionCookie,
      loginUrl: loginUrl.toString(),
      expiresInSeconds: TWO_WEEKS_IN_SECONDS,
    });

    response.cookies.set('session', sessionCookie, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: TWO_WEEKS_IN_SECONDS,
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
}
