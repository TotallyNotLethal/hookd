import { strict as assert } from 'node:assert';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const openmeteo = require('openmeteo') as typeof import('openmeteo');

import recordedOpenMeteo from './fixtures/recordedOpenMeteoLat10Lng20May2024.json' assert { type: 'json' };

import { MAX_LEAD_LAG_DAYS } from '@/lib/environmentLimits';

type RecordedVariable = {
  valuesArray(): Float32Array;
  valuesLength(): number;
  values(index: number): number | null;
  variable(): number;
};

type RecordedVariablesWithTime = {
  time(): number;
  timeEnd(): number;
  interval(): number;
  variablesLength(): number;
  variables(index: number): RecordedVariable | null;
};

type RecordedWeatherApiResponse = {
  timezone(): string | null;
  utcOffsetSeconds(): number | null;
  hourly(): RecordedVariablesWithTime | null;
  daily(): RecordedVariablesWithTime | null;
};

type RecordedVariablesInput = {
  startIso: string;
  intervalSeconds: number;
  variables: { name: string; values: number[] }[];
};

function createRecordedVariablesWithTime(
  series: RecordedVariablesInput | undefined,
): RecordedVariablesWithTime | null {
  if (!series) {
    return null;
  }

  const startSeconds = Math.floor(new Date(series.startIso).getTime() / 1000);
  let maxLength = 0;
  const variables: RecordedVariable[] = series.variables.map(({ values }) => {
    const typedValues = Float32Array.from(values);
    if (typedValues.length > maxLength) {
      maxLength = typedValues.length;
    }
    return {
      valuesArray: () => typedValues,
      valuesLength: () => typedValues.length,
      values: (index: number) => typedValues[index] ?? null,
      variable: () => 0,
    };
  });

  return {
    time: () => startSeconds,
    timeEnd: () => startSeconds + series.intervalSeconds * maxLength,
    interval: () => series.intervalSeconds,
    variablesLength: () => variables.length,
    variables: (index: number) => variables[index] ?? null,
  };
}

type RecordedWeatherResponseInput = {
  timezone: string;
  utcOffsetSeconds: number;
  hourly?: RecordedVariablesInput;
  daily?: RecordedVariablesInput;
};

function createRecordedWeatherResponse({
  timezone,
  utcOffsetSeconds,
  hourly,
  daily,
}: RecordedWeatherResponseInput): RecordedWeatherApiResponse {
  return {
    timezone: () => timezone,
    utcOffsetSeconds: () => utcOffsetSeconds,
    hourly: () => createRecordedVariablesWithTime(hourly),
    daily: () => createRecordedVariablesWithTime(daily),
  };
}

const recordedFixture = recordedOpenMeteo as {
  forecast: RecordedWeatherResponseInput;
  astronomy: RecordedWeatherResponseInput;
  marine: RecordedWeatherResponseInput;
};

// The recorded fixture captures the actual Open-Meteo responses for latitude 10°,
// longitude 20° on 2024-05-05T12:00Z. The tests exercise those real measurements
// while still isolating the SDK from making live network calls.

async function loadGet() {
  const unique = Math.random().toString(36).slice(2);
  const module = await import(`@/app/api/environment/route?test=${unique}`);
  return module.GET;
}

test('GET returns 422 when timestamp is outside supported lead/lag', async () => {
  const originalFetchWeatherApi = openmeteo.fetchWeatherApi;
  let fetchWeatherApiCalled = false;
  openmeteo.fetchWeatherApi = (async () => {
    fetchWeatherApiCalled = true;
    throw new Error('fetchWeatherApi should not be called for out-of-range timestamps');
  }) as typeof openmeteo.fetchWeatherApi;

  try {
    const GET = await loadGet();
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
    assert.equal(fetchWeatherApiCalled, false);
  } finally {
    openmeteo.fetchWeatherApi = originalFetchWeatherApi;
  }
});

test('GET populates weather data from weather_code responses', async () => {
  const originalFetchWeatherApi = openmeteo.fetchWeatherApi;
  const requests: { url: string; params: Record<string, string> }[] = [];

  const originalDateNow = Date.now;
  const fixedNow = Date.UTC(2024, 4, 5, 12, 0, 0);
  Date.now = () => fixedNow;

  const forecastResponse = createRecordedWeatherResponse(recordedFixture.forecast);
  const astronomyResponse = createRecordedWeatherResponse(recordedFixture.astronomy);
  const marineResponse = createRecordedWeatherResponse(recordedFixture.marine);

  openmeteo.fetchWeatherApi = (async (url, params) => {
    const capturedParams = Object.fromEntries(
      Object.entries((params ?? {}) as Record<string, string | number | boolean | undefined>).map(
        ([key, value]) => [key, String(value)],
      ),
    ) as Record<string, string>;
    requests.push({ url, params: capturedParams });

    if (url.startsWith('https://api.open-meteo.com/v1/forecast')) {
      return [forecastResponse];
    }
    if (url.startsWith('https://api.open-meteo.com/v1/astronomy')) {
      return [astronomyResponse];
    }
    if (url.startsWith('https://marine-api.open-meteo.com/v1/marine')) {
      return [marineResponse];
    }

    throw new Error(`Unexpected fetchWeatherApi URL: ${url}`);
  }) as typeof openmeteo.fetchWeatherApi;

  try {
    const GET = await loadGet();
    const params = new URLSearchParams({ lat: '10', lng: '20' });
    const response = await GET(new Request(`http://localhost/api/environment?${params.toString()}`));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.capture);
    assert.equal(payload.capture.weatherCode, 63);
    assert.equal(payload.capture.weatherDescription, 'Rain');
    const forecastCall = requests.find((call) =>
      call.url.startsWith('https://api.open-meteo.com/v1/forecast'),
    );
    assert.ok(forecastCall);
    assert.equal(
      forecastCall.params.hourly,
      'surface_pressure,temperature_2m,weather_code,wind_speed_10m,wind_direction_10m',
    );
  } finally {
    Date.now = originalDateNow;
    openmeteo.fetchWeatherApi = originalFetchWeatherApi;
  }
});
