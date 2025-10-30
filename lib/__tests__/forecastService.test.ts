import { strict as assert } from "node:assert";
import test from "node:test";

import {
  computeBiteWindows,
  generateSyntheticTides,
  getForecastBundle,
} from "@/lib/server/forecastService";

test("computeBiteWindows creates dawn and dusk windows with boosted scoring", () => {
  const sunrise = "2024-06-10T10:00:00.000Z";
  const sunset = "2024-06-10T22:10:00.000Z";
  const moonPhase = 0.52; // near full
  const now = new Date("2024-06-10T08:30:00.000Z");

  const windows = computeBiteWindows({
    sunrise,
    sunset,
    moonPhase,
    timezone: "America/New_York",
    now,
  });

  assert.ok(windows.length >= 2, "expected at least dawn and dusk windows");
  const [first, second] = windows;
  assert.equal(first.label, "Dawn feed");
  assert.equal(second.label, "Midday major");
  assert.ok(first.score >= 4 && first.score <= 5, "dawn window should be highly rated");
  assert.ok(second.score >= 3 && second.score <= 5);
  for (let index = 1; index < windows.length; index += 1) {
    assert.ok(
      new Date(windows[index - 1]!.start).getTime() <= new Date(windows[index]!.start).getTime(),
      "windows should be sorted chronologically"
    );
  }
});

test("generateSyntheticTides returns a smooth harmonic series", () => {
  const tides = generateSyntheticTides({
    latitude: 29.5,
    longitude: -90.3,
    baseTime: new Date("2024-06-10T00:00:00.000Z"),
  });

  assert.equal(tides.length, 10, "expected ten synthetic tide entries");
  for (let index = 1; index < tides.length; index += 1) {
    const previous = tides[index - 1]!;
    const current = tides[index]!;
    const deltaHours =
      (new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime()) / (60 * 60 * 1000);
    assert.equal(deltaHours, 3);
  }

  const heights = tides.map((tide) => tide.heightMeters);
  const maxHeight = Math.max(...heights);
  const minHeight = Math.min(...heights);
  assert.ok(maxHeight > 0.5 && maxHeight <= 2.5);
  assert.ok(minHeight < -0.5 && minHeight >= -2.5);
});

test("getForecastBundle provides a synthetic fallback when upstream weather fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalSolunarKey = process.env.SOLUNAR_API_KEY;
  delete process.env.SOLUNAR_API_KEY;
  globalThis.fetch = async () => {
    throw new Error("network-unreachable");
  };

  try {
    const bundle = await getForecastBundle({ latitude: 11.234, longitude: -47.891 });
    assert.equal(bundle.version.length > 0, true, "bundle should include a schema version");
    assert.equal(bundle.weather.source.id, "synthetic-weather");
    assert.equal(bundle.tides.source.id, "synthetic-harmonic");
    assert.equal(bundle.tides.fallbackUsed, true);
    assert.equal(bundle.weather.hours.length, 24);
    assert.ok(bundle.location.sunrise, "synthetic forecast should include sunrise time");
    assert.ok(bundle.biteWindows.windows.length > 0, "bite windows should still be computed");
    assert.ok(
      bundle.telemetry.errors.some((entry) => entry.providerId === "open-meteo"),
      "telemetry should record weather provider failure"
    );
    assert.ok(bundle.telemetry.warnings.length > 0, "warnings should note synthetic fallbacks");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSolunarKey === undefined) {
      delete process.env.SOLUNAR_API_KEY;
    } else {
      process.env.SOLUNAR_API_KEY = originalSolunarKey;
    }
  }
});

test("getForecastBundle blends NOAA tides and solunar windows when providers respond", async () => {
  const originalFetch = globalThis.fetch;
  const originalSolunarKey = process.env.SOLUNAR_API_KEY;
  const originalNoaaToken = process.env.NOAA_API_TOKEN;
  process.env.SOLUNAR_API_KEY = "test-key";
  process.env.NOAA_API_TOKEN = "test-token";

  const createOpenMeteoPayload = () => {
    const base = new Date();
    const hours = Array.from({ length: 24 }, (_, index) => new Date(base.getTime() + index * 60 * 60 * 1000).toISOString());
    return {
      latitude: 29.95,
      longitude: -90.07,
      timezone: "America/Chicago",
      hourly: {
        time: hours,
        temperature_2m: Array(hours.length).fill(24),
        apparent_temperature: Array(hours.length).fill(24),
        pressure_msl: Array(hours.length).fill(1012),
        wind_speed_10m: Array(hours.length).fill(5),
        wind_direction_10m: Array(hours.length).fill(180),
        precipitation_probability: Array(hours.length).fill(10),
        weather_code: Array(hours.length).fill(1),
      },
      daily: {
        time: [base.toISOString()],
        sunrise: [new Date(base.getTime() + 6 * 60 * 60 * 1000).toISOString()],
        sunset: [new Date(base.getTime() + 18 * 60 * 60 * 1000).toISOString()],
        moon_phase: [0.48],
      },
    };
  };

  const noaaStations = {
    stations: [
      { id: "8724580", name: "Test Station", lat: "29.95", lon: "-90.07", status: "active" },
    ],
  };

  const createSolunarPayload = () => {
    const base = new Date();
    return {
      sunRise: new Date(base.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      sunSet: new Date(base.getTime() + 18 * 60 * 60 * 1000).toISOString(),
      moonPhase: 0.48,
      rating: 3,
      major1Start: new Date(base.getTime() + 8 * 60 * 60 * 1000).toISOString(),
      major1Stop: new Date(base.getTime() + 10 * 60 * 60 * 1000).toISOString(),
      minor1Start: new Date(base.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      minor1Stop: new Date(base.getTime() + 13 * 60 * 60 * 1000).toISOString(),
    };
  };

  const usgsSiteRdb = [
    "# USGS site",
    "agency_cd\tsite_no\tstation_nm\tdec_lat_va\tdec_long_va",
    "5s\t15s\t30s\t16s\t17s",
    "USGS\t01234567\tSample Site\t29.95\t-90.07",
  ].join("\n");

  const jsonResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  const textResponse = (body: string) => ({
    ok: true,
    status: 200,
    text: async () => body,
    json: async () => JSON.parse(body),
  });

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("open-meteo.com")) {
      return jsonResponse(createOpenMeteoPayload()) as unknown as Response;
    }
    if (url.includes("stations.json")) {
      return jsonResponse(noaaStations) as unknown as Response;
    }
    if (url.includes("datagetter")) {
      const base = new Date();
      const predictions = Array.from({ length: 5 }, (_, index) => ({
        t: new Date(base.getTime() + index * 6 * 60 * 60 * 1000).toISOString(),
        v: (0.25 * (index + 1)).toFixed(2),
      }));
      return jsonResponse({ predictions }) as unknown as Response;
    }
    if (url.includes("solunar")) {
      return jsonResponse(createSolunarPayload()) as unknown as Response;
    }
    if (url.includes("nwis/site")) {
      return textResponse(usgsSiteRdb) as unknown as Response;
    }
    if (url.includes("nwis/iv")) {
      return jsonResponse({ value: { timeSeries: [{ values: [{ value: [] }] }] } }) as unknown as Response;
    }
    return jsonResponse({}) as unknown as Response;
  };

  try {
    const bundle = await getForecastBundle({ latitude: 29.95, longitude: -90.07 });
    assert.equal(bundle.weather.source.id, "open-meteo");
    assert.equal(bundle.tides.source.id, "noaa-coops");
    assert.equal(bundle.tides.fallbackUsed, false);
    assert.ok(bundle.biteWindows.provider);
    assert.equal(bundle.biteWindows.provider?.id, "solunar");
    assert.ok(bundle.biteWindows.windows.length >= 1);
    assert.ok(
      bundle.telemetry.errors.length === 0,
      `expected no provider errors but received ${bundle.telemetry.errors.length}`
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSolunarKey === undefined) {
      delete process.env.SOLUNAR_API_KEY;
    } else {
      process.env.SOLUNAR_API_KEY = originalSolunarKey;
    }
    if (originalNoaaToken === undefined) {
      delete process.env.NOAA_API_TOKEN;
    } else {
      process.env.NOAA_API_TOKEN = originalNoaaToken;
    }
  }
});
