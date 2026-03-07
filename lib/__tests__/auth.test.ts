import assert from 'node:assert/strict';
import test from 'node:test';

import { extractSessionCookie } from '@/lib/server/auth';

test('extractSessionCookie returns null when cookie header is missing', () => {
  assert.equal(extractSessionCookie(null), null);
});

test('extractSessionCookie extracts session token from cookie header', () => {
  const cookie = 'other=abc; session=token-123; another=value';
  assert.equal(extractSessionCookie(cookie), 'token-123');
});

test('extractSessionCookie returns null when session cookie is absent', () => {
  const cookie = 'other=abc; another=value';
  assert.equal(extractSessionCookie(cookie), null);
});
