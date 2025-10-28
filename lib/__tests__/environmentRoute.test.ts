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

test('GET requests Open-Meteo with expected parameters and normalizes response data', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: string[] = [];

  const forecastPayload = {
    utc_offset_seconds: -4 * 60 * 60,
    timezone: 'America/New_York',
    hourly: {
      time: ['2025-10-28T13:00', '2025-10-28T14:00'],
      surface_pressure: [1010.4, 1011.1],
      weathercode: [63, 63],
      temperature_2m: [12.5, 12.7],
      windspeed_10m: [3.5, 4.1],
      winddirection_10m: [180, 190],
    },
  };

  const astronomyPayload = {
    utc_offset_seconds: -4 * 60 * 60,
    timezone: 'America/New_York',
    daily: {
      time: ['2025-10-28'],
      moon_phase: [0.45],
      moon_illumination: [65],
    },
  };

  const marinePayload = {
    utc_offset_seconds: -4 * 60 * 60,
    timezone: 'America/New_York',
    hourly: {
      time: ['2025-10-28T13:00'],
      water_temperature: [10.5],
    },
  };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push(url);

    if (url.includes('/forecast')) {
      return new Response(JSON.stringify(forecastPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/astronomy')) {
      return new Response(JSON.stringify(astronomyPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/marine')) {
      return new Response(JSON.stringify(marinePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch URL ${url}`);
  }) as typeof fetch;

  try {
    const params = new URLSearchParams({
      lat: '40.7989',
      lng: '-81.3784',
      timestamp: '2025-10-28T17:04:32.826Z',
    });

    const response = await GET(
      new Request(`http://localhost/api/environment?${params.toString()}`),
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.capture);
    assert.equal(Array.isArray(body.slices), true);
    assert.equal(body.slices.length, 1);

    const slice = body.slices[0];
    assert.equal(slice.offsetHours, 0);
    assert.equal(slice.snapshot.windSpeedMps, 3.5);
    assert.equal(slice.snapshot.windSpeedMph, 7.83);
    assert.equal(slice.snapshot.windDirectionDegrees, 180);
    assert.equal(slice.snapshot.windDirectionCardinal, 'S');
    assert.equal(slice.snapshot.waterTemperatureC, 10.5);
    assert.equal(slice.snapshot.waterTemperatureF, 50.9);

    const forecastUrl = new URL(
      fetchCalls.find((url) => url.includes('/forecast')) ?? '',
    );
    assert.equal(
      forecastUrl.searchParams.get('hourly'),
      'surface_pressure,temperature_2m,weathercode,windspeed_10m,winddirection_10m',
    );

    const astronomyUrl = new URL(
      fetchCalls.find((url) => url.includes('/astronomy')) ?? '',
    );
    assert.equal(astronomyUrl.searchParams.get('daily'), 'moon_phase,moon_illumination');

    const marineUrl = new URL(fetchCalls.find((url) => url.includes('/marine')) ?? '');
    assert.equal(marineUrl.searchParams.get('hourly'), 'water_temperature');
  } finally {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
    }
  }
});
