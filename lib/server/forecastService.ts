import "server-only";

import { TtlCache } from "@/lib/server/ttlCache";

import type {
  BiteWindow,
  ForecastBundle,
  ForecastSourceSummary,
  ForecastWeatherHour,
  TidePrediction,
  TideTrend,
} from "../forecastTypes";

const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000;
const WEATHER_CACHE_MAX_ENTRIES = 64;
const FORECAST_HORIZON_HOURS = 24;
const SYNTHETIC_TIDE_POINTS = 10;
const TIDE_INTERVAL_HOURS = 3;
const SYNTHETIC_TIDE_BASE_AMPLITUDE = 0.8;
const SYNTHETIC_TIDE_VARIATION = 1.1;

type OpenMeteoHourlyResponse = {
  time?: string[];
  temperature_2m?: number[];
  apparent_temperature?: number[];
  pressure_msl?: number[];
  wind_speed_10m?: number[];
  wind_direction_10m?: number[];
  precipitation_probability?: number[];
  weather_code?: number[];
};

type OpenMeteoDailyResponse = {
  time?: string[];
  sunrise?: string[];
  sunset?: string[];
  moon_phase?: number[];
};

type OpenMeteoForecastResponse = {
  latitude: number;
  longitude: number;
  timezone: string;
  timezone_abbreviation?: string;
  hourly?: OpenMeteoHourlyResponse;
  daily?: OpenMeteoDailyResponse;
};

const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Heavy freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Heavy rain showers",
  82: "Violent rain showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe thunderstorm",
};

const forecastCache = new TtlCache<ForecastBundle>({
  ttlMs: WEATHER_CACHE_TTL_MS,
  maxEntries: WEATHER_CACHE_MAX_ENTRIES,
});

const OPEN_METEO_SOURCE: ForecastSourceSummary = {
  id: "open-meteo",
  label: "Open-Meteo Forecast",
  url: "https://open-meteo.com/",
};

const SYNTHETIC_TIDES_SOURCE: ForecastSourceSummary = {
  id: "synthetic-harmonic",
  label: "Harmonic model",
  url: null,
  disclaimer: "Synthetic tide curve for preview purposes – replace with NOAA/USGS data in production.",
};

const SYNTHETIC_WEATHER_SOURCE: ForecastSourceSummary = {
  id: "synthetic-weather",
  label: "Synthetic weather model",
  url: null,
  disclaimer:
    "Generated locally when upstream weather services are unavailable. Data is approximate and for preview only.",
};

function toCacheKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
}

function toFahrenheit(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(((value * 9) / 5 + 32) * 10) / 10;
}

function toMilesPerHour(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 2.23694 * 10) / 10;
}

function safeGet(array: number[] | undefined, index: number) {
  if (!array || index >= array.length) return null;
  const value = array[index];
  return Number.isFinite(value) ? value : null;
}

function describeWeather(code: number | null): string | null {
  if (code == null) return null;
  const rounded = Math.round(code);
  return WEATHER_CODE_DESCRIPTIONS[rounded] ?? null;
}

function clampForecastHorizon(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return FORECAST_HORIZON_HOURS;
  return Math.min(FORECAST_HORIZON_HOURS, Math.floor(hours));
}

function normalizeIsoString(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function moonPhaseLabel(fraction: number | null) {
  if (fraction == null || Number.isNaN(fraction)) return null;
  const normalized = ((fraction % 1) + 1) % 1;
  if (normalized < 0.0625 || normalized >= 0.9375) return "New moon";
  if (normalized < 0.1875) return "Waxing crescent";
  if (normalized < 0.3125) return "First quarter";
  if (normalized < 0.4375) return "Waxing gibbous";
  if (normalized < 0.5625) return "Full moon";
  if (normalized < 0.6875) return "Waning gibbous";
  if (normalized < 0.8125) return "Last quarter";
  return "Waning crescent";
}

export function computeBiteWindows({
  sunrise,
  sunset,
  moonPhase,
  timezone,
  now,
}: {
  sunrise: string | null;
  sunset: string | null;
  moonPhase: number | null;
  timezone: string;
  now: Date;
}): BiteWindow[] {
  const windows: BiteWindow[] = [];
  const toWindow = (centerIso: string | null, label: string, baseScore: number, rationale: string): BiteWindow | null => {
    if (!centerIso) return null;
    const center = new Date(centerIso);
    if (Number.isNaN(center.getTime())) return null;
    const start = new Date(center.getTime() - 45 * 60 * 1000);
    const end = new Date(center.getTime() + 60 * 60 * 1000);
    let score = baseScore;
    const offsetHours = Math.abs(center.getTime() - now.getTime()) / (60 * 60 * 1000);
    if (offsetHours <= 3) {
      score = Math.min(5, score + 1);
    }
    if (moonPhase != null) {
      const normalized = ((moonPhase % 1) + 1) % 1;
      if (label.toLowerCase().includes("dawn") && normalized >= 0.4 && normalized <= 0.6) {
        score = Math.min(5, score + 1);
      }
      if (label.toLowerCase().includes("moon") && (normalized < 0.15 || normalized > 0.85)) {
        score = Math.min(5, score + 1);
      }
    }
    score = Math.max(1, Math.min(5, Math.round(score as number)));
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      label,
      score: score as BiteWindow["score"],
      rationale,
    };
  };

  const dawnWindow = toWindow(
    sunrise,
    "Dawn feed",
    4,
    `Sunrise window in ${timezone} often sparks baitfish movement.`
  );
  if (dawnWindow) windows.push(dawnWindow);

  const duskWindow = toWindow(
    sunset,
    "Dusk push",
    4,
    `Sunset feeding activity boosted by cooling surface temps.`
  );
  if (duskWindow) windows.push(duskWindow);

  if (moonPhase != null) {
    const normalized = ((moonPhase % 1) + 1) % 1;
    if (normalized >= 0.45 && normalized <= 0.55) {
      const midday = sunrise && sunset
        ? new Date((new Date(sunrise).getTime() + new Date(sunset).getTime()) / 2).toISOString()
        : null;
      const major = toWindow(midday, "Midday major", 3.5, "Full moon overhead keeps bait active past noon.");
      if (major) windows.push(major);
    }
    if (normalized <= 0.1 || normalized >= 0.9) {
      const midnight = sunrise
        ? new Date(new Date(sunrise).getTime() - 6 * 60 * 60 * 1000).toISOString()
        : null;
      const overnight = toWindow(midnight, "Midnight bite", 3.5, "New moon darkness favors stealth feeders.");
      if (overnight) windows.push(overnight);
    }
  }

  return windows.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export function generateSyntheticTides({
  latitude,
  longitude,
  baseTime,
}: {
  latitude: number;
  longitude: number;
  baseTime: Date;
}): TidePrediction[] {
  const predictions: TidePrediction[] = [];
  const amplitudeSeed = Math.abs(Math.sin((latitude + longitude) * 0.12));
  const amplitude = SYNTHETIC_TIDE_BASE_AMPLITUDE + amplitudeSeed * SYNTHETIC_TIDE_VARIATION;
  const phaseOffset = Math.sin(latitude * 0.4 + longitude * 0.17) * Math.PI;
  const tidePeriodMs = 12.42 * 60 * 60 * 1000;

  for (let index = 0; index < SYNTHETIC_TIDE_POINTS; index += 1) {
    const timestamp = new Date(baseTime.getTime() + index * TIDE_INTERVAL_HOURS * 60 * 60 * 1000);
    const phase = ((timestamp.getTime() + phaseOffset * tidePeriodMs) / tidePeriodMs) * 2 * Math.PI;
    const heightMeters = Math.sin(phase) * amplitude;
    const derivative = Math.cos(phase) * amplitude;
    let trend: TideTrend = "slack";
    if (Math.abs(derivative) < 0.05) {
      trend = "slack";
    } else if (derivative > 0) {
      trend = "rising";
    } else {
      trend = "falling";
    }
    predictions.push({
      timestamp: timestamp.toISOString(),
      heightMeters: Math.round(heightMeters * 100) / 100,
      trend,
    });
  }

  return predictions;
}

function mapWeatherHours(response: OpenMeteoForecastResponse): ForecastWeatherHour[] {
  const hourly = response.hourly;
  if (!hourly || !hourly.time) return [];
  const total = Math.min(clampForecastHorizon(hourly.time.length), FORECAST_HORIZON_HOURS);
  const hours: ForecastWeatherHour[] = [];
  for (let index = 0; index < total; index += 1) {
    const timestampRaw = hourly.time[index];
    const timestamp = normalizeIsoString(timestampRaw);
    if (!timestamp) continue;
    const weatherCode = safeGet(hourly.weather_code, index);
    hours.push({
      timestamp,
      temperatureC: safeGet(hourly.temperature_2m, index),
      temperatureF: toFahrenheit(safeGet(hourly.temperature_2m, index)),
      apparentTemperatureC: safeGet(hourly.apparent_temperature, index),
      apparentTemperatureF: toFahrenheit(safeGet(hourly.apparent_temperature, index)),
      pressureHpa: safeGet(hourly.pressure_msl, index),
      windSpeedMph: toMilesPerHour(safeGet(hourly.wind_speed_10m, index)),
      windDirection: safeGet(hourly.wind_direction_10m, index),
      precipitationProbability: safeGet(hourly.precipitation_probability, index),
      weatherCode,
      weatherSummary: describeWeather(weatherCode),
    });
  }
  return hours;
}

function resolveSunCycle(daily: OpenMeteoDailyResponse | undefined): {
  sunrise: string | null;
  sunset: string | null;
  moonPhase: number | null;
} {
  if (!daily) {
    return { sunrise: null, sunset: null, moonPhase: null };
  }
  const sunrise = normalizeIsoString(daily.sunrise?.[0]);
  const sunset = normalizeIsoString(daily.sunset?.[0]);
  const moonPhaseRaw = daily.moon_phase?.[0];
  const moonPhase = Number.isFinite(moonPhaseRaw ?? NaN) ? (moonPhaseRaw as number) : null;
  return { sunrise, sunset, moonPhase };
}

async function fetchOpenMeteo({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}): Promise<OpenMeteoForecastResponse> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    hourly:
      "temperature_2m,apparent_temperature,pressure_msl,wind_speed_10m,wind_direction_10m,precipitation_probability,weather_code",
    daily: "sunrise,sunset,moon_phase",
    timezone: "auto",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    headers: {
      "User-Agent": "hookd-forecasts/1.0",
    },
    next: { revalidate: WEATHER_CACHE_TTL_MS / 1000 },
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as OpenMeteoForecastResponse;
  return payload;
}

function generateSyntheticForecast({
  latitude,
  longitude,
  baseTime,
}: {
  latitude: number;
  longitude: number;
  baseTime: Date;
}): OpenMeteoForecastResponse {
  const timezoneOffsetHours = Math.max(-12, Math.min(12, Math.round(longitude / 15)));
  const timezone =
    timezoneOffsetHours === 0 ? "UTC" : `UTC${timezoneOffsetHours > 0 ? "+" : ""}${timezoneOffsetHours}`;

  const horizon = clampForecastHorizon(FORECAST_HORIZON_HOURS);
  const base = new Date(baseTime);
  base.setUTCMinutes(0, 0, 0);

  const hourlyTime: string[] = [];
  const temperature2m: number[] = [];
  const apparentTemperature: number[] = [];
  const pressure: number[] = [];
  const windSpeed: number[] = [];
  const windDirection: number[] = [];
  const precipitationProbability: number[] = [];
  const weatherCode: number[] = [];

  const latitudeInfluence = Math.max(-8, Math.min(8, (Math.abs(latitude) / 90) * -6));
  const temperatureBaseline = 18 + latitudeInfluence;
  const temperatureAmplitude = 7 - Math.min(5, Math.abs(latitude) * 0.05);
  const humiditySeed = Math.sin((latitude + longitude) * 0.3);

  for (let index = 0; index < horizon; index += 1) {
    const timestamp = new Date(base.getTime() + index * 60 * 60 * 1000);
    hourlyTime.push(timestamp.toISOString());
    const dayFraction = ((timestamp.getUTCHours() + timestamp.getUTCMinutes() / 60) / 24) * 2 * Math.PI;
    const tempC = temperatureBaseline + temperatureAmplitude * Math.sin(dayFraction - 0.5);
    const feelsLike = tempC - 0.6 * Math.cos(dayFraction + humiditySeed);
    const pressureValue = 1012 + 6 * Math.sin(dayFraction + latitude / 15);
    const windSpeedValue = 8 + 4 * Math.abs(Math.sin(dayFraction + longitude / 20));
    const windDirectionValue = ((Math.abs(longitude) * 17 + index * 25) % 360 + 360) % 360;
    const precipitationValue = Math.max(
      5,
      Math.min(95, 45 + 35 * Math.sin(dayFraction + humiditySeed + latitude / 10)),
    );

    temperature2m.push(Math.round(tempC * 10) / 10);
    apparentTemperature.push(Math.round(feelsLike * 10) / 10);
    pressure.push(Math.round(pressureValue));
    windSpeed.push(Math.round(windSpeedValue * 10) / 10);
    windDirection.push(Math.round(windDirectionValue));
    precipitationProbability.push(Math.round(precipitationValue));

    let code = 1;
    if (precipitationValue > 70) {
      code = 63;
    } else if (precipitationValue > 45) {
      code = 51;
    }
    if (tempC <= 0) {
      code = precipitationValue > 40 ? 71 : 2;
    }
    weatherCode.push(code);
  }

  const dayStart = new Date(base);
  dayStart.setUTCHours(0, 0, 0, 0);
  const sunrise = new Date(dayStart.getTime() + (6 - timezoneOffsetHours) * 60 * 60 * 1000).toISOString();
  const sunset = new Date(dayStart.getTime() + (18 - timezoneOffsetHours) * 60 * 60 * 1000).toISOString();
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const synodicPeriodDays = 29.530588853;
  const currentDays = (base.getTime() - knownNewMoon) / (1000 * 60 * 60 * 24);
  const moonPhase = ((currentDays / synodicPeriodDays) % 1 + 1) % 1;

  return {
    latitude,
    longitude,
    timezone,
    hourly: {
      time: hourlyTime,
      temperature_2m: temperature2m,
      apparent_temperature: apparentTemperature,
      pressure_msl: pressure,
      wind_speed_10m: windSpeed,
      wind_direction_10m: windDirection,
      precipitation_probability: precipitationProbability,
      weather_code: weatherCode,
    },
    daily: {
      time: [dayStart.toISOString()],
      sunrise: [sunrise],
      sunset: [sunset],
      moon_phase: [moonPhase],
    },
  } satisfies OpenMeteoForecastResponse;
}

export async function getForecastBundle({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}): Promise<ForecastBundle> {
  const cacheKey = toCacheKey(latitude, longitude);
  return forecastCache.getOrSet(cacheKey, async () => {
    const now = new Date();
    let forecast: OpenMeteoForecastResponse | null = null;
    let weatherSource: ForecastSourceSummary = OPEN_METEO_SOURCE;

    try {
      forecast = await fetchOpenMeteo({ latitude, longitude });
    } catch (error) {
      console.warn("Open-Meteo fetch failed, generating synthetic forecast", error);
    }

    if (!forecast || !forecast.hourly?.time?.length) {
      forecast = generateSyntheticForecast({ latitude, longitude, baseTime: now });
      weatherSource = SYNTHETIC_WEATHER_SOURCE;
    }

    let weatherHours = mapWeatherHours(forecast);
    let { sunrise, sunset, moonPhase } = resolveSunCycle(forecast.daily);

    if (weatherHours.length === 0) {
      forecast = generateSyntheticForecast({ latitude, longitude, baseTime: now });
      weatherSource = SYNTHETIC_WEATHER_SOURCE;
      weatherHours = mapWeatherHours(forecast);
      ({ sunrise, sunset, moonPhase } = resolveSunCycle(forecast.daily));
    }

    const timezone = forecast.timezone ?? "UTC";
    const biteWindows = computeBiteWindows({
      sunrise,
      sunset,
      moonPhase,
      timezone,
      now,
    });
    const tides = generateSyntheticTides({
      latitude,
      longitude,
      baseTime: now,
    });
    return {
      updatedAt: new Date().toISOString(),
      location: {
        latitude,
        longitude,
        timezone,
        sunrise,
        sunset,
        moonPhaseFraction: moonPhase,
        moonPhaseLabel: moonPhaseLabel(moonPhase),
      },
      weather: {
        hours: weatherHours,
        source: weatherSource,
      },
      tides: {
        predictions: tides,
        source: SYNTHETIC_TIDES_SOURCE,
      },
      biteWindows: {
        windows: biteWindows,
        basis: "Derived from sunrise, sunset, and moon phase with near-term boost.",
      },
    } satisfies ForecastBundle;
  });
}
