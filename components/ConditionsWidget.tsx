"use client";

import { useEffect, useMemo, useState } from "react";

interface Location {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

interface ConditionsData {
  temperature: number | null;
  windSpeed: number | null;
  sunrise: string | null;
  sunset: string | null;
  fetchedAt: Date;
}

interface ConditionsWidgetProps {
  location: Location;
  className?: string;
}

const formatTime = (value: string | null) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function ConditionsWidget({
  location,
  className = "",
}: ConditionsWidgetProps) {
  const [conditions, setConditions] = useState<ConditionsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchForecast() {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          latitude: String(location.latitude),
          longitude: String(location.longitude),
          timezone: location.timezone ?? "auto",
          current: "temperature_2m,wind_speed_10m",
          daily: "sunrise,sunset",
          temperature_unit: "fahrenheit",
          wind_speed_unit: "mph",
        });

        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
        );

        if (!response.ok) {
          throw new Error("Unable to load forecast right now.");
        }

        const forecast = await response.json();
        const sunrise = forecast.daily?.sunrise?.[0] ?? null;
        const sunset = forecast.daily?.sunset?.[0] ?? null;

        if (isMounted) {
          setConditions({
            temperature: forecast.current?.temperature_2m ?? null,
            windSpeed: forecast.current?.wind_speed_10m ?? null,
            sunrise,
            sunset,
            fetchedAt: new Date(),
          });
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Something went wrong fetching the forecast.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchForecast();

    return () => {
      isMounted = false;
    };
  }, [location.latitude, location.longitude, location.timezone]);

  const bestWindow = useMemo(() => {
    if (!conditions?.sunrise) return null;
    const sunriseDate = new Date(conditions.sunrise);
    if (Number.isNaN(sunriseDate.getTime())) return null;
    const windowEnd = new Date(sunriseDate.getTime() + 2 * 60 * 60 * 1000);
    const start = sunriseDate.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    const end = windowEnd.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${start} – ${end}`;
  }, [conditions?.sunrise]);

  return (
    <div className={`card p-4 flex flex-col gap-4 ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/50">Conditions</p>
          <h3 className="font-semibold text-lg text-white">{location.name}</h3>
        </div>
        {!isLoading && !error && (
          <p className="text-xs text-white/40">
            Updated {conditions?.fetchedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>
        )}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : (
        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-2 text-sm text-white/50">
              <div className="h-3 w-24 rounded-full bg-white/10 animate-pulse" />
              <div className="h-3 w-32 rounded-full bg-white/10 animate-pulse" />
              <div className="h-3 w-20 rounded-full bg-white/10 animate-pulse" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-white/5 px-4 py-3 flex flex-col gap-1">
                  <span className="text-lg">🌡️</span>
                  <p className="text-xl font-semibold text-white">
                    {conditions?.temperature != null ? `${Math.round(conditions.temperature)}°F` : "--"}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-white/50">Air temp</p>
                </div>
                <div className="rounded-2xl bg-white/5 px-4 py-3 flex flex-col gap-1">
                  <span className="text-lg">💨</span>
                  <p className="text-xl font-semibold text-white">
                    {conditions?.windSpeed != null ? `${Math.round(conditions.windSpeed)} mph` : "--"}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-white/50">Wind</p>
                </div>
                <div className="rounded-2xl bg-white/5 px-4 py-3 flex flex-col gap-1">
                  <span className="text-lg">🌅</span>
                  <p className="text-sm text-white">
                    Rise {formatTime(conditions?.sunrise)}
                  </p>
                  <p className="text-sm text-white">
                    Set {formatTime(conditions?.sunset)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-brand-500/10 border border-brand-500/40 px-4 py-3">
                <p className="text-sm text-brand-200 font-medium">
                  {bestWindow
                    ? `Best bite window ${bestWindow}`
                    : "Watch for calm pockets right after sunrise."}
                </p>
                <p className="text-xs text-white/60 mt-1">
                  Dial in your presentation during stable light changes for higher strike rates.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
