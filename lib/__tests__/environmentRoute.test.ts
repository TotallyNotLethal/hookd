import { strict as assert } from 'node:assert';
import test from 'node:test';

import { GET } from '@/app/api/environment/route';
import { MAX_LEAD_LAG_DAYS } from '@/lib/environmentLimits';

test('GET returns 422 when timestamp is outside supported lead/lag', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called for out-of-range timestamps');
  }) as typeof fetch;

  try {
    const timestamp = new Date(
      Date.now() + (MAX_LEAD_LAG_DAYS + 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    const params = new URLSearchParams({
      lat: '10',
      lng: '20',
      timestamp,
    });

    const response = await GET(
      new Request(`http://localhost/api/environment?${params.toString()}`),
    );

    assert.equal(response.status, 422);
    const body = await response.json();
    assert.deepEqual(body, { capture: null, slices: [] });
    assert.equal(fetchCalled, false);
  } finally {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
    }
  }
});
