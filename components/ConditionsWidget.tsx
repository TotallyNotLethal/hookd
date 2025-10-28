"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useProAccess } from "@/hooks/useProAccess";
import type { BitePrediction, BiteSignalDocument } from "@/lib/biteClock";
import { getOrRefreshBiteSignal } from "@/lib/biteClock";
import { deriveLocationKey } from "@/lib/location";
import type { EnvironmentSnapshot } from "@/lib/environmentTypes";

interface ConditionsWidgetProps {
  fallbackLocation: {
    name: string;
    latitude: number;
    longitude: number;
    timezone?: string;
  };
  className?: string;
}

type LocationState = {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

type LocationStatus = "idle" | "locating" | "fallback" | "resolved" | "error";

type PredictionView = BitePrediction & { key: string };

const arrowForDirection: Record<BitePrediction["direction"], string> = {
  up: "↑",
  flat: "→",
  down: "↓",
};

function formatConfidence(value: number) {
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatUpdatedAt(signal: BiteSignalDocument | null) {
  if (!signal?.updatedAt) return null;
  const date = signal.updatedAt.toDate();
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function buildPredictions(signal: BiteSignalDocument | null): PredictionView[] {
  if (!signal?.predictions || signal.predictions.length === 0) return [];
  return signal.predictions.slice(0, 3).map((prediction) => ({
    ...prediction,
    key: `${prediction.offsetHours}-${prediction.direction}-${prediction.environment.captureUtc}`,
  }));
}

function formatMoonIllumination(value: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  const normalized = value > 1 ? value : value * 100;
  return `${Math.round(normalized)}% illumination`;
}

function capitalize(value: string | null | undefined) {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDegrees(
  fahrenheit: number | null | undefined,
  celsius: number | null | undefined,
) {
  if (fahrenheit != null && Number.isFinite(fahrenheit)) {
    return `${Math.round(fahrenheit)}°F`;
  }
  if (celsius != null && Number.isFinite(celsius)) {
    return `${Math.round(celsius)}°C`;
  }
  return "—";
}

function joinDetails(parts: (string | null | undefined)[]) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" · ") || null;
}

export type FallbackConditionDetail = {
  key: string;
  label: string;
  value: string;
  description: string | null;
};

export function buildFallbackEnvironmentDetails(
  snapshot: EnvironmentSnapshot | null,
): FallbackConditionDetail[] {
  const pressureValue = snapshot?.surfacePressure != null && Number.isFinite(snapshot.surfacePressure)
    ? `${Math.round(snapshot.surfacePressure)} hPa`
    : "—";
  const pressureDescription = joinDetails([
    snapshot?.pressureTrend ? capitalize(snapshot.pressureTrend) : null,
    snapshot?.pressureBand ? `${capitalize(snapshot.pressureBand)} pressure` : null,
  ]);

  const windSpeedMph = snapshot?.windSpeedMph;
  const windSpeedMps = snapshot?.windSpeedMps;
  const windValueParts: string[] = [];
  if (windSpeedMph != null && Number.isFinite(windSpeedMph)) {
    windValueParts.push(`${Math.round(windSpeedMph)} mph`);
  } else if (windSpeedMps != null && Number.isFinite(windSpeedMps)) {
    windValueParts.push(`${Math.round(windSpeedMps)} m/s`);
  }
  if (snapshot?.windDirectionCardinal) {
    windValueParts.push(snapshot.windDirectionCardinal);
  }
  const windValue = windValueParts.length > 0 ? windValueParts.join(" ") : "—";
  const windDescription = snapshot?.windDirectionDegrees != null && Number.isFinite(snapshot.windDirectionDegrees)
    ? `${Math.round(snapshot.windDirectionDegrees)}°`
    : null;

  const airValue = formatDegrees(snapshot?.airTemperatureF, snapshot?.airTemperatureC);
  const waterValue = formatDegrees(snapshot?.waterTemperatureF, snapshot?.waterTemperatureC);
  let temperatureValue = airValue;
  let temperatureDescription: string | null = waterValue !== "—" ? `Water ${waterValue}` : null;
  if (temperatureValue === "—" && waterValue !== "—") {
    temperatureValue = waterValue;
    temperatureDescription = "Surface water";
  }

  const moonValue = snapshot?.moonPhaseBand ? `${capitalize(snapshot.moonPhaseBand)} moon` : "—";
  const moonDescription = joinDetails([
    formatMoonIllumination(snapshot?.moonIllumination),
    snapshot?.moonPhase != null && Number.isFinite(snapshot.moonPhase)
      ? `Phase ${Math.round(((snapshot.moonPhase % 1) + 1) % 1 * 100)}%`
      : null,
  ]);

  return [
    {
      key: "pressure",
      label: "Pressure",
      value: pressureValue,
      description: pressureDescription,
    },
    {
      key: "wind",
      label: "Wind",
      value: windValue,
      description: windDescription,
    },
    {
      key: "temperature",
      label: "Temperature",
      value: temperatureValue,
      description: temperatureDescription,
    },
    {
      key: "moon",
      label: "Moon",
      value: moonValue,
      description: moonDescription,
    },
  ];
}

async function resolveLocationName(lat: number, lng: number, fallback: string) {
  try {
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      language: "en",
      count: "1",
    });
    const response = await fetch(`/api/open-meteo/reverse?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Reverse lookup failed with status ${response.status}`);
    }
    const data = await response.json();
    const result = data?.results?.[0];
    if (!result?.name) return fallback;
    const admin = [result.admin1, result.admin2, result.country_code].filter(Boolean).join(", ");
    return admin ? `${result.name}, ${admin}` : result.name;
  } catch (error) {
    console.warn("Unable to reverse geocode location", error);
    return fallback;
  }
}

export default function ConditionsWidget({
  fallbackLocation,
  className = "",
}: ConditionsWidgetProps) {
  const { isPro, loading: proLoading } = useProAccess();
  const [location, setLocation] = useState<LocationState>(fallbackLocation);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("fallback");
  const [usingFallback, setUsingFallback] = useState(true);
  const [signal, setSignal] = useState<BiteSignalDocument | null>(null);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [signalLoading, setSignalLoading] = useState(false);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const fallbackEnvironmentCache = useRef(new Map<string, EnvironmentSnapshot>());
  const [fallbackEnvironment, setFallbackEnvironment] = useState<EnvironmentSnapshot | null>(null);
  const [fallbackEnvironmentLoading, setFallbackEnvironmentLoading] = useState(false);
  const [fallbackEnvironmentError, setFallbackEnvironmentError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setLocation({
      name: fallbackLocation.name,
      latitude: fallbackLocation.latitude,
      longitude: fallbackLocation.longitude,
      timezone: fallbackLocation.timezone,
    });
    setUsingFallback(true);
    setGeolocationError(null);
    setLocationStatus((previous) => (previous === "locating" ? previous : "fallback"));
  }, [
    fallbackLocation.latitude,
    fallbackLocation.longitude,
    fallbackLocation.name,
    fallbackLocation.timezone,
  ]);

  const locationKey = useMemo(() => {
    if (!location?.latitude || !location?.longitude) return null;
    return deriveLocationKey({
      coordinates: { lat: location.latitude, lng: location.longitude },
      locationName: location.name,
    });
  }, [location.latitude, location.longitude, location.name]);

  const predictionViews = useMemo(() => buildPredictions(signal), [signal]);
  const lastUpdatedLabel = useMemo(() => formatUpdatedAt(signal), [signal]);
  const insufficient = signal?.insufficient || predictionViews.length === 0;
  const fallbackDetails = useMemo(
    () => buildFallbackEnvironmentDetails(fallbackEnvironment),
    [fallbackEnvironment],
  );
  const fallbackUpdatedLabel = useMemo(() => {
    if (!fallbackEnvironment?.captureUtc) return null;
    const date = new Date(fallbackEnvironment.captureUtc);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }, [fallbackEnvironment?.captureUtc]);

  const fetchSignal = useCallback(async () => {
    if (!isPro || !locationKey || !location) return;
    setSignalLoading(true);
    setSignalError(null);
    try {
      const refreshed = await getOrRefreshBiteSignal({
        locationKey,
        coordinates: { lat: location.latitude, lng: location.longitude },
      });
      setSignal(refreshed);
      if (!refreshed) {
        setSignalError(null);
      }
    } catch (error) {
      console.error('Unable to load bite signal', error);
      setSignalError('Unable to load bite signal right now.');
    } finally {
      setSignalLoading(false);
    }
  }, [isPro, locationKey, location]);

  const requestUserLocation = useCallback(() => {
    if (locationStatus === "locating") {
      return;
    }

    if (typeof window === "undefined" || !navigator.geolocation) {
      setGeolocationError("Location services unavailable. Using default spot.");
      setUsingFallback(true);
      setLocationStatus("fallback");
      return;
    }

    setLocationStatus("locating");
    setGeolocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (!isMountedRef.current) {
          return;
        }

        try {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          const name = await resolveLocationName(latitude, longitude, fallbackLocation.name);

          if (!isMountedRef.current) {
            return;
          }

          setLocation({
            name,
            latitude,
            longitude,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? fallbackLocation.timezone,
          });
          setUsingFallback(false);
          setLocationStatus("resolved");
        } catch (error) {
          console.warn("Unable to resolve location name", error);
          if (!isMountedRef.current) {
            return;
          }
          setGeolocationError("Unable to confirm detected location. Using default spot.");
          setUsingFallback(true);
          setLocationStatus("fallback");
        }
      },
      (error) => {
        console.warn("Unable to detect geolocation", error);
        if (!isMountedRef.current) {
          return;
        }
        setUsingFallback(true);
        setGeolocationError('Location services unavailable. Using default spot.');
        setLocationStatus("fallback");
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
      },
    );
  }, [fallbackLocation.name, fallbackLocation.timezone, locationStatus]);

  useEffect(() => {
    if (!isPro || !locationKey) return;
    fetchSignal();
  }, [fetchSignal, isPro, locationKey]);

  useEffect(() => {
    if (!locationKey) {
      setFallbackEnvironment(null);
      setFallbackEnvironmentError(null);
      setFallbackEnvironmentLoading(false);
      return;
    }

    const cached = fallbackEnvironmentCache.current.get(locationKey) ?? null;
    if (cached) {
      setFallbackEnvironment(cached);
      setFallbackEnvironmentError(null);
      setFallbackEnvironmentLoading(false);
    } else {
      setFallbackEnvironment(null);
    }
  }, [locationKey]);

  useEffect(() => {
    if (
      !insufficient ||
      !locationKey ||
      !location?.latitude ||
      !location?.longitude ||
      fallbackEnvironmentCache.current.has(locationKey)
    ) {
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    setFallbackEnvironmentLoading(true);
    setFallbackEnvironmentError(null);

    async function loadFallbackEnvironment() {
      try {
        const params = new URLSearchParams({
          lat: location.latitude.toString(),
          lng: location.longitude.toString(),
        });
        const response = await fetch(`/api/environment?${params.toString()}`, {
          signal: controller.signal,
        });
        if (response.status >= 400 && response.status < 500) {
          if (!isActive || controller.signal.aborted) {
            return;
          }
          setFallbackEnvironment(null);
          setFallbackEnvironmentError('Live conditions unavailable.');
          return;
        }
        if (!response.ok) {
          throw new Error(`Environment request failed with status ${response.status}`);
        }
        const body = await response.json();
        const snapshot: EnvironmentSnapshot | null = body?.capture ?? body?.slices?.[0]?.snapshot ?? null;
        if (!snapshot) {
          throw new Error("Live conditions unavailable.");
        }
        if (!isActive) return;
        fallbackEnvironmentCache.current.set(locationKey, snapshot);
        setFallbackEnvironment(snapshot);
      } catch (error) {
        if (!isActive || controller.signal.aborted) {
          return;
        }
        console.error("Unable to load fallback environment", error);
        setFallbackEnvironmentError("Unable to load live conditions right now.");
      } finally {
        if (!isActive || controller.signal.aborted) {
          return;
        }
        setFallbackEnvironmentLoading(false);
      }
    }

    loadFallbackEnvironment();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [insufficient, locationKey, location?.latitude, location?.longitude]);

  if (proLoading) {
    return (
      <div className={`card p-4 flex flex-col gap-4 ${className}`}>
        <div className="h-4 w-32 rounded bg-white/10 animate-pulse" />
        <div className="h-16 w-full rounded bg-white/10 animate-pulse" />
      </div>
    );
  }

  if (!isPro) {
    return (
      <div className={`card p-4 flex flex-col gap-3 ${className}`}>
        <div>
          <p className="text-xs uppercase tracking-wide text-white/50">Hook&apos;d Pro</p>
          <h3 className="font-semibold text-lg text-white">Bite Signals</h3>
        </div>
        <p className="text-sm text-white/70">
          Upgrade to Hook&apos;d Pro to unlock localized bite predictions powered by community catches and live conditions.
        </p>
      </div>
    );
  }

  return (
    <div className={`card p-4 flex flex-col gap-4 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/50">Bite Signals</p>
          <h3 className="font-semibold text-lg text-white">{location.name}</h3>
          <p className="mt-1 text-[11px] text-white/40">
            {locationStatus === "locating"
              ? "Detecting your location…"
              : usingFallback
                ? geolocationError ?? "Using default spot. Enable location for local intel."
                : "Based on your current location"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/60">
            <button
              type="button"
              onClick={requestUserLocation}
              className="rounded-full border border-white/20 px-3 py-1 font-medium text-white/80 transition hover:border-white/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={locationStatus === "locating"}
            >
              {locationStatus === "locating" ? "Locating…" : "Use my location"}
            </button>
            {locationStatus === "fallback" && geolocationError ? (
              <span className="text-amber-200/80">{geolocationError}</span>
            ) : null}
          </div>
        </div>
        {lastUpdatedLabel && !signalLoading ? (
          <p className="text-xs text-white/40">Updated {lastUpdatedLabel}</p>
        ) : null}
      </div>

      {signalError && !signalLoading ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {signalError}
        </div>
      ) : null}

      {signalLoading ? (
        <div className="grid grid-cols-3 gap-3 text-sm text-white/60">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-2xl bg-white/10 px-4 py-3 animate-pulse" />
          ))}
        </div>
      ) : insufficient ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 space-y-3">
          <p>
            Not enough recent catches here to chart the bite. Log a few more trips to build the signal.
          </p>
          {fallbackEnvironmentLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-20 rounded-2xl bg-white/10 animate-pulse" />
              ))}
            </div>
          ) : fallbackEnvironmentError ? (
            <p className="text-xs text-amber-200">{fallbackEnvironmentError}</p>
          ) : fallbackEnvironment ? (
            <div className="space-y-2">
              {fallbackUpdatedLabel ? (
                <p className="text-[11px] uppercase tracking-wide text-white/40">
                  Live conditions as of {fallbackUpdatedLabel}
                </p>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fallbackDetails.map((detail) => (
                  <div key={detail.key} className="rounded-2xl bg-white/10 px-4 py-3 text-white">
                    <p className="text-xs uppercase tracking-wide text-white/50">{detail.label}</p>
                    <p className="text-lg font-semibold">{detail.value}</p>
                    {detail.description ? (
                      <p className="text-[11px] text-white/60 mt-1">{detail.description}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {predictionViews.map((prediction) => (
              <div key={prediction.key} className="rounded-2xl bg-white/5 px-4 py-3 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-lg">{arrowForDirection[prediction.direction]}</span>
                  <span className="text-xs text-white/50">{prediction.label}</span>
                </div>
                <p className="text-xl font-semibold text-white">{formatConfidence(prediction.confidence)}</p>
                <p className="text-xs uppercase tracking-wide text-white/50">
                  {prediction.bands.timeOfDay} · {prediction.bands.moonPhase} moon · {prediction.bands.pressure}
                </p>
              </div>
            ))}
          </div>
          {signal?.sampleSize ? (
            <p className="text-[11px] text-white/40">
              Aggregated from {signal.sampleSize} recent catches weighted by angler trust.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
