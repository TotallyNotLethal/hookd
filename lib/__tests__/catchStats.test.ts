import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCatchWeight, summarizeCatchMetrics } from '../catchStats';

describe('parseCatchWeight', () => {
  it('returns null for empty values', () => {
    assert.equal(parseCatchWeight(undefined), null);
    assert.equal(parseCatchWeight(null), null);
    assert.equal(parseCatchWeight(''), null);
  });

  it('parses simple pound weights', () => {
    assert.equal(parseCatchWeight('5 lb'), 5);
    assert.equal(parseCatchWeight('7.25lbs'), 7.25);
  });

  it('handles mixed pounds and ounces', () => {
    const parsed = parseCatchWeight('4 lb 8 oz');
    assert.ok(parsed);
    assert.ok(Math.abs(parsed - 4.5) < 1e-6);
  });

  it('converts metric units to pounds', () => {
    const kilograms = parseCatchWeight('2 kg');
    assert.ok(kilograms);
    assert.ok(Math.abs(kilograms - 4.4092452436) < 1e-6);

    const grams = parseCatchWeight('900 g');
    assert.ok(grams);
    assert.ok(Math.abs(grams - 1.98416) < 1e-4);
  });

  it('ignores non-numeric strings', () => {
    assert.equal(parseCatchWeight('big fish'), null);
  });
});

describe('summarizeCatchMetrics', () => {
  const sampleCatches = [
    { id: 'a', species: 'Largemouth Bass', trophy: true, weight: '5 lb 4 oz' },
    { id: 'b', species: 'Smallmouth Bass', trophy: false, weight: '4.5 lb' },
    { id: 'c', species: 'LARGEMOUTH BASS', trophy: false, weight: '5.75 lb' },
    { id: 'd', species: null, trophy: true, weight: '3 lb' },
    { id: 'e', species: 'Trout', trophy: false, weight: 'mystery weight' },
  ];

  it('counts totals and trophies', () => {
    const summary = summarizeCatchMetrics(sampleCatches);
    assert.equal(summary.totalCatches, 5);
    assert.equal(summary.trophyCount, 2);
  });

  it('deduplicates species names case-insensitively', () => {
    const summary = summarizeCatchMetrics(sampleCatches);
    assert.equal(summary.uniqueSpeciesCount, 3);
  });

  it('selects the heaviest personal best with original text', () => {
    const summary = summarizeCatchMetrics(sampleCatches);
    assert.ok(summary.personalBest);
    assert.equal(summary.personalBest?.catchId, 'c');
    assert.equal(summary.personalBest?.weightText, '5.75 lb');
    assert.equal(summary.personalBest?.species, 'LARGEMOUTH BASS');
  });

  it('omits personal best when no weights parse', () => {
    const summary = summarizeCatchMetrics(
      sampleCatches.map((catchItem) => ({ ...catchItem, weight: 'unknown' })),
    );
    assert.equal(summary.personalBest, null);
  });
});
