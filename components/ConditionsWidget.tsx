"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useProAccess } from "@/hooks/useProAccess";
import type { BitePrediction, BiteSignalDocument } from "@/lib/biteClock";
import { getOrRefreshBiteSignal } from "@/lib/biteClock";
import { deriveLocationKey } from "@/lib/location";

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
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [usingFallback, setUsingFallback] = useState(true);
  const [signal, setSignal] = useState<BiteSignalDocument | null>(null);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [signalLoading, setSignalLoading] = useState(false);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);

  const locationKey = useMemo(() => {
    if (!location?.latitude || !location?.longitude) return null;
    return deriveLocationKey({
      coordinates: { lat: location.latitude, lng: location.longitude },
      locationName: location.name,
    });
  }, [location.latitude, location.longitude, location.name]);

  const predictionViews = useMemo(() => buildPredictions(signal), [signal]);
  const lastUpdatedLabel = useMemo(() => formatUpdatedAt(signal), [signal]);

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

  useEffect(() => {
    let isMounted = true;
    setLocationStatus("locating");
    setUsingFallback(true);
    setGeolocationError(null);

    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationStatus("fallback");
      return () => {
        isMounted = false;
      };
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (!isMounted) return;
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const name = await resolveLocationName(latitude, longitude, fallbackLocation.name);
        if (!isMounted) return;
        setLocation({
          name,
          latitude,
          longitude,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? fallbackLocation.timezone,
        });
        setUsingFallback(false);
        setLocationStatus("resolved");
      },
      (error) => {
        console.warn("Unable to detect geolocation", error);
        if (!isMounted) return;
        setLocation(fallbackLocation);
        setUsingFallback(true);
        setGeolocationError('Location services unavailable. Using default spot.');
        setLocationStatus("fallback");
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
      },
    );

    return () => {
      isMounted = false;
    };
  }, [fallbackLocation]);

  useEffect(() => {
    if (!isPro || !locationKey) return;
    fetchSignal();
  }, [fetchSignal, isPro, locationKey]);

  const insufficient = signal?.insufficient || predictionViews.length === 0;

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
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/50">Bite Signals</p>
          <h3 className="font-semibold text-lg text-white">{location.name}</h3>
          <p className="text-[11px] text-white/40 mt-1">
            {locationStatus === "locating"
              ? "Detecting your location…"
              : usingFallback
                ? geolocationError ?? "Using default spot. Enable location for local intel."
                : "Based on your current location"}
          </p>
        </div>
        {lastUpdatedLabel && !signalLoading && (
          <p className="text-xs text-white/40">Updated {lastUpdatedLabel}</p>
        )}
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
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
          Not enough recent catches here to chart the bite. Log a few more trips to build the signal.
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
