import { strict as assert } from "node:assert";
import test from "node:test";

import { computeBiteWindows, generateSyntheticTides } from "@/lib/server/forecastService";

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
