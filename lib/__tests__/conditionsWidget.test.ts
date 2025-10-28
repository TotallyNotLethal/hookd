import { strict as assert } from "node:assert";
import test from "node:test";

import { buildFallbackEnvironmentDetails } from "@/components/ConditionsWidget";
import type { EnvironmentSnapshot } from "@/lib/environmentTypes";

const baseSnapshot: EnvironmentSnapshot = {
  captureUtc: "2024-05-20T12:00:00.000Z",
  normalizedCaptureUtc: "2024-05-20T12:00:00.000Z",
  timezone: "America/New_York",
  utcOffsetMinutes: -240,
  localHour: 8,
  timeOfDayBand: "day",
  moonPhase: 0.26,
  moonIllumination: 0.58,
  moonPhaseBand: "waxing",
  surfacePressure: 1012.7,
  weatherCode: 1,
  weatherDescription: "Mainly clear",
  airTemperatureC: 24.2,
  airTemperatureF: 75.6,
  waterTemperatureC: 20.5,
  waterTemperatureF: 68.9,
  windSpeedMps: 3.1,
  windSpeedMph: 6.94,
  windDirectionDegrees: 135,
  windDirectionCardinal: "SE",
  pressureTrend: "rising",
  pressureBand: "mid",
  computedAtUtc: "2024-05-20T12:05:00.000Z",
  source: "test",
};

test("buildFallbackEnvironmentDetails formats live condition snapshot", () => {
  const details = buildFallbackEnvironmentDetails(baseSnapshot);
  assert.equal(details.length, 4);

  const pressure = details.find((detail) => detail.key === "pressure");
  assert.ok(pressure);
  assert.equal(pressure.value, "1013 hPa");
  assert.equal(pressure.description, "Rising · Mid pressure");

  const wind = details.find((detail) => detail.key === "wind");
  assert.ok(wind);
  assert.equal(wind.value, "7 mph SE");
  assert.equal(wind.description, "135°");

  const temperature = details.find((detail) => detail.key === "temperature");
  assert.ok(temperature);
  assert.equal(temperature.value, "76°F");
  assert.equal(temperature.description, "Water 69°F");

  const moon = details.find((detail) => detail.key === "moon");
  assert.ok(moon);
  assert.equal(moon.value, "Waxing moon");
  assert.equal(moon.description, "58% illumination · Phase 26%");
});

test("buildFallbackEnvironmentDetails falls back when data is missing", () => {
  const details = buildFallbackEnvironmentDetails(null);
  assert.equal(details.length, 4);
  for (const detail of details) {
    assert.equal(detail.value, "—");
    assert.equal(detail.description, null);
  }
});
