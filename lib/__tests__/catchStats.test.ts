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

  it('parses slider-formatted weights with punctuation', () => {
    const compact = parseCatchWeight('4lb 3oz');
    assert.ok(compact);
    assert.ok(Math.abs(compact - (4 + 3 / 16)) < 1e-6);

    const commaSeparated = parseCatchWeight('4 lb, 3 oz');
    assert.ok(commaSeparated);
    assert.ok(Math.abs(commaSeparated - (4 + 3 / 16)) < 1e-6);

    assert.equal(parseCatchWeight('1,200 lb'), 1200);
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
    {
      id: 'a',
      species: 'Largemouth Bass',
      trophy: true,
      weight: '5 lb 4 oz',
      caughtAt: '2024-01-05T12:00:00Z',
      environmentSnapshot: {
        weatherDescription: 'Clear',
        weatherCode: 0,
        airTemperatureF: 70,
        waterTemperatureF: 60,
        timeOfDayBand: 'dawn',
        moonPhaseBand: 'full',
        pressureBand: 'high',
        windDirectionCardinal: 'NNE',
        windDirectionDegrees: 30,
        windSpeedMph: 8,
      },
    },
    {
      id: 'b',
      species: 'Smallmouth Bass',
      trophy: false,
      weight: '4.5 lb',
      caughtAt: '2024-01-12T12:00:00Z',
      environmentSnapshot: {
        weatherDescription: 'Clear',
        weatherCode: 0,
        airTemperatureF: 72,
        waterTemperatureF: 62,
        timeOfDayBand: 'day',
        moonPhaseBand: 'full',
        pressureBand: 'high',
        windDirectionCardinal: 'NE',
        windDirectionDegrees: 40,
        windSpeedMph: 10,
      },
    },
    {
      id: 'c',
      species: 'LARGEMOUTH BASS',
      trophy: false,
      weight: '5.75 lb',
      caughtAt: '2024-01-20T12:00:00Z',
      environmentSnapshot: {
        weatherDescription: 'Rain',
        weatherCode: 63,
        airTemperatureF: 68,
        waterTemperatureF: 63,
        timeOfDayBand: 'day',
        moonPhaseBand: 'waxing',
        pressureBand: 'mid',
        windDirectionCardinal: 'SSW',
        windDirectionDegrees: 200,
        windSpeedMph: 12,
      },
    },
    { id: 'd', species: null, trophy: true, weight: '3 lb', caughtAt: '2023-11-01T12:00:00Z' },
    {
      id: 'e',
      species: 'Trout',
      trophy: false,
      weight: 'mystery weight',
      caughtAt: '2024-02-01T12:00:00Z',
    },
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

  it('falls back to numeric weights when formatted text is missing', () => {
    const summary = summarizeCatchMetrics([
      { id: 'numeric-only', species: 'Bass', trophy: false, weight: null, weightValueLbs: 6.25 },
      { id: 'text-weight', species: 'Bass', trophy: false, weight: '5 lb', weightValueLbs: null },
    ]);

    assert.ok(summary.personalBest);
    assert.equal(summary.personalBest?.catchId, 'numeric-only');
    assert.equal(summary.personalBest?.weight, 6.25);
    assert.equal(summary.personalBest?.weightText, '6 lb 4 oz');
  });

  it('normalizes weight text when only numeric values are available', () => {
    const summary = summarizeCatchMetrics([
      {
        id: 'invalid-text',
        species: 'Carp',
        trophy: true,
        weight: 'approximately huge',
        weightValueLbs: 9.337,
      },
      { id: 'control', species: 'Perch', trophy: false, weight: '1 lb', weightValueLbs: 1 },
    ]);

    assert.ok(summary.personalBest);
    assert.equal(summary.personalBest?.catchId, 'invalid-text');
    assert.equal(summary.personalBest?.weight, 9.337);
    assert.equal(summary.personalBest?.weightText, '9 lb 5 oz');
  });

  it('aggregates environment insights when snapshots are provided', () => {
    const summary = summarizeCatchMetrics(sampleCatches);
    assert.ok(summary.environment);
    assert.equal(summary.environment?.sampleSize, 3);
    assert.ok(summary.environment?.typicalWeather);
    assert.equal(summary.environment?.typicalWeather?.description, 'Clear');
    assert.equal(summary.environment?.typicalWeather?.code, 0);
    assert.equal(summary.environment?.typicalMoonPhase, 'full');
    assert.equal(summary.environment?.typicalTimeOfDay, 'day');
    assert.equal(summary.environment?.typicalPressure, 'high');
    assert.equal(summary.environment?.averageAirTempF, 70);
    assert.equal(summary.environment?.averageWaterTempF, 61.67);
    assert.ok(summary.environment?.prevailingWind);
    assert.equal(summary.environment?.prevailingWind?.direction, 'NNE');
    assert.equal(summary.environment?.prevailingWind?.speedMph, 10);
  });

  it('tracks environment samples even when weights are missing', () => {
    const summary = summarizeCatchMetrics([
      {
        id: 'no-weight-1',
        species: 'Bass',
        weight: 'mystery value',
        environmentSnapshot: {
          weatherDescription: 'Cloudy',
          weatherCode: 2,
          airTemperatureF: 60,
          waterTemperatureF: 55,
          timeOfDayBand: 'dawn',
          moonPhaseBand: 'waxing',
          pressureBand: 'mid',
          windDirectionCardinal: 'NE',
          windDirectionDegrees: 45,
          windSpeedMph: 5,
        },
      },
      {
        id: 'no-weight-2',
        species: 'Bass',
        weight: null,
        environmentSnapshot: {
          weatherDescription: 'Cloudy',
          weatherCode: 2,
          airTemperatureF: 70,
          waterTemperatureF: 57,
          timeOfDayBand: 'dawn',
          moonPhaseBand: 'waxing',
          pressureBand: 'mid',
          windDirectionCardinal: 'NE',
          windDirectionDegrees: 50,
          windSpeedMph: 7,
        },
      },
    ]);

    assert.equal(summary.totalCatches, 2);
    assert.equal(summary.trophyCount, 0);
    assert.equal(summary.uniqueSpeciesCount, 1);
    assert.equal(summary.personalBest, null);

    assert.ok(summary.environment);
    assert.equal(summary.environment?.sampleSize, 2);
    assert.ok(summary.environment?.typicalWeather);
    assert.equal(summary.environment?.typicalWeather?.description, 'Cloudy');
    assert.equal(summary.environment?.typicalWeather?.code, 2);
    assert.equal(summary.environment?.typicalMoonPhase, 'waxing');
    assert.equal(summary.environment?.typicalTimeOfDay, 'dawn');
    assert.equal(summary.environment?.typicalPressure, 'mid');
    assert.equal(summary.environment?.averageAirTempF, 65);
    assert.equal(summary.environment?.averageWaterTempF, 56);
    assert.ok(summary.environment?.prevailingWind);
    assert.equal(summary.environment?.prevailingWind?.direction, 'NE');
    assert.equal(summary.environment?.prevailingWind?.speedMph, 6);
    assert.ok(summary.environment?.prevailingWind?.degrees);
    assert.ok(
      Math.abs((summary.environment?.prevailingWind?.degrees ?? 0) - 47.5) < 1e-6,
    );
  });

  it('calculates trophy rate and average catch weight', () => {
    const summary = summarizeCatchMetrics(sampleCatches);
    assert.ok(summary.trophyRate != null);
    assert.ok(
      summary.trophyRate != null
        ? Math.abs(summary.trophyRate - 0.4) < 1e-6
        : false,
    );
    assert.ok(summary.averageCatchWeight);
    assert.ok(
      summary.averageCatchWeight
        ? Math.abs(summary.averageCatchWeight.weight - 4.625) < 1e-6
        : false,
    );
    assert.equal(summary.averageCatchWeight?.sampleSize, 4);
    assert.equal(summary.averageCatchWeight?.weightText, '4 lb 10 oz');
  });

  it('identifies the most frequently caught species', () => {
    const summary = summarizeCatchMetrics(sampleCatches);
    assert.ok(summary.mostCaughtSpecies);
    assert.equal(summary.mostCaughtSpecies?.species, 'Largemouth Bass');
    assert.equal(summary.mostCaughtSpecies?.count, 2);
    assert.ok(
      summary.mostCaughtSpecies?.share != null
        ? Math.abs(summary.mostCaughtSpecies.share - 0.4) < 1e-6
        : false,
    );
  });

  it('summarizes recent activity windows', () => {
    const originalNow = Date.now;
    (Date as unknown as { now: () => number }).now = () => new Date('2024-03-01T12:00:00Z').getTime();
    try {
      const summary = summarizeCatchMetrics([
        { id: 'fresh', caughtAt: '2024-02-28T12:00:00Z' },
        { id: 'week', caughtAt: '2024-02-24T12:00:00Z' },
        { id: 'month', caughtAt: '2024-02-05T12:00:00Z' },
        { id: 'quarter', caughtAt: '2023-12-15T12:00:00Z' },
        { id: 'old', caughtAt: '2023-09-01T12:00:00Z' },
      ]);

      assert.ok(summary.recentActivity);
      assert.equal(summary.recentActivity?.last7Days, 2);
      assert.equal(summary.recentActivity?.last30Days, 3);
      assert.equal(summary.recentActivity?.last90Days, 4);
    } finally {
      (Date as unknown as { now: () => number }).now = originalNow;
    }
  });
});
