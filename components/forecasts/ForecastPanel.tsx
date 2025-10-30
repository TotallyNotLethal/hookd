"use client";

import { useEffect, useMemo, useState } from "react";

import { AlertTriangle, Clock, Loader2, RefreshCw, Waves } from "lucide-react";

import type { ForecastBundle, BiteWindow } from "@/lib/forecastTypes";

type ForecastPanelProps = {
  latitude: number;
  longitude: number;
  locationLabel?: string;
  className?: string;
};

type FetchState = {
  loading: boolean;
  error: string | null;
  data: ForecastBundle | null;
};

const scoreClasses: Record<BiteWindow["score"], string> = {
  1: "bg-red-500/10 text-red-200 border border-red-500/40",
  2: "bg-orange-500/10 text-orange-200 border border-orange-500/40",
  3: "bg-yellow-500/10 text-yellow-200 border border-yellow-500/30",
  4: "bg-emerald-500/10 text-emerald-100 border border-emerald-500/40",
  5: "bg-emerald-400/20 text-emerald-50 border border-emerald-400/50 shadow-lg shadow-emerald-500/20",
};

function formatClock(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat(undefined, options ?? { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = date.getTime() - Date.now();
  const hours = Math.round(diff / (60 * 60 * 1000));
  if (Math.abs(hours) < 1) return "now";
  if (hours > 0) return `in ${hours}h`;
  return `${hours}h ago`;
}

function formatTemperature(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "--";
  return `${Math.round(value)}°`;
}

function useForecast(latitude: number, longitude: number) {
  const [state, setState] = useState<FetchState>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setState({ loading: true, error: null, data: null });
    fetch(`/api/forecasts/${latitude}/${longitude}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        return (await response.json()) as ForecastBundle;
      })
      .then((payload) => {
        if (cancelled) return;
        setState({ loading: false, error: null, data: payload });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ loading: false, error: error instanceof Error ? error.message : "Unknown error", data: null });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [latitude, longitude]);

  return state;
}

function scoreLabel(score: BiteWindow["score"]) {
  switch (score) {
    case 5:
      return "Prime";
    case 4:
      return "Great";
    case 3:
      return "Fair";
    case 2:
      return "Slow";
    default:
      return "Tough";
  }
}

export default function ForecastPanel({ latitude, longitude, locationLabel, className }: ForecastPanelProps) {
  const { loading, error, data } = useForecast(latitude, longitude);

  const nextHours = useMemo(() => {
    if (!data?.weather.hours) return [];
    return data.weather.hours.slice(0, 6);
  }, [data?.weather.hours]);

  const timezoneLabel = data?.location.timezone.replace("/", " • ") ?? "";

  return (
    <section className={`glass rounded-3xl border border-white/10 p-6 text-white ${className ?? ""}`} aria-live="polite">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">Forecast</p>
          <h2 className="text-2xl font-semibold">
            {locationLabel ? `Conditions for ${locationLabel}` : "Localized conditions"}
          </h2>
          {timezoneLabel ? <p className="text-xs text-white/50">{timezoneLabel}</p> : null}
        </div>
        <div className="flex items-center gap-3 text-xs text-white/50">
          <RefreshCw className="h-4 w-4" aria-hidden />
          <span>{data ? `Updated ${formatRelative(data.updatedAt)}` : "Syncing"}</span>
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 text-white/70">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          <p className="text-sm">Pulling weather, tide and bite windows…</p>
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-100">
          <AlertTriangle className="mt-1 h-5 w-5" aria-hidden />
          <div>
            <p className="font-semibold">Unable to load forecast</p>
            <p className="text-red-200/80">{error}</p>
          </div>
        </div>
      ) : null}

      {!loading && !error && data ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
          <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/60">
              <Clock className="h-4 w-4" aria-hidden />
              Next 6 hours
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {nextHours.map((hour) => (
                <article key={hour.timestamp} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                  <p className="flex items-center justify-between text-xs text-white/60">
                    <span>{formatClock(hour.timestamp)}</span>
                    {hour.precipitationProbability != null ? (
                      <span>{hour.precipitationProbability}% rain</span>
                    ) : null}
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {formatTemperature(hour.temperatureF ?? hour.temperatureC)}
                  </p>
                  <p className="text-xs text-white/60">
                    {hour.weatherSummary ?? "—"}
                    {hour.windSpeedMph != null ? ` • ${hour.windSpeedMph} mph wind` : ""}
                  </p>
                </article>
              ))}
              {nextHours.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                  Hourly forecast unavailable for this location.
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              <p>
                Sunrise: {data.location.sunrise ? formatClock(data.location.sunrise) : "—"} • Sunset:{" "}
                {data.location.sunset ? formatClock(data.location.sunset) : "—"}
              </p>
              <p>
                Moon phase: {data.location.moonPhaseLabel ?? "—"}
                {typeof data.location.moonPhaseFraction === "number"
                  ? ` (${Math.round(((data.location.moonPhaseFraction % 1) + 1) % 1 * 100)}%)`
                  : ""}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/60">
              <Waves className="h-4 w-4" aria-hidden />
              Tides & bite windows
            </h3>
            <div className="space-y-3">
              {data.biteWindows.windows.length > 0 ? (
                data.biteWindows.windows.map((window) => (
                  <div key={`${window.start}-${window.label}`} className={`rounded-2xl p-4 text-sm ${scoreClasses[window.score]}`}>
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{window.label}</p>
                      <span className="text-xs uppercase tracking-wide">{scoreLabel(window.score)}</span>
                    </div>
                    <p className="text-xs">
                      {formatClock(window.start, { hour: "numeric", minute: "2-digit" })} – {formatClock(window.end, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="mt-1 text-xs text-white/80">{window.rationale}</p>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                  Bite window data is unavailable for this location.
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
              <p className="font-semibold text-white">Synthetic tide preview</p>
              <ul className="space-y-1">
                {data.tides.predictions.slice(0, 4).map((prediction) => (
                  <li key={prediction.timestamp} className="flex items-center justify-between">
                    <span>{formatClock(prediction.timestamp)}</span>
                    <span>
                      {prediction.heightMeters.toFixed(2)} m • {prediction.trend}
                    </span>
                  </li>
                ))}
              </ul>
              {data.tides.source.disclaimer ? (
                <p className="text-[11px] text-white/50">{data.tides.source.disclaimer}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {data ? (
        <footer className="mt-6 grid gap-3 text-[11px] text-white/50 sm:grid-cols-2">
          <p>
            Weather via {data.weather.source.label}
            {data.weather.source.url ? (
              <>
                {" "}
                <a
                  href={data.weather.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white underline-offset-4 hover:underline"
                >
                  view source
                </a>
              </>
            ) : null}
          </p>
          <p>{data.biteWindows.basis}</p>
        </footer>
      ) : null}
    </section>
  );
}
