import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCatchInput } from '@/lib/catches';

test('validateCatchInput accepts well-formed payloads', () => {
  const payload = {
    species: 'Largemouth Bass',
    caughtAt: new Date('2024-05-01T12:00:00Z').toISOString(),
    notes: 'Spawn bite on the north bank.',
    location: {
      waterbody: 'Lake Lanier',
    },
    gear: {
      bait: 'Green pumpkin jig',
      presentation: 'Skipping docks',
    },
    measurements: {
      lengthInches: 20.5,
    },
    sharing: {
      visibility: 'water',
      shareWithCommunity: true,
      shareLocationCoordinates: false,
    },
  } as const;

  const parsed = validateCatchInput(payload);
  assert.equal(parsed.species, payload.species);
  assert.equal(parsed.location.waterbody, 'Lake Lanier');
  assert.equal(parsed.sharing.visibility, 'water');
});

test('validateCatchInput enforces coordinate pairing', () => {
  const payload = {
    species: 'Bass',
    caughtAt: new Date().toISOString(),
    location: {
      waterbody: 'Lake',
      latitude: 34.2,
    },
    sharing: {
      visibility: 'public',
      shareWithCommunity: true,
      shareLocationCoordinates: true,
    },
  };

  assert.throws(() => validateCatchInput(payload), /Latitude and longitude must both be provided/);
});

test('validateCatchInput requires at least one measurement when provided', () => {
  const payload = {
    species: 'Bass',
    caughtAt: new Date().toISOString(),
    location: {
      waterbody: 'Lake',
    },
    measurements: {},
    sharing: {
      visibility: 'private',
      shareWithCommunity: false,
      shareLocationCoordinates: false,
    },
  };

  assert.throws(() => validateCatchInput(payload), /Provide at least one measurement/);
});
