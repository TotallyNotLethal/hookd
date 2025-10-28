import { NextResponse } from 'next/server';

import { TtlCache } from '@/lib/server/ttlCache';
import { MAX_LEAD_LAG_DAYS } from '@/lib/environmentLimits';

import type {
  EnvironmentSnapshot,
  MoonPhaseBand,
  PressureBand,
  TimeOfDayBand,
} from '@/lib/environmentTypes';

const PRESSURE_HIGH = 1015;
const PRESSURE_LOW = 1008;
const PRESSURE_TREND_THRESHOLD = 0.3;
const MAX_FORWARD_HOURS = 6;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 64;
const MAX_LEAD_LAG_MS = MAX_LEAD_LAG_DAYS * 24 * 60 * 60 * 1000;

type EnvironmentCachePayload = {
  capture: EnvironmentSnapshot | null;
  slices: {
    offsetHours: number;
    timestampUtc: string;
    snapshot: EnvironmentSnapshot;
  }[];
};

const environmentCache = new TtlCache<EnvironmentCachePayload>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: CACHE_MAX_ENTRIES,
});

function toCacheKey({
  latitude,
  longitude,
  baseTimestamp,
  forwardHours,
}: {
  latitude: number;
  longitude: number;
  baseTimestamp: Date;
  forwardHours: number;
}) {
  const latBucket = latitude.toFixed(3);
  const lngBucket = longitude.toFixed(3);
  const hourBucket = Math.floor(baseTimestamp.getTime() / (60 * 60 * 1000));
  return `${latBucket}:${lngBucket}:${hourBucket}:${forwardHours}`;
}

const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Heavy freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Heavy rain showers',
  82: 'Violent rain showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Severe thunderstorm',
};

const CARDINAL_DIRECTIONS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
];

function normalizeToHour(date: Date) {
  return new Date(Math.floor(date.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000);
}

function clampForward(forward: number) {
  if (Number.isNaN(forward) || forward < 0) return 0;
  return Math.min(MAX_FORWARD_HOURS, Math.floor(forward));
}

function computeTimeOfDayBand(localHour: number): TimeOfDayBand {
  if (localHour >= 5 && localHour < 8) return 'dawn';
  if (localHour >= 8 && localHour < 18) return 'day';
  if (localHour >= 18 && localHour < 22) return 'dusk';
  return 'night';
}

function computeMoonPhaseBand(value: number | null | undefined): MoonPhaseBand {
  if (value == null || Number.isNaN(value)) return 'waxing';
  const normalized = ((value % 1) + 1) % 1;
  if (normalized < 0.125 || normalized >= 0.875) return 'new';
  if (normalized < 0.375) return 'waxing';
  if (normalized < 0.625) return 'full';
  if (normalized < 0.875) return 'waning';
  return 'new';
}

function computePressureBand(value: number | null | undefined): PressureBand {
  if (value == null || Number.isNaN(value)) return 'mid';
  if (value >= PRESSURE_HIGH) return 'high';
  if (value <= PRESSURE_LOW) return 'low';
  return 'mid';
}

function computePressureTrend(previous: number | null, next: number | null) {
  if (previous == null || next == null) return null;
  const delta = next - previous;
  if (delta > PRESSURE_TREND_THRESHOLD) return 'rising' as const;
  if (delta < -PRESSURE_TREND_THRESHOLD) return 'falling' as const;
  return 'steady' as const;
}

function describeWeather(code: number | null | undefined): string | null {
  if (code == null || Number.isNaN(code)) return null;
  const rounded = Math.round(code);
  return WEATHER_CODE_DESCRIPTIONS[rounded] ?? null;
}

function normalizeTemperature(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return value;
}

function celsiusToFahrenheit(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(((value * 9) / 5 + 32) * 100) / 100;
}

function normalizeWindSpeed(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return value;
}

function metersPerSecondToMilesPerHour(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value * 2.23693629 * 100) / 100;
}

function normalizeWindDirection(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const normalized = ((value % 360) + 360) % 360;
  return Math.round(normalized * 100) / 100;
}

function toCardinalDirection(value: number | null): string | null {
  if (value == null) return null;
  const index = Math.round((value % 360) / 22.5) % CARDINAL_DIRECTIONS.length;
  return CARDINAL_DIRECTIONS[index] ?? null;
}

function parseHourKey(value: string) {
  const normalized = value.length === 13 ? `${value}:00:00Z` : `${value.replace(' ', 'T')}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findNearestIndex(times: string[], targetKey: string) {
  const index = times.findIndex((time) => time.slice(0, 13) === targetKey);
  if (index >= 0) return index;
  let nearest = -1;
  let bestDiff = Number.POSITIVE_INFINITY;
  const targetMillis = parseHourKey(targetKey);
  for (let i = 0; i < times.length; i += 1) {
    const diff = Math.abs(parseHourKey(times[i].slice(0, 13)) - targetMillis);
    if (diff < bestDiff) {
      nearest = i;
      bestDiff = diff;
    }
  }
  return nearest;
}

function buildSnapshot({
  target,
  utcOffsetSeconds,
  timezone,
  moonPhase,
  moonIllumination,
  pressure,
  pressureBefore,
  pressureAfter,
  weatherCode,
  airTemperature,
  waterTemperature,
  windSpeed,
  windDirection,
}: {
  target: Date;
  utcOffsetSeconds: number;
  timezone: string;
  moonPhase: number | null;
  moonIllumination: number | null;
  pressure: number | null;
  pressureBefore: number | null;
  pressureAfter: number | null;
  weatherCode: number | null;
  airTemperature: number | null;
  waterTemperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
}): EnvironmentSnapshot {
  const normalizedCapture = normalizeToHour(target);
  const captureUtc = target.toISOString();
  const normalizedCaptureUtc = normalizedCapture.toISOString();
  const offsetMillis = utcOffsetSeconds * 1000;
  const localDate = new Date(target.getTime() + offsetMillis);
  const localHour = localDate.getUTCHours();
  const timeOfDayBand = computeTimeOfDayBand(localHour);
  const moonPhaseBand = computeMoonPhaseBand(moonPhase);
  const pressureBand = computePressureBand(pressure);
  const pressureTrend = computePressureTrend(pressureBefore, pressureAfter);
  const normalizedWeatherCode = weatherCode == null || Number.isNaN(weatherCode) ? null : Math.round(weatherCode);
  const weatherDescription = describeWeather(normalizedWeatherCode);
  const airTemperatureC = normalizeTemperature(airTemperature);
  const waterTemperatureC = normalizeTemperature(waterTemperature);
  const windSpeedMps = normalizeWindSpeed(windSpeed);
  const windSpeedMph = metersPerSecondToMilesPerHour(windSpeedMps);
  const windDirectionDegrees = normalizeWindDirection(windDirection);
  const windDirectionCardinal = toCardinalDirection(windDirectionDegrees);

  return {
    captureUtc,
    normalizedCaptureUtc,
    timezone,
    utcOffsetMinutes: Math.round((utcOffsetSeconds / 60) * 100) / 100,
    localHour,
    timeOfDayBand,
    moonPhase,
    moonIllumination,
    moonPhaseBand,
    surfacePressure: pressure,
    weatherCode: normalizedWeatherCode,
    weatherDescription,
    airTemperatureC,
    airTemperatureF: celsiusToFahrenheit(airTemperatureC),
    waterTemperatureC,
    waterTemperatureF: celsiusToFahrenheit(waterTemperatureC),
    windSpeedMps,
    windSpeedMph,
    windDirectionDegrees,
    windDirectionCardinal,
    pressureTrend,
    pressureBand,
    computedAtUtc: new Date().toISOString(),
    source: 'open-meteo',
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latParam = url.searchParams.get('lat') ?? url.searchParams.get('latitude');
  const lngParam = url.searchParams.get('lng') ?? url.searchParams.get('longitude');
  const timestampParam = url.searchParams.get('timestamp');
  const forwardParam = url.searchParams.get('forwardHours');

  if (!latParam || !lngParam || !timestampParam) {
    return NextResponse.json({ error: 'lat, lng, and timestamp are required' }, { status: 400 });
  }

  const latitude = Number.parseFloat(latParam);
  const longitude = Number.parseFloat(lngParam);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: 'Invalid latitude or longitude' }, { status: 400 });
  }

  const baseTimestamp = new Date(timestampParam);
  if (Number.isNaN(baseTimestamp.getTime())) {
    return NextResponse.json({ error: 'Invalid timestamp' }, { status: 400 });
  }

  const now = Date.now();
  const diff = Math.abs(baseTimestamp.getTime() - now);
  if (diff > MAX_LEAD_LAG_MS) {
    return NextResponse.json({ capture: null, slices: [] }, { status: 422 });
  }

  const forwardHours = clampForward(Number.parseInt(forwardParam ?? '0', 10));
  const targets: Date[] = [];
  for (let hour = 0; hour <= forwardHours; hour += 1) {
    targets.push(new Date(baseTimestamp.getTime() + hour * 60 * 60 * 1000));
  }

  const start = new Date(baseTimestamp.getTime() - 60 * 60 * 1000);
  const end = new Date(baseTimestamp.getTime() + (forwardHours + 2) * 60 * 60 * 1000);

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const cacheKey = toCacheKey({
    latitude,
    longitude,
    baseTimestamp,
    forwardHours,
  });

  const cached = environmentCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const forecastParams = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      hourly: 'surface_pressure,temperature_2m,weathercode,wind_speed_10m,wind_direction_10m',
      timezone: 'auto',
      start_date: startDate,
      end_date: endDate,
    });

    const marineParams = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      hourly: 'water_temperature',
      timezone: 'auto',
      start_date: startDate,
      end_date: endDate,
    });

    const astronomyParams = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      daily: 'moon_phase,moon_illumination',
      timezone: 'auto',
      start_date: startDate,
      end_date: endDate,
    });

    const marinePromise: Promise<Response | null> = fetch(
      `https://marine-api.open-meteo.com/v1/marine?${marineParams.toString()}`,
    ).catch((error) => {
      console.warn('Failed to fetch marine water temperature', error);
      return null;
    });

    const [forecastRes, astronomyRes, marineRes] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${forecastParams.toString()}`),
      fetch(`https://api.open-meteo.com/v1/astronomy?${astronomyParams.toString()}`),
      marinePromise,
    ]);

    if (!forecastRes.ok || !astronomyRes.ok) {
      const status = !forecastRes.ok ? forecastRes.status : astronomyRes.status;
      throw new Error(`Upstream error ${status}`);
    }

    const forecast = await forecastRes.json();
    const astronomy = await astronomyRes.json();
    let marine: any = null;
    if (marineRes?.ok) {
      marine = await marineRes.json();
    } else if (marineRes && !marineRes.ok) {
      console.warn('Marine API responded with status', marineRes.status);
    }

    const hourlyTimes: string[] = forecast?.hourly?.time ?? [];
    const hourlyPressures: number[] = forecast?.hourly?.surface_pressure ?? [];
    const hourlyWeatherCodes: number[] = forecast?.hourly?.weathercode ?? [];
    const hourlyAirTemperatures: number[] = forecast?.hourly?.temperature_2m ?? [];
    const hourlyWaterTemperatures: number[] =
      forecast?.hourly?.water_temperature ?? forecast?.hourly?.lake_temperature ?? [];
    const hourlyWindSpeeds: number[] = forecast?.hourly?.wind_speed_10m ?? [];
    const hourlyWindDirections: number[] = forecast?.hourly?.wind_direction_10m ?? [];
    const marineTimes: string[] = marine?.hourly?.time ?? [];
    const marineWaterTemperatures: number[] = marine?.hourly?.water_temperature ?? [];
    const marineUtcOffsetSeconds: number | null = marine?.utc_offset_seconds ?? null;
    const marineTimezone: string | null = marine?.timezone ?? null;
    const utcOffsetSeconds =
      forecast?.utc_offset_seconds ??
      astronomy?.utc_offset_seconds ??
      marineUtcOffsetSeconds ??
      0;
    const timezone = forecast?.timezone ?? astronomy?.timezone ?? marineTimezone ?? 'UTC';

    const dailyTimes: string[] = astronomy?.daily?.time ?? [];
    const dailyMoonPhase: number[] = astronomy?.daily?.moon_phase ?? [];
    const dailyMoonIllumination: number[] = astronomy?.daily?.moon_illumination ?? [];

    const slices = targets.map((target, index) => {
      const localDateKey = new Date(target.getTime() + utcOffsetSeconds * 1000)
        .toISOString()
        .slice(0, 13);
      const hourlyIndex = findNearestIndex(hourlyTimes, localDateKey);
      const pressure = hourlyIndex >= 0 ? hourlyPressures[hourlyIndex] ?? null : null;
      const pressureBefore = hourlyIndex > 0 ? hourlyPressures[hourlyIndex - 1] ?? null : null;
      const pressureAfter =
        hourlyIndex >= 0 && hourlyIndex + 1 < hourlyPressures.length
          ? hourlyPressures[hourlyIndex + 1] ?? null
          : null;
      const weatherCode = hourlyIndex >= 0 ? hourlyWeatherCodes[hourlyIndex] ?? null : null;
      const airTemperature = hourlyIndex >= 0 ? hourlyAirTemperatures[hourlyIndex] ?? null : null;
      const fallbackWaterTemperature =
        hourlyIndex >= 0 ? hourlyWaterTemperatures[hourlyIndex] ?? null : null;
      const marineDateKey = new Date(
        target.getTime() + (marineUtcOffsetSeconds ?? utcOffsetSeconds) * 1000,
      )
        .toISOString()
        .slice(0, 13);
      const marineIndex = findNearestIndex(marineTimes, marineDateKey);
      const marineWaterTemperature =
        marineIndex >= 0 ? marineWaterTemperatures[marineIndex] ?? null : null;
      const waterTemperature = marineWaterTemperature ?? fallbackWaterTemperature;
      const windSpeed = hourlyIndex >= 0 ? hourlyWindSpeeds[hourlyIndex] ?? null : null;
      const windDirection = hourlyIndex >= 0 ? hourlyWindDirections[hourlyIndex] ?? null : null;

      const dateKey = new Date(target.getTime() + utcOffsetSeconds * 1000)
        .toISOString()
        .slice(0, 10);
      const dailyIndex = dailyTimes.findIndex((time) => time.slice(0, 10) === dateKey);
      const moonPhase = dailyIndex >= 0 ? dailyMoonPhase[dailyIndex] ?? null : null;
      const moonIllumination = dailyIndex >= 0 ? dailyMoonIllumination[dailyIndex] ?? null : null;

      const snapshot = buildSnapshot({
        target,
        utcOffsetSeconds,
        timezone,
        moonPhase,
        moonIllumination,
        pressure: pressure ?? null,
        pressureBefore: pressureBefore ?? null,
        pressureAfter: pressureAfter ?? null,
        weatherCode: weatherCode ?? null,
        airTemperature: airTemperature ?? null,
        waterTemperature: waterTemperature ?? null,
        windSpeed: windSpeed ?? null,
        windDirection: windDirection ?? null,
      });

      return {
        offsetHours: index,
        timestampUtc: target.toISOString(),
        snapshot,
      };
    });

    const payload = {
      capture: slices[0]?.snapshot ?? null,
      slices,
    };

    environmentCache.set(cacheKey, payload);

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to load environment snapshot', error);
    return NextResponse.json({ error: 'Unable to load environment snapshot' }, { status: 502 });
  }
}
