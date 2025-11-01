import "server-only";

import { TtlCache } from "@/lib/server/ttlCache";

import type {
  BiteWindow,
  ForecastBundle,
  ForecastSourceSummary,
  ForecastTelemetryEvent,
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
const FORECAST_BUNDLE_VERSION = "2024-10-05";
const PREFETCH_INTERVAL_MS = 10 * 60 * 1000;
const NOAA_STATION_RADIUS_KM = 120;
const USGS_SEARCH_DELTA_DEGREES = 1.2;

type PrefetchCoordinate = {
  latitude: number;
  longitude: number;
  label: string;
};

type TideProviderResult = {
  predictions: TidePrediction[];
  source: ForecastSourceSummary;
  latencyMs: number;
  fallbackUsed: boolean;
};

type SolunarEnhancement = {
  sunrise: string | null;
  sunset: string | null;
  moonPhase: number | null;
  windows: BiteWindow[];
  basis: string;
  provider: ForecastSourceSummary;
};

const POPULAR_COORDINATES: PrefetchCoordinate[] = [
  { latitude: 29.9511, longitude: -90.0715, label: "New Orleans, LA" },
  { latitude: 47.6062, longitude: -122.3321, label: "Seattle, WA" },
  { latitude: 25.7617, longitude: -80.1918, label: "Miami, FL" },
  { latitude: 34.0195, longitude: -118.4912, label: "Santa Monica, CA" },
  { latitude: 41.805, longitude: -71.401, label: "Narragansett Bay, RI" },
  { latitude: 44.645, longitude: -63.57, label: "Halifax Harbour, NS" },
];

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

type NoaaStationResponse = {
  stations?: Array<{
    id: string;
    name: string;
    lat: string;
    lng?: string;
    lon?: string;
    status?: string;
  }>;
};

type NoaaPredictionsResponse = {
  predictions?: Array<{
    t: string;
    v: string;
    type?: string;
  }>;
};

type UsgsInstantaneousResponse = {
  value?: {
    timeSeries?: Array<{
      values?: Array<{
        value?: Array<{
          value?: string;
          dateTime?: string;
        }>;
      }>;
    }>;
  };
};

type SolunarPeriod = {
  start?: string;
  end?: string;
  rating?: number;
};

type SolunarResponse = {
  moonPhase?: number | string;
  moonIllumination?: number;
  sunRise?: string;
  sunSet?: string;
  major1Start?: string;
  major1Stop?: string;
  major2Start?: string;
  major2Stop?: string;
  minor1Start?: string;
  minor1Stop?: string;
  minor2Start?: string;
  minor2Stop?: string;
  rating?: number;
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

const fallbackForecastCache = new Map<string, ForecastBundle>();

const OPEN_METEO_SOURCE: ForecastSourceSummary = {
  id: "open-meteo",
  label: "Open-Meteo Forecast",
  url: "https://open-meteo.com/",
};

const SYNTHETIC_TIDES_SOURCE: ForecastSourceSummary = {
  id: "synthetic-harmonic",
  label: "Harmonic fallback",
  url: null,
  disclaimer: "Calculated locally when live tide providers are unavailable.",
  confidence: "low",
  status: "partial",
};

const SYNTHETIC_WEATHER_SOURCE: ForecastSourceSummary = {
  id: "synthetic-weather",
  label: "Synthetic weather model",
  url: null,
  disclaimer:
    "Generated locally when upstream weather services are unavailable. Data is approximate and for preview only.",
  confidence: "low",
  status: "partial",
};

const NOAA_TIDES_SOURCE: ForecastSourceSummary = {
  id: "noaa-coops",
  label: "NOAA CO-OPS",
  url: "https://api.tidesandcurrents.noaa.gov/",
  confidence: "high",
  status: "ok",
};

const USGS_TIDES_SOURCE: ForecastSourceSummary = {
  id: "usgs-water-services",
  label: "USGS Water Services",
  url: "https://waterservices.usgs.gov/",
  confidence: "medium",
  status: "ok",
};

const SOLUNAR_SOURCE: ForecastSourceSummary = {
  id: "solunar",
  label: "Solunar Forecast",
  url: "https://solunar.org/",
  confidence: "high",
  status: "ok",
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

function toTelemetry(providerId: string, message: string): ForecastTelemetryEvent {
  return {
    providerId,
    message,
    at: new Date().toISOString(),
  } satisfies ForecastTelemetryEvent;
}

function haversineDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(latitudeB - latitudeA);
  const dLon = toRadians(longitudeB - longitudeA);
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function clampNumber(value: number | string | null | undefined) {
  if (value == null) return null;
  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function formatCompactDate(date: Date) {
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  return `${year}${month}${day}`;
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function resolveTimezoneOffsetMinutes(timezone: string | null | undefined, reference: Date) {
  if (!timezone) {
    return -reference.getTimezoneOffset();
  }

  const trimmed = timezone.trim();
  if (trimmed === "UTC" || trimmed === "GMT") {
    return 0;
  }

  const utcOffsetMatch = /^UTC(?<sign>[+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(trimmed);
  if (utcOffsetMatch?.groups?.sign) {
    const sign = utcOffsetMatch.groups.sign === "-" ? -1 : 1;
    const hours = Number.parseInt(utcOffsetMatch[2] ?? "0", 10);
    const minutes = Number.parseInt(utcOffsetMatch[3] ?? "0", 10);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      const offset = sign * (hours * 60 + minutes);
      return Number.isNaN(offset) ? -reference.getTimezoneOffset() : offset;
    }
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(reference);
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const constructed = Date.UTC(
      Number.parseInt(lookup.year ?? "0", 10),
      Number.parseInt((lookup.month ?? "01"), 10) - 1,
      Number.parseInt(lookup.day ?? "01", 10),
      Number.parseInt(lookup.hour ?? "00", 10),
      Number.parseInt(lookup.minute ?? "00", 10),
      Number.parseInt(lookup.second ?? "00", 10)
    );
    const diffMinutes = Math.round((constructed - reference.getTime()) / (60 * 1000));
    return diffMinutes;
  } catch (error) {
    console.warn("Failed to resolve timezone offset", error);
    return -reference.getTimezoneOffset();
  }
}

function tideTrendFromNeighbors(
  current: number,
  previous: number | null,
  next: number | null
): TideTrend {
  const derivative =
    next != null
      ? next - current
      : previous != null
        ? current - previous
        : 0;
  if (Math.abs(derivative) < 0.02) return "slack";
  return derivative > 0 ? "rising" : "falling";
}

function metersFromFeet(value: number) {
  return Math.round(value * 0.3048 * 100) / 100;
}

function parseSolunarLocalTime(
  raw: string | undefined,
  referenceDate: Date,
  offsetMinutes: number
) {
  if (!raw) return null;
  const trimmed = raw.trim();
  const direct = parseTimestamp(trimmed);
  if (direct) return direct;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const seconds = match[3] ? Number.parseInt(match[3]!, 10) : 0;
  const meridiem = match[4]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  const referenceUtc = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
    hours,
    minutes,
    seconds
  );
  const adjusted = referenceUtc - offsetMinutes * 60 * 1000;
  return new Date(adjusted).toISOString();
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

async function findNearestNoaaStation({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const url = new URL("https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json");
  url.searchParams.set("type", "waterlevels");
  url.searchParams.set("units", "metric");
  url.searchParams.set("radius", NOAA_STATION_RADIUS_KM.toString());
  url.searchParams.set("lat", latitude.toFixed(4));
  url.searchParams.set("lon", longitude.toFixed(4));
  const headers: Record<string, string> = {
    "User-Agent": "hookd-forecasts/1.0",
  };
  const token = process.env.NOAA_API_TOKEN;
  if (token) {
    headers.token = token;
  }
  const response = await fetch(url.toString(), {
    headers,
    next: { revalidate: 12 * 60 * 60 },
  });
  if (!response.ok) {
    throw new Error(`NOAA station lookup failed with status ${response.status}`);
  }
  const payload = (await response.json()) as NoaaStationResponse;
  const stations = payload.stations ?? [];
  const scored = stations
    .map((station) => {
      const stationLat = clampNumber(station.lat);
      const stationLon = clampNumber(station.lng ?? station.lon);
      if (stationLat == null || stationLon == null) return null;
      if (station.status && station.status.toLowerCase() !== "active") return null;
      const distance = haversineDistanceKm(latitude, longitude, stationLat, stationLon);
      return { id: station.id, name: station.name, distance };
    })
    .filter((candidate): candidate is { id: string; name: string; distance: number } => candidate != null)
    .sort((a, b) => a.distance - b.distance);
  return scored[0] ?? null;
}

async function fetchNoaaTidePredictions({
  latitude,
  longitude,
  now,
}: {
  latitude: number;
  longitude: number;
  now: Date;
}): Promise<TideProviderResult> {
  const started = Date.now();
  const station = await findNearestNoaaStation({ latitude, longitude });
  if (!station) {
    throw new Error("No NOAA tide stations available within search radius");
  }
  const url = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  url.searchParams.set("product", "predictions");
  url.searchParams.set("application", "hookd");
  url.searchParams.set("datum", "MSL");
  url.searchParams.set("station", station.id);
  url.searchParams.set("units", "metric");
  url.searchParams.set("time_zone", "gmt");
  url.searchParams.set("interval", "h");
  url.searchParams.set("begin_date", formatCompactDate(now));
  url.searchParams.set("range", String(Math.max(24, FORECAST_HORIZON_HOURS + 12)));
  url.searchParams.set("format", "json");
  const headers: Record<string, string> = {
    "User-Agent": "hookd-forecasts/1.0",
  };
  const token = process.env.NOAA_API_TOKEN;
  if (token) {
    headers.token = token;
  }
  const response = await fetch(url.toString(), {
    headers,
    next: { revalidate: WEATHER_CACHE_TTL_MS / 1000 },
  });
  if (!response.ok) {
    throw new Error(`NOAA tide predictions failed with status ${response.status}`);
  }
  const payload = (await response.json()) as NoaaPredictionsResponse;
  const raw = payload.predictions ?? [];
  const nowMs = now.getTime();
  const horizonMs = nowMs + FORECAST_HORIZON_HOURS * 60 * 60 * 1000;
  const startWindowMs = nowMs - 60 * 60 * 1000;
  const entries = raw
    .map((entry) => {
      const timestamp = parseTimestamp(entry.t);
      const height = clampNumber(entry.v);
      if (!timestamp || height == null) return null;
      const timeMs = new Date(timestamp).getTime();
      if (timeMs < startWindowMs || timeMs > horizonMs) return null;
      return { timestamp, height: Math.round(height * 100) / 100 };
    })
    .filter((value): value is { timestamp: string; height: number } => value != null)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (entries.length === 0) {
    throw new Error(`NOAA returned no tide entries for station ${station.id}`);
  }
  const predictions: TidePrediction[] = entries.map((entry, index) => {
    const previous = index > 0 ? entries[index - 1]!.height : null;
    const next = index < entries.length - 1 ? entries[index + 1]!.height : null;
    return {
      timestamp: entry.timestamp,
      heightMeters: entry.height,
      trend: tideTrendFromNeighbors(entry.height, previous, next),
    } satisfies TidePrediction;
  });
  const finished = Date.now();
  return {
    predictions,
    source: {
      ...NOAA_TIDES_SOURCE,
      updatedAt: new Date().toISOString(),
    },
    latencyMs: finished - started,
    fallbackUsed: false,
  } satisfies TideProviderResult;
}

async function findNearestUsgsSite({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const url = new URL("https://waterservices.usgs.gov/nwis/site/");
  url.searchParams.set("format", "rdb");
  url.searchParams.set("parameterCd", "00065");
  url.searchParams.set(
    "bBox",
    `${(longitude - USGS_SEARCH_DELTA_DEGREES).toFixed(4)},${(latitude - USGS_SEARCH_DELTA_DEGREES).toFixed(4)},${(longitude + USGS_SEARCH_DELTA_DEGREES).toFixed(4)},${(latitude + USGS_SEARCH_DELTA_DEGREES).toFixed(4)}`
  );
  url.searchParams.set("siteStatus", "active");
  const headers: Record<string, string> = {
    "User-Agent": "hookd-forecasts/1.0",
  };
  const apiKey = process.env.USGS_WATER_SERVICES_API_KEY;
  if (apiKey) {
    headers["X-USGS-API-KEY"] = apiKey;
  }
  const response = await fetch(url.toString(), {
    headers,
    next: { revalidate: 12 * 60 * 60 },
  });
  if (!response.ok) {
    throw new Error(`USGS site lookup failed with status ${response.status}`);
  }
  const body = await response.text();
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const headerIndex = lines.findIndex((line) => line.startsWith("agency_cd"));
  if (headerIndex === -1) return null;
  const headersRow = lines[headerIndex]!.split("\t");
  const siteIndex = headersRow.indexOf("site_no");
  const latIndex = headersRow.indexOf("dec_lat_va");
  const lonIndex = headersRow.indexOf("dec_long_va");
  const dataRows = lines.slice(headerIndex + 1).filter((line) => !/^\d+s/.test(line) && line !== "END");
  const candidates = dataRows
    .map((row) => {
      const parts = row.split("\t");
      const site = parts[siteIndex];
      const lat = clampNumber(parts[latIndex]);
      const lon = clampNumber(parts[lonIndex]);
      if (!site || lat == null || lon == null) return null;
      const distance = haversineDistanceKm(latitude, longitude, lat, lon);
      return { site, distance };
    })
    .filter((value): value is { site: string; distance: number } => value != null)
    .sort((a, b) => a.distance - b.distance);
  return candidates[0] ?? null;
}

async function fetchUsgsTidePredictions({
  latitude,
  longitude,
  now,
}: {
  latitude: number;
  longitude: number;
  now: Date;
}): Promise<TideProviderResult> {
  const started = Date.now();
  const site = await findNearestUsgsSite({ latitude, longitude });
  if (!site) {
    throw new Error("USGS water level site not found near coordinates");
  }
  const url = new URL("https://waterservices.usgs.gov/nwis/iv/");
  url.searchParams.set("format", "json");
  url.searchParams.set("parameterCd", "00065");
  url.searchParams.set("sites", site.site);
  const startWindow = new Date(now.getTime() - 60 * 60 * 1000);
  const endWindow = new Date(now.getTime() + FORECAST_HORIZON_HOURS * 60 * 60 * 1000);
  url.searchParams.set("startDT", startWindow.toISOString());
  url.searchParams.set("endDT", endWindow.toISOString());
  const headers: Record<string, string> = {
    "User-Agent": "hookd-forecasts/1.0",
  };
  const apiKey = process.env.USGS_WATER_SERVICES_API_KEY;
  if (apiKey) {
    headers["X-USGS-API-KEY"] = apiKey;
  }
  const response = await fetch(url.toString(), {
    headers,
    next: { revalidate: WEATHER_CACHE_TTL_MS / 1000 },
  });
  if (!response.ok) {
    throw new Error(`USGS instantaneous values failed with status ${response.status}`);
  }
  const payload = (await response.json()) as UsgsInstantaneousResponse;
  const series = payload.value?.timeSeries?.[0]?.values?.[0]?.value ?? [];
  const entries = series
    .map((point) => {
      const heightFeet = clampNumber(point.value ?? null);
      const timestamp = parseTimestamp(point.dateTime ?? null);
      if (heightFeet == null || !timestamp) return null;
      return { timestamp, height: metersFromFeet(heightFeet) };
    })
    .filter((value): value is { timestamp: string; height: number } => value != null)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (entries.length === 0) {
    throw new Error(`USGS returned no gauge height values for site ${site.site}`);
  }
  const predictions: TidePrediction[] = entries.map((entry, index) => {
    const previous = index > 0 ? entries[index - 1]!.height : null;
    const next = index < entries.length - 1 ? entries[index + 1]!.height : null;
    return {
      timestamp: entry.timestamp,
      heightMeters: Math.round(entry.height * 100) / 100,
      trend: tideTrendFromNeighbors(entry.height, previous, next),
    } satisfies TidePrediction;
  });
  const finished = Date.now();
  return {
    predictions,
    source: {
      ...USGS_TIDES_SOURCE,
      updatedAt: new Date().toISOString(),
    },
    latencyMs: finished - started,
    fallbackUsed: true,
  } satisfies TideProviderResult;
}

async function fetchSolunarEnhancement({
  latitude,
  longitude,
  timezone,
  now,
}: {
  latitude: number;
  longitude: number;
  timezone: string;
  now: Date;
}): Promise<SolunarEnhancement | null> {
  const offsetMinutes = resolveTimezoneOffsetMinutes(timezone, now);
  const dateStamp = formatCompactDate(now);
  const url = new URL(
    `https://api.solunar.org/solunar/${latitude.toFixed(4)},${longitude.toFixed(4)},${dateStamp},${offsetMinutes}`
  );
  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "hookd-forecasts/1.0",
    },
    next: { revalidate: WEATHER_CACHE_TTL_MS / 1000 },
  });
  if (!response.ok) {
    throw new Error(`Solunar request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as SolunarResponse;
  const sunrise = parseSolunarLocalTime(payload.sunRise, now, offsetMinutes);
  const sunset = parseSolunarLocalTime(payload.sunSet, now, offsetMinutes);
  let moonPhaseFraction: number | null = null;
  const moonPhaseRaw = payload.moonPhase;
  if (typeof moonPhaseRaw === "number") {
    moonPhaseFraction = moonPhaseRaw > 1 ? moonPhaseRaw / 100 : moonPhaseRaw;
  } else if (typeof moonPhaseRaw === "string") {
    const numeric = Number.parseFloat(moonPhaseRaw);
    if (Number.isFinite(numeric)) {
      moonPhaseFraction = numeric > 1 ? numeric / 100 : numeric;
    }
  }
  const windows: BiteWindow[] = [];
  const registerWindow = (
    startRaw: string | undefined,
    endRaw: string | undefined,
    label: string,
    baseScore: number,
    rationale: string
  ) => {
    const start = parseSolunarLocalTime(startRaw, now, offsetMinutes);
    const end = parseSolunarLocalTime(endRaw, now, offsetMinutes);
    if (!start || !end) return;
    windows.push({
      start,
      end,
      label,
      score: Math.max(1, Math.min(5, Math.round(baseScore))) as BiteWindow["score"],
      rationale,
    });
  };
  registerWindow(payload.major1Start, payload.major1Stop, "Major feeding", 5, "Solunar major period");
  registerWindow(payload.major2Start, payload.major2Stop, "Major feeding", 5, "Solunar major period");
  registerWindow(payload.minor1Start, payload.minor1Stop, "Minor feeding", 4, "Solunar minor period");
  registerWindow(payload.minor2Start, payload.minor2Stop, "Minor feeding", 4, "Solunar minor period");
  const basisRating = payload.rating != null ? `Rating ${payload.rating}` : "Major/minor cycles";
  return {
    sunrise: sunrise ?? null,
    sunset: sunset ?? null,
    moonPhase: moonPhaseFraction,
    windows,
    basis: `Solunar tables (${basisRating}) blended with local daylight.`,
    provider: {
      ...SOLUNAR_SOURCE,
      updatedAt: new Date().toISOString(),
      confidence: windows.length > 0 ? "high" : SOLUNAR_SOURCE.confidence,
    },
  } satisfies SolunarEnhancement;
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

async function buildForecastBundle({
  latitude,
  longitude,
  cacheKey,
  origin,
}: {
  latitude: number;
  longitude: number;
  cacheKey: string;
  origin: "request" | "prefetch";
}): Promise<ForecastBundle> {
  const now = new Date();
  const telemetry: ForecastBundle["telemetry"] = {
    errors: [],
    warnings: [],
    providerLatencyMs: {},
    usedPrefetch: origin === "prefetch",
  };

  let forecast: OpenMeteoForecastResponse | null = null;
  let weatherSource: ForecastSourceSummary = {
    ...OPEN_METEO_SOURCE,
    updatedAt: new Date().toISOString(),
    confidence: "high",
    status: "ok",
  };

  try {
    const started = Date.now();
    forecast = await fetchOpenMeteo({ latitude, longitude });
    telemetry.providerLatencyMs[OPEN_METEO_SOURCE.id] = Date.now() - started;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    telemetry.errors.push(toTelemetry(OPEN_METEO_SOURCE.id, message));
    forecast = null;
  }

  if (!forecast || !forecast.hourly?.time?.length) {
    forecast = generateSyntheticForecast({ latitude, longitude, baseTime: now });
    weatherSource = {
      ...SYNTHETIC_WEATHER_SOURCE,
      updatedAt: new Date().toISOString(),
      status: "error",
      error: "Open-Meteo unavailable – using synthetic weather",
    };
    telemetry.warnings.push(toTelemetry(SYNTHETIC_WEATHER_SOURCE.id, "Synthetic weather fallback engaged"));
    telemetry.providerLatencyMs[SYNTHETIC_WEATHER_SOURCE.id] = 0;
  }

  let weatherHours = mapWeatherHours(forecast);
  let { sunrise, sunset, moonPhase } = resolveSunCycle(forecast.daily);

  if (weatherHours.length === 0) {
    forecast = generateSyntheticForecast({ latitude, longitude, baseTime: now });
    weatherSource = {
      ...SYNTHETIC_WEATHER_SOURCE,
      updatedAt: new Date().toISOString(),
      status: "error",
      error: "Primary weather returned no hourly data",
    };
    weatherHours = mapWeatherHours(forecast);
    ({ sunrise, sunset, moonPhase } = resolveSunCycle(forecast.daily));
    telemetry.errors.push(toTelemetry(OPEN_METEO_SOURCE.id, "No hourly weather data available – synthetic generated"));
    telemetry.providerLatencyMs[SYNTHETIC_WEATHER_SOURCE.id] = 0;
  }

  const timezone = forecast.timezone ?? "UTC";

  let solunarEnhancement: SolunarEnhancement | null = null;
  try {
    const started = Date.now();
    solunarEnhancement = await fetchSolunarEnhancement({ latitude, longitude, timezone, now });
    if (solunarEnhancement) {
      telemetry.providerLatencyMs[SOLUNAR_SOURCE.id] = Date.now() - started;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    telemetry.warnings.push(toTelemetry(SOLUNAR_SOURCE.id, message));
  }

  if (solunarEnhancement) {
    if (solunarEnhancement.sunrise) sunrise = solunarEnhancement.sunrise;
    if (solunarEnhancement.sunset) sunset = solunarEnhancement.sunset;
    if (solunarEnhancement.moonPhase != null) moonPhase = solunarEnhancement.moonPhase;
  }

  const baseBiteWindows = computeBiteWindows({
    sunrise,
    sunset,
    moonPhase,
    timezone,
    now,
  });

  const combinedWindows = [...baseBiteWindows];
  if (solunarEnhancement?.windows.length) {
    const seen = new Set(combinedWindows.map((window) => `${window.label}:${window.start}`));
    for (const window of solunarEnhancement.windows) {
      const key = `${window.label}:${window.start}`;
      if (!seen.has(key)) {
        combinedWindows.push(window);
        seen.add(key);
      }
    }
    combinedWindows.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  let tideResult: TideProviderResult | null = null;
  try {
    tideResult = await fetchNoaaTidePredictions({ latitude, longitude, now });
    telemetry.providerLatencyMs[tideResult.source.id] = tideResult.latencyMs;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    telemetry.errors.push(toTelemetry(NOAA_TIDES_SOURCE.id, message));
    try {
      const usgsResult = await fetchUsgsTidePredictions({ latitude, longitude, now });
      usgsResult.source = {
        ...usgsResult.source,
        status: "partial",
        disclaimer: "USGS gauge substituted for NOAA tide predictions.",
      };
      tideResult = usgsResult;
      telemetry.providerLatencyMs[usgsResult.source.id] = usgsResult.latencyMs;
      telemetry.warnings.push(toTelemetry(usgsResult.source.id, "Using USGS fallback for tides"));
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      telemetry.errors.push(toTelemetry(USGS_TIDES_SOURCE.id, fallbackMessage));
    }
  }

  if (!tideResult) {
    const syntheticPredictions = generateSyntheticTides({
      latitude,
      longitude,
      baseTime: now,
    });
    tideResult = {
      predictions: syntheticPredictions,
      source: {
        ...SYNTHETIC_TIDES_SOURCE,
        updatedAt: new Date().toISOString(),
        status: "error",
        error: "Live tide providers unavailable",
      },
      latencyMs: 0,
      fallbackUsed: true,
    } satisfies TideProviderResult;
    telemetry.warnings.push(toTelemetry(SYNTHETIC_TIDES_SOURCE.id, "Synthetic tide fallback engaged"));
  }

  const tideSource: ForecastSourceSummary = {
    ...tideResult.source,
    updatedAt: tideResult.source.updatedAt ?? new Date().toISOString(),
    status: tideResult.source.status ?? (tideResult.fallbackUsed ? "partial" : "ok"),
  };

  const bundle: ForecastBundle = {
    version: FORECAST_BUNDLE_VERSION,
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
      predictions: tideResult.predictions,
      source: tideSource,
      fallbackUsed: tideResult.fallbackUsed,
    },
    biteWindows: {
      windows: combinedWindows,
      basis:
        solunarEnhancement?.basis ??
        "Derived from sunrise, sunset, and moon phase with near-term boost.",
      provider: solunarEnhancement?.provider,
    },
    telemetry,
  } satisfies ForecastBundle;

  fallbackForecastCache.set(cacheKey, structuredClone(bundle));
  return bundle;
}

export async function getForecastBundle({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}): Promise<ForecastBundle> {
  const cacheKey = toCacheKey(latitude, longitude);
  try {
    return await forecastCache.getOrSet(cacheKey, () =>
      buildForecastBundle({ latitude, longitude, cacheKey, origin: "request" })
    );
  } catch (error) {
    const fallback = fallbackForecastCache.get(cacheKey);
    if (fallback) {
      const message = error instanceof Error ? error.message : String(error);
      const clone = structuredClone(fallback);
      clone.updatedAt = new Date().toISOString();
      clone.telemetry.warnings = [
        ...clone.telemetry.warnings,
        toTelemetry("composite", `Persisted fallback served: ${message}`),
      ];
      forecastCache.set(cacheKey, clone, WEATHER_CACHE_TTL_MS / 2);
      return clone;
    }
    throw error;
  }
}

async function prefetchPopularForecasts() {
  await Promise.allSettled(
    POPULAR_COORDINATES.map(async ({ latitude, longitude, label }) => {
      const cacheKey = toCacheKey(latitude, longitude);
      try {
        const bundle = await buildForecastBundle({
          latitude,
          longitude,
          cacheKey,
          origin: "prefetch",
        });
        forecastCache.set(cacheKey, bundle);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Forecast prefetch failed for ${label}:`, message);
      }
    })
  );
}

function schedulePrefetchLoop() {
  prefetchPopularForecasts()
    .catch((error) => {
      console.warn("Initial forecast prefetch failed", error);
    })
    .finally(() => {
      const timer: ReturnType<typeof setTimeout> = setTimeout(schedulePrefetchLoop, PREFETCH_INTERVAL_MS);
      const nodeTimer = timer as unknown as { unref?: () => void };
      if (typeof nodeTimer.unref === "function") {
        nodeTimer.unref();
      }
    });
}

const globalPrefetchState = globalThis as { __hookdForecastPrefetchScheduled?: boolean };
if (!globalPrefetchState.__hookdForecastPrefetchScheduled) {
  globalPrefetchState.__hookdForecastPrefetchScheduled = true;
  schedulePrefetchLoop();
}
