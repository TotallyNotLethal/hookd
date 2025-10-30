import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as createCatch, GET as listCatches } from '@/app/api/catches/route';
import { PATCH as updateCatch } from '@/app/api/catches/[catchId]/route';
import type { CatchRecord, CatchVisibility } from '@/lib/catches';
import { setAuthTestOverride } from '@/lib/server/auth';
import { getCatchRepository, setCatchRepositoryForTesting } from '@/lib/server/catchesRepository';

const now = new Date('2024-05-01T12:00:00Z');

function buildRecord(partial: Partial<CatchRecord> & { id: string; userId: string }): CatchRecord {
  return {
    id: partial.id,
    userId: partial.userId,
    species: partial.species ?? 'Bass',
    caughtAt: partial.caughtAt ?? now.toISOString(),
    notes: partial.notes ?? null,
    location: partial.location ?? { waterbody: 'Lake' },
    gear: partial.gear ?? {},
    measurements: partial.measurements ?? undefined,
    sharing:
      partial.sharing ??
      ({ visibility: 'public', shareWithCommunity: true, shareLocationCoordinates: false } as CatchRecord['sharing']),
    environmentSnapshot: partial.environmentSnapshot ?? null,
    forecastSnapshot: partial.forecastSnapshot ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    deletedAt: partial.deletedAt ?? null,
  };
}

test('routes enforce authentication and ownership', async (t) => {
  const records = new Map<string, CatchRecord>();
  const repo = {
    async createCatch(userId: string, input: any) {
      const id = `catch-${records.size + 1}`;
      const record = buildRecord({ id, userId, ...input, createdAt: now, updatedAt: now });
      records.set(id, record);
      return record;
    },
    async updateCatch(userId: string, update: any) {
      const existing = records.get(update.id);
      if (!existing) {
        const error = new Error('not found');
        (error as any).code = 'not-found';
        throw error;
      }
      if (existing.userId !== userId) {
        const error = new Error('forbidden');
        (error as any).code = 'forbidden';
        throw error;
      }
      const next = buildRecord({ ...existing, ...update, id: update.id, userId, updatedAt: now });
      records.set(update.id, next);
      return next;
    },
    async deleteCatch(userId: string, id: string) {
      const existing = records.get(id);
      if (!existing) {
        const error = new Error('not-found');
        (error as any).code = 'not-found';
        throw error;
      }
      if (existing.userId !== userId) {
        const error = new Error('forbidden');
        (error as any).code = 'forbidden';
        throw error;
      }
      records.delete(id);
    },
    async getCatch(userId: string, id: string) {
      const record = records.get(id) ?? null;
      if (!record || record.userId !== userId) return null;
      return record;
    },
    async listCatches(userId: string, filters?: { visibility?: CatchVisibility }) {
      const entries = Array.from(records.values()).filter((entry) => {
        if (entry.userId !== userId) return false;
        if (filters?.visibility && entry.sharing.visibility !== filters.visibility) {
          return false;
        }
        return true;
      });
      return { entries };
    },
    async listForCommunity() {
      return Array.from(records.values());
    },
  } satisfies ReturnType<typeof getCatchRepository>;

  setCatchRepositoryForTesting(repo as any);

  await t.test('unauthenticated requests are rejected', async () => {
    setAuthTestOverride(() => null);
    const response = await createCatch(
      new Request('http://localhost/api/catches', { method: 'POST', body: JSON.stringify({}) }),
    );
    assert.equal(response.status, 401);
  });

  await t.test('owner can create and update catches', async () => {
    setAuthTestOverride(() => ({ uid: 'angler-1' }));
    const createPayload = {
      species: 'Trout',
      caughtAt: now.toISOString(),
      location: { waterbody: 'River' },
      sharing: { visibility: 'public', shareWithCommunity: true, shareLocationCoordinates: false },
      gear: { bait: 'Dry fly' },
      measurements: { lengthInches: 18 },
    };
    const createResponse = await createCatch(
      new Request('http://localhost/api/catches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createPayload),
      }),
    );
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as CatchRecord;
    assert.equal(created.species, 'Trout');

    const updateResponse = await updateCatch(
      new Request('http://localhost/api/catches/catch-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ species: 'Rainbow Trout' }),
      }),
      { params: { catchId: created.id } },
    );
    assert.equal(updateResponse.status, 200);
    const updated = (await updateResponse.json()) as CatchRecord;
    assert.equal(updated.species, 'Rainbow Trout');
  });

  await t.test('non-owners are blocked', async () => {
    setAuthTestOverride(() => ({ uid: 'angler-2' }));
    const response = await updateCatch(
      new Request('http://localhost/api/catches/catch-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ species: 'Brown Trout' }),
      }),
      { params: { catchId: 'catch-1' } },
    );
    assert.equal(response.status, 403);
  });

  await t.test('listing respects visibility filters', async () => {
    setAuthTestOverride(() => ({ uid: 'angler-1' }));
    const response = await listCatches(new Request('http://localhost/api/catches?visibility=public'));
    assert.equal(response.status, 200);
    const body = (await response.json()) as { entries: CatchRecord[] };
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0]?.species, 'Rainbow Trout');
  });

  setAuthTestOverride();
  setCatchRepositoryForTesting();
});
