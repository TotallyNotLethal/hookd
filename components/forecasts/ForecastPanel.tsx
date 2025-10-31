"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AlertTriangle, Clock, Loader2, RefreshCw, Sparkles, Waves } from "lucide-react";

import type { ForecastBundle, BiteWindow } from "@/lib/forecastTypes";
import { trackForecastEvent } from "@/lib/analytics";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { useQueueForecast } from "@/components/OfflineBanner";

type ForecastPanelProps = {
  latitude: number;
  longitude: number;
  locationLabel?: string;
  className?: string;
  onSnapshot?: (bundle: ForecastBundle | null) => void;
};

type FetchState = {
  loading: boolean;
  refreshing: boolean;
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

function useForecast(latitude: number, longitude: number, online: boolean) {
  const [state, setState] = useState<FetchState>({ loading: true, refreshing: false, error: null, data: null });
  const [refreshIndex, setRefreshIndex] = useState(0);

  const refresh = useCallback(() => {
    if (!online) {
      setState((previous) => ({
        ...previous,
        error: 'Offline mode – unable to refresh forecasts.',
      }));
      return;
    }
    setState((previous) => ({
      loading: previous.data == null,
      refreshing: previous.data != null,
      error: null,
      data: previous.data,
    }));
    setRefreshIndex((index) => index + 1);
  }, [online]);

  useEffect(() => {
    if (!online) {
      setState((previous) => ({
        loading: previous.data == null,
        refreshing: false,
        error: previous.data ? previous.error : 'Offline mode – showing cached forecast data.',
        data: previous.data,
      }));
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    fetch(`/api/forecasts/${latitude}/${longitude}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        return (await response.json()) as ForecastBundle;
      })
      .then((payload) => {
        if (cancelled) return;
        setState({ loading: false, refreshing: false, error: null, data: payload });
      })
      .catch((error) => {
        if (cancelled) return;
        setState((previous) => ({
          loading: false,
          refreshing: false,
          error: error instanceof Error ? error.message : "Unknown error",
          data: previous.data,
        }));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [latitude, longitude, online, refreshIndex]);

  return { ...state, refresh };
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

function formatConfidenceLabel(
  confidence: ForecastBundle["tides"]["source"]["confidence"] | undefined
) {
  if (!confidence) return "Unknown";
  return confidence.charAt(0).toUpperCase() + confidence.slice(1);
}

function formatStatusLabel(status: ForecastBundle["tides"]["source"]["status"] | undefined) {
  switch (status) {
    case "ok":
      return "Normal";
    case "partial":
      return "Degraded";
    case "error":
      return "Error";
    default:
      return null;
  }
}

export default function ForecastPanel({ latitude, longitude, locationLabel, className, onSnapshot }: ForecastPanelProps) {
  const offline = useOfflineStatus();
  useQueueForecast(latitude, longitude, locationLabel);
  const { loading, refreshing, error, data, refresh } = useForecast(latitude, longitude, offline.online);

  useEffect(() => {
    if (typeof onSnapshot === 'function') {
      onSnapshot(data);
    }
  }, [data, onSnapshot]);

  const nextHours = useMemo(() => (data?.weather.hours ? data.weather.hours.slice(0, 6) : []), [data]);

  const timezoneLabel = data?.location.timezone.replace("/", " • ") ?? "";

  const bestWindow = useMemo(() => {
    if (!data?.biteWindows.windows.length) return null;
    return data.biteWindows.windows.reduce<BiteWindow | null>((currentBest, candidate) => {
      if (!candidate) return currentBest;
      if (!currentBest) return candidate;
      if (candidate.score > currentBest.score) return candidate;
      if (candidate.score === currentBest.score) {
        return new Date(candidate.start).getTime() < new Date(currentBest.start).getTime()
          ? candidate
          : currentBest;
      }
      return currentBest;
    }, null);
  }, [data]);

  const telemetryWarnings = data?.telemetry.warnings ?? [];
  const telemetryErrors = data?.telemetry.errors ?? [];

  const providerLabels = useMemo(() => {
    const entries = new Map<string, string>();
    if (data) {
      entries.set(data.weather.source.id, data.weather.source.label);
      entries.set(data.tides.source.id, data.tides.source.label);
      if (data.biteWindows.provider) {
        entries.set(data.biteWindows.provider.id, data.biteWindows.provider.label);
      }
    }
    return entries;
  }, [data]);

  const resolveProviderLabel = useCallback(
    (identifier: string) => providerLabels.get(identifier) ?? identifier,
    [providerLabels]
  );

  const handleRefresh = useCallback(() => {
    if (!offline.online) return;
    trackForecastEvent("forecast_manual_refresh", {
      latitude,
      longitude,
      hasData: Boolean(data),
      version: data?.version ?? null,
      tideProvider: data?.tides.source.id ?? null,
      tideFallback: data?.tides.fallbackUsed ?? false,
      usedPrefetch: data?.telemetry.usedPrefetch ?? false,
    });
    refresh();
  }, [data, latitude, longitude, offline.online, refresh]);

  return (
    <section className={`glass rounded-3xl border border-white/10 p-6 text-white ${className ?? ""}`} aria-live="polite">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">Forecast</p>
          <h2 className="text-2xl font-semibold">
            {locationLabel ? `Conditions for ${locationLabel}` : "Localized conditions"}
          </h2>
          <div className="flex flex-col gap-1 text-xs text-white/50">
            {timezoneLabel ? <span>{timezoneLabel}</span> : null}
            {data ? <span className="text-[11px] text-white/40">Schema v{data.version}</span> : null}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 text-xs text-white/50 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-2">
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            <span>
              {offline.online
                ? data
                  ? `Updated ${formatRelative(data.updatedAt)}`
                  : "Syncing"
                : 'Offline · using cached data'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || refreshing || !offline.online}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            <span>Manual refresh</span>
          </button>
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
          {telemetryErrors.length > 0 || telemetryWarnings.length > 0 || data.tides.fallbackUsed ? (
            <aside className="lg:col-span-2">
              <div className="flex flex-col gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-xs text-amber-100">
                <div className="flex items-center gap-2 text-amber-200">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  <p className="font-semibold uppercase tracking-[0.2em]">Provider alerts</p>
                </div>
                <ul className="space-y-1 text-amber-100">
                  {telemetryErrors.slice(0, 2).map((entry) => (
                    <li key={`error-${entry.at}-${entry.providerId}`} className="text-red-200">
                      <span className="font-semibold text-red-100/90">{resolveProviderLabel(entry.providerId)}:</span>{" "}
                      {entry.message}
                    </li>
                  ))}
                  {telemetryWarnings.slice(0, 3).map((entry) => (
                    <li key={`warn-${entry.at}-${entry.providerId}`}>
                      <span className="font-semibold text-amber-100/90">{resolveProviderLabel(entry.providerId)}:</span>{" "}
                      {entry.message}
                    </li>
                  ))}
                  {data.tides.fallbackUsed ? (
                    <li key="fallback" className="text-amber-200">
                      Tide fallback active via {data.tides.source.label}.
                    </li>
                  ) : null}
                </ul>
              </div>
            </aside>
          ) : null}
          {bestWindow ? (
            <aside className="lg:col-span-2">
              <div className="flex flex-col gap-3 rounded-2xl border border-emerald-400/50 bg-emerald-500/10 p-4 text-sm text-emerald-50 shadow-lg shadow-emerald-500/10 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 text-emerald-100">
                  <Sparkles className="h-5 w-5" aria-hidden />
                  <p className="text-sm font-semibold uppercase tracking-[0.2em]">Optimal window</p>
                </div>
                <div className="flex flex-col items-start gap-1 text-left md:flex-row md:items-center md:gap-4">
                  <p className="text-base font-semibold text-white">
                    {bestWindow.label} · {scoreLabel(bestWindow.score)}
                  </p>
                  <p className="text-xs text-emerald-100/80">
                    {formatClock(bestWindow.start, { hour: "numeric", minute: "2-digit" })} –
                    {" "}
                    {formatClock(bestWindow.end, { hour: "numeric", minute: "2-digit" })}
                  </p>
                  <p className="text-xs text-emerald-100/70 max-w-xl">{bestWindow.rationale}</p>
                </div>
              </div>
            </aside>
          ) : null}
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
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-semibold text-white">Tide outlook</p>
                <span className="text-[11px] uppercase tracking-wide text-white/50">
                  Confidence: {formatConfidenceLabel(data.tides.source.confidence)}
                  {data.tides.source.status ? ` • ${formatStatusLabel(data.tides.source.status) ?? ""}` : ""}
                </span>
              </div>
              <p className="text-[11px] text-white/60">
                Source: {data.tides.source.label}
                {data.tides.source.url ? (
                  <>
                    {" "}
                    <a
                      href={data.tides.source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-white underline-offset-4 hover:underline"
                    >
                      view provider
                    </a>
                  </>
                ) : null}
              </p>
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
              {data.tides.fallbackUsed ? (
                <p className="text-[11px] text-amber-200/80">
                  Fallback tide data active. {data.tides.source.disclaimer ?? "Live tide providers were unavailable."}
                </p>
              ) : data.tides.source.disclaimer ? (
                <p className="text-[11px] text-white/50">{data.tides.source.disclaimer}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {data ? (
        <footer className="mt-6 grid gap-3 text-[11px] text-white/50 sm:grid-cols-3">
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
          <p>
            Tides via {data.tides.source.label}
            {data.tides.source.url ? (
              <>
                {" "}
                <a
                  href={data.tides.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white underline-offset-4 hover:underline"
                >
                  view provider
                </a>
              </>
            ) : null}
            {data.tides.source.confidence ? ` • Confidence ${formatConfidenceLabel(data.tides.source.confidence)}` : ""}
          </p>
          <p>
            {data.biteWindows.basis}
            {data.biteWindows.provider ? (
              <>
                {" "}
                via {data.biteWindows.provider.label}
                {data.biteWindows.provider.url ? (
                  <>
                    {" "}
                    <a
                      href={data.biteWindows.provider.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-white underline-offset-4 hover:underline"
                    >
                      view provider
                    </a>
                  </>
                ) : null}
              </>
            ) : null}
          </p>
        </footer>
      ) : null}
    </section>
  );
}
