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

test('GET populates weather data from weather_code responses', async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];

  const originalDateNow = Date.now;
  const fixedNow = Date.UTC(2024, 4, 5, 12, 0, 0);
  Date.now = () => fixedNow;

  const forecastPayload = {
    timezone: 'UTC',
    utc_offset_seconds: 0,
    hourly: {
      time: ['2024-05-05T12:00', '2024-05-05T13:00'],
      surface_pressure: [1012.3, 1013.1],
      weather_code: [63, 63],
      temperature_2m: [12.5, 12.8],
      wind_speed_10m: [3.1, 3.3],
      wind_direction_10m: [180, 182],
    },
  };
  const astronomyPayload = {
    timezone: 'UTC',
    utc_offset_seconds: 0,
    daily: {
      time: ['2024-05-05'],
      moon_phase: [0.52],
      moon_illumination: [0.6],
    },
  };
  const marinePayload = {
    timezone: 'UTC',
    utc_offset_seconds: 0,
    hourly: {
      time: ['2024-05-05T12:00'],
      water_temperature: [9.5],
    },
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    if (url.startsWith('https://api.open-meteo.com/v1/forecast')) {
      return new Response(JSON.stringify(forecastPayload), { status: 200 });
    }
    if (url.startsWith('https://api.open-meteo.com/v1/astronomy')) {
      return new Response(JSON.stringify(astronomyPayload), { status: 200 });
    }
    if (url.startsWith('https://marine-api.open-meteo.com/v1/marine')) {
      return new Response(JSON.stringify(marinePayload), { status: 200 });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  try {
    const params = new URLSearchParams({ lat: '10', lng: '20' });
    const response = await GET(new Request(`http://localhost/api/environment?${params.toString()}`));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.capture);
    assert.equal(payload.capture.weatherCode, 63);
    assert.equal(payload.capture.weatherDescription, 'Rain');
    const forecastRequest = requests.find((url) =>
      url.startsWith('https://api.open-meteo.com/v1/forecast'),
    );
    assert.ok(forecastRequest);
    const hourlyParam = new URL(forecastRequest).searchParams.get('hourly');
    assert.equal(
      hourlyParam,
      'surface_pressure,temperature_2m,weather_code,wind_speed_10m,wind_direction_10m',
    );
  } finally {
    Date.now = originalDateNow;
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
    }
  }
});
