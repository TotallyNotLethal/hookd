import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getOfflineQueueState,
  queueCatch,
  queueForecastRequest,
  resetOfflineStorageForTests,
  syncQueuedCatches,
  syncQueuedForecastRequests,
} from '@/lib/offlineStorage';

const originalFetch = globalThis.fetch;

const okResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

test.beforeEach(async () => {
  await resetOfflineStorageForTests();
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

test('queues catches offline and syncs when online', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return okResponse({ id: 'catch-1', updatedAt: new Date().toISOString() }, { status: 201 });
  }) as typeof fetch;

  await queueCatch({
    userId: 'user-1',
    method: 'POST',
    payload: {
      species: 'Bass',
      caughtAt: new Date().toISOString(),
      location: { waterbody: 'Lake' },
      sharing: { visibility: 'public', shareWithCommunity: false, shareLocationCoordinates: false },
    },
  });

  let state = await getOfflineQueueState();
  assert.equal(state.catchCount, 1);

  const result = await syncQueuedCatches({
    userId: 'user-1',
    getAuthToken: async () => 'token-123',
  });
  assert.equal(result.synced, 1);
  assert.equal(result.errors, 0);

  state = await getOfflineQueueState();
  assert.equal(state.catchCount, 0);
  assert.ok(calls[0].init);
  const headers = calls[0].init!.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer token-123');
});

test('resolves conflicts by merging server and offline changes', async () => {
  const patchBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith('/api/catches/catch-7') && (!init || !init.method || init.method === 'GET')) {
      return okResponse({
        id: 'catch-7',
        updatedAt: '2024-05-01T12:00:00Z',
        notes: 'Server updated notes',
        sharing: { visibility: 'public', shareWithCommunity: true, shareLocationCoordinates: false },
        location: { waterbody: 'Lake Meridian' },
      });
    }
    if (url.endsWith('/api/catches/catch-7') && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body));
      patchBodies.push(body);
      return okResponse({ id: 'catch-7', updatedAt: '2024-05-01T12:05:00Z' });
    }
    return okResponse({});
  }) as typeof fetch;

  await queueCatch({
    userId: 'user-1',
    method: 'PATCH',
    catchId: 'catch-7',
    payload: {
      notes: 'Offline catch notes',
      sharing: { visibility: 'private', shareWithCommunity: false, shareLocationCoordinates: false },
    },
    baseUpdatedAt: '2024-04-30T11:00:00Z',
    previousSnapshot: {
      notes: 'Older notes',
      sharing: { visibility: 'public', shareWithCommunity: false, shareLocationCoordinates: false },
    },
  });

  const result = await syncQueuedCatches({
    userId: 'user-1',
    getAuthToken: async () => 'token-456',
  });

  assert.equal(result.synced, 1);
  assert.equal(result.conflicts, 1);
  assert.equal(result.errors, 0);
  assert.equal(patchBodies.length, 1);
  assert.equal(
    patchBodies[0].notes,
    'Offline catch notes\n\n— Server version —\nServer updated notes',
  );
  assert.deepEqual(patchBodies[0].sharing, {
    visibility: 'private',
    shareWithCommunity: true,
    shareLocationCoordinates: false,
  });
});

test('queues forecast requests offline and replays them later', async () => {
  let forecastCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/api/forecasts/')) {
      forecastCalls += 1;
      return okResponse({ ok: true });
    }
    return okResponse({});
  }) as typeof fetch;

  await queueForecastRequest({ latitude: 10, longitude: 20, locationLabel: 'Test Spot' });
  let state = await getOfflineQueueState();
  assert.equal(state.forecastCount, 1);

  const synced = await syncQueuedForecastRequests();
  assert.equal(synced, 1);
  state = await getOfflineQueueState();
  assert.equal(state.forecastCount, 0);
  assert.equal(forecastCalls, 1);
});
