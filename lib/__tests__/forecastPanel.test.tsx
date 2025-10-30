import { strict as assert } from "node:assert";
import test from "node:test";

import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { JSDOM } from "jsdom";

import ForecastPanel from "@/components/forecasts/ForecastPanel";
import type { ForecastBundle } from "@/lib/forecastTypes";

test("ForecastPanel surfaces provider attribution and manual refresh analytics", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalNavigator = globalThis.navigator;
  const originalFetch = globalThis.fetch;
  (globalThis as typeof globalThis & { window: Window }).window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document;
  globalThis.navigator = dom.window.navigator;
  const originalAnalytics = dom.window.__hookdAnalyticsEvents;
  dom.window.__hookdAnalyticsEvents = [];

  const firstBundle: ForecastBundle = {
    version: "2024-10-05",
    updatedAt: "2024-06-15T12:00:00.000Z",
    location: {
      latitude: 29.95,
      longitude: -90.07,
      timezone: "America/Chicago",
      sunrise: "2024-06-15T11:00:00.000Z",
      sunset: "2024-06-15T23:00:00.000Z",
      moonPhaseFraction: 0.48,
      moonPhaseLabel: "Full moon",
    },
    weather: {
      hours: Array.from({ length: 6 }, (_, index) => ({
        timestamp: new Date(Date.UTC(2024, 5, 15, index)).toISOString(),
        temperatureC: 22 + index,
        temperatureF: 72 + index,
        apparentTemperatureC: 22 + index,
        apparentTemperatureF: 72 + index,
        pressureHpa: 1012,
        windSpeedMph: 8,
        windDirection: 180,
        precipitationProbability: 10,
        weatherCode: 1,
        weatherSummary: "Mainly clear",
      })),
      source: {
        id: "open-meteo",
        label: "Open-Meteo Forecast",
        url: "https://open-meteo.com/",
        updatedAt: "2024-06-15T12:00:00.000Z",
        confidence: "high",
        status: "ok",
      },
    },
    tides: {
      predictions: Array.from({ length: 4 }, (_, index) => ({
        timestamp: new Date(Date.UTC(2024, 5, 15, index * 6)).toISOString(),
        heightMeters: 0.5 + index * 0.1,
        trend: index % 2 === 0 ? "rising" : "falling",
      })),
      source: {
        id: "noaa-coops",
        label: "NOAA CO-OPS",
        url: "https://api.tidesandcurrents.noaa.gov/",
        confidence: "high",
        status: "ok",
      },
      fallbackUsed: false,
    },
    biteWindows: {
      windows: [
        {
          label: "Major feeding",
          start: "2024-06-15T14:00:00.000Z",
          end: "2024-06-15T16:00:00.000Z",
          score: 5,
          rationale: "Solunar major period",
        },
      ],
      basis: "Solunar tables blended with daylight.",
      provider: {
        id: "solunar",
        label: "Solunar Forecast",
        url: "https://solunar.org/",
      },
    },
    telemetry: {
      errors: [],
      warnings: [
        {
          providerId: "solunar",
          message: "Solunar major/minor periods applied.",
          at: "2024-06-15T12:00:00.000Z",
        },
      ],
      providerLatencyMs: { "open-meteo": 12 },
      usedPrefetch: false,
    },
  };

  const refreshedBundle: ForecastBundle = {
    ...firstBundle,
    updatedAt: "2024-06-15T13:30:00.000Z",
    telemetry: {
      ...firstBundle.telemetry,
      warnings: [],
    },
  };

  let callIndex = 0;
  globalThis.fetch = async () => {
    const payload = callIndex === 0 ? firstBundle : refreshedBundle;
    callIndex += 1;
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as unknown as Response;
  };

  try {
    const view = render(
      <ForecastPanel latitude={29.95} longitude={-90.07} locationLabel="Test Spot" />
    );

    await screen.findByText(/Tide outlook/i);
    assert.ok(screen.getByText(/Provider alerts/i));
    assert.ok(screen.getByText(/NOAA CO-OPS/i));
    assert.ok(screen.getByText(/Confidence: High/i));

    const button = screen.getByRole("button", { name: /Manual refresh/i });
    fireEvent.click(button);

    await waitFor(() => {
      assert.equal(callIndex, 2);
    });

    const analytics = window.__hookdAnalyticsEvents ?? [];
    assert.ok(analytics.some((entry) => entry.event === "forecast_manual_refresh"));

    view.unmount();
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    dom.window.__hookdAnalyticsEvents = originalAnalytics;
    if (originalWindow === undefined) {
      delete (globalThis as typeof globalThis & { window?: Window }).window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalDocument === undefined) {
      delete (globalThis as typeof globalThis & { document?: Document }).document;
    } else {
      globalThis.document = originalDocument;
    }
    if (originalNavigator === undefined) {
      delete (globalThis as typeof globalThis & { navigator?: Navigator }).navigator;
    } else {
      globalThis.navigator = originalNavigator;
    }
  }
});
