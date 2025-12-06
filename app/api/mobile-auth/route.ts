import { NextResponse } from 'next/server';

import { getAdminAuth } from '@/lib/server/firebaseAdminAuth';

export const runtime = 'nodejs';

const TWO_WEEKS_IN_MS = 1000 * 60 * 60 * 24 * 14;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const sessionParam = searchParams.get('session');
  const redirect = searchParams.get('redirect');

  if (!token && !sessionParam) {
    return NextResponse.json({ error: 'Missing token or session parameter.' }, { status: 400 });
  }

  try {
    const auth = getAdminAuth();
    const hasCredential = Boolean(auth.app.options?.credential);

    const decoded = sessionParam
      ? await auth.verifySessionCookie(sessionParam, hasCredential)
      : await auth.verifyIdToken(token!, hasCredential);

    if (!decoded?.uid) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const sessionCookie =
      sessionParam ?? (await auth.createSessionCookie(token!, { expiresIn: TWO_WEEKS_IN_MS }));

    const redirectPath = redirect?.startsWith('/') ? redirect : '/app';
    const response = NextResponse.redirect(new URL(redirectPath, request.url));
    response.cookies.set('session', sessionCookie, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(TWO_WEEKS_IN_MS / 1000),
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
}
