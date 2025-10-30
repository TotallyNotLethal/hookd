import assert from 'node:assert/strict';
import test from 'node:test';

import type { CatchRecord } from '@/lib/catches';
import { computeCommunityCatchAnalytics, computeUserCatchAnalytics } from '@/lib/server/catchAnalytics';
import { setCatchRepositoryForTesting } from '@/lib/server/catchesRepository';

const baseDate = new Date('2024-05-01T12:00:00Z');

function createRecord(overrides: Partial<CatchRecord> & { id: string; userId: string }): CatchRecord {
  return {
    id: overrides.id,
    userId: overrides.userId,
    species: overrides.species ?? 'Bass',
    caughtAt: overrides.caughtAt ?? baseDate.toISOString(),
    notes: overrides.notes ?? null,
    location: overrides.location ?? { waterbody: 'Lake' },
    gear: overrides.gear ?? {},
    measurements: overrides.measurements ?? undefined,
    sharing:
      overrides.sharing ??
      ({ visibility: 'public', shareWithCommunity: true, shareLocationCoordinates: false } as CatchRecord['sharing']),
    environmentSnapshot: overrides.environmentSnapshot ?? null,
    forecastSnapshot: overrides.forecastSnapshot ?? null,
    createdAt: overrides.createdAt ?? baseDate,
    updatedAt: overrides.updatedAt ?? baseDate,
    deletedAt: overrides.deletedAt ?? null,
  };
}

test('analytics summarize catch metrics for users and community', async () => {
  const records: CatchRecord[] = [
    createRecord({
      id: '1',
      userId: 'u1',
      species: 'Largemouth Bass',
      measurements: { weightPounds: 6.25, lengthInches: 21 },
      environmentSnapshot: {
        captureUtc: baseDate.toISOString(),
        normalizedCaptureUtc: baseDate.toISOString(),
        timezone: 'UTC',
        utcOffsetMinutes: 0,
        localHour: 12,
        timeOfDayBand: 'day',
        moonPhase: 0.5,
        moonIllumination: 0.5,
        moonPhaseBand: 'waxing',
        surfacePressure: 1008,
        weatherCode: 63,
        weatherDescription: 'Rain',
        airTemperatureC: 20,
        airTemperatureF: 68,
        waterTemperatureC: 18,
        waterTemperatureF: 64.4,
        windSpeedMps: 4,
        windSpeedMph: 8.9,
        windDirectionDegrees: 120,
        windDirectionCardinal: 'SE',
        pressureTrend: 'falling',
        pressureBand: 'mid',
        computedAtUtc: baseDate.toISOString(),
        source: 'test',
      },
    }),
    createRecord({
      id: '2',
      userId: 'u1',
      species: 'Smallmouth Bass',
      measurements: { weightPounds: 3.75 },
    }),
    createRecord({
      id: '3',
      userId: 'u2',
      species: 'Trout',
      measurements: { weightPounds: 2.5 },
      sharing: { visibility: 'private', shareWithCommunity: false, shareLocationCoordinates: false } as CatchRecord['sharing'],
    }),
  ];

  setCatchRepositoryForTesting({
    async createCatch() {
      throw new Error('not implemented');
    },
    async updateCatch() {
      throw new Error('not implemented');
    },
    async deleteCatch() {
      throw new Error('not implemented');
    },
    async getCatch() {
      return null;
    },
    async listCatches(userId: string) {
      return { entries: records.filter((record) => record.userId === userId) };
    },
    async listForCommunity() {
      return records.filter((record) => record.sharing.shareWithCommunity);
    },
  } as any);

  const userSummary = await computeUserCatchAnalytics('u1');
  assert.equal(userSummary.sampleSize, 2);
  assert.equal(userSummary.summary.totalCatches, 2);
  assert.equal(userSummary.summary.uniqueSpeciesCount, 2);
  assert.ok(userSummary.summary.environment);
  assert.equal(userSummary.summary.environment?.typicalWeather?.description, 'Rain');

  const communitySummary = await computeCommunityCatchAnalytics();
  assert.equal(communitySummary.sampleSize, 2);
  assert.equal(communitySummary.summary.totalCatches, 2);
  assert.equal(communitySummary.summary.uniqueSpeciesCount, 2);

  setCatchRepositoryForTesting();
});
