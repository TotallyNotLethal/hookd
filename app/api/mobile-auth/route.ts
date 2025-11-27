import { NextResponse } from 'next/server';

import { getAdminAuth } from '@/lib/server/firebaseAdminAuth';

export const runtime = 'nodejs';

const TWO_WEEKS_IN_MS = 1000 * 60 * 60 * 24 * 14;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Missing token parameter.' }, { status: 400 });
  }

  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);

    if (!decoded?.uid) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const sessionCookie = await auth.createSessionCookie(token, { expiresIn: TWO_WEEKS_IN_MS });

    const response = NextResponse.redirect(new URL('/', request.url));
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
