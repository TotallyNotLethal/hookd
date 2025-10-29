import { NextResponse } from 'next/server';

import { fetchWeatherApi } from 'openmeteo';
import type { VariablesWithTime } from '@openmeteo/sdk/variables-with-time';
import { Variable } from '@openmeteo/sdk/variable.js';

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
const HISTORICAL_THRESHOLD_DAYS = 7;
const HISTORICAL_THRESHOLD_MS = HISTORICAL_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

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

function toHourlyIsoString(date: Date) {
  return `${date.toISOString().slice(0, 13)}:00`;
}

function toDailyIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function computeSeriesLength(series: VariablesWithTime | null | undefined) {
  if (!series) return 0;
  const start = Number(series.time());
  const end = Number(series.timeEnd());
  const interval = series.interval();
  let length = 0;
  if (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    Number.isFinite(interval) &&
    interval > 0 &&
    end >= start
  ) {
    length = Math.round((end - start) / interval);
  }
  if (length <= 0) {
    const firstVariable = series.variables(0);
    if (firstVariable) {
      const valuesArray = firstVariable.valuesArray();
      if (valuesArray) {
        length = valuesArray.length;
      } else {
        const valuesLength = firstVariable.valuesLength();
        if (Number.isFinite(valuesLength) && valuesLength > 0) {
          length = valuesLength;
        }
      }
    }
  }
  return length > 0 ? length : 0;
}

function buildSeriesTimes(
  series: VariablesWithTime | null | undefined,
  utcOffsetSeconds: number,
  formatter: (date: Date) => string,
) {
  if (!series) return [] as string[];
  const length = computeSeriesLength(series);
  if (length <= 0) return [];
  const start = Number(series.time());
  const interval = series.interval();
  if (!Number.isFinite(start) || !Number.isFinite(interval) || interval <= 0) {
    return [];
  }
  const times: string[] = [];
  for (let i = 0; i < length; i += 1) {
    const timestampSeconds = start + i * interval;
    const date = new Date((timestampSeconds + utcOffsetSeconds) * 1000);
    times.push(formatter(date));
  }
  return times;
}

function getVariableValues(series: VariablesWithTime | null | undefined, index: number) {
  if (!series || index < 0 || index >= series.variablesLength()) return [] as number[];
  const variable = series.variables(index);
  if (!variable) return [] as number[];
  const valuesArray = variable.valuesArray();
  if (valuesArray) return Array.from(valuesArray);
  const length = variable.valuesLength();
  if (!Number.isFinite(length) || length <= 0) return [] as number[];
  const values: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const value = variable.values(i);
    values.push(value ?? Number.NaN);
  }
  return values;
}

function findVariableValuesByEnum(
  series: VariablesWithTime | null | undefined,
  allowedVariables: Variable[],
) {
  if (!series || allowedVariables.length === 0) return [] as number[];
  for (let i = 0; i < series.variablesLength(); i += 1) {
    const variable = series.variables(i);
    if (!variable) continue;
    if (allowedVariables.includes(variable.variable())) {
      const valuesArray = variable.valuesArray();
      if (valuesArray) return Array.from(valuesArray);
      const length = variable.valuesLength();
      if (!Number.isFinite(length) || length <= 0) return [] as number[];
      const values: number[] = [];
      for (let j = 0; j < length; j += 1) {
        const value = variable.values(j);
        values.push(value ?? Number.NaN);
      }
      return values;
    }
  }
  return [] as number[];
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

  if (!latParam || !lngParam) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  const latitude = Number.parseFloat(latParam);
  const longitude = Number.parseFloat(lngParam);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: 'Invalid latitude or longitude' }, { status: 400 });
  }

  const now = Date.now();

  let baseTimestamp: Date;
  if (!timestampParam) {
    baseTimestamp = new Date(now);
  } else {
    const parsed = new Date(timestampParam);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid timestamp' }, { status: 400 });
    }
    baseTimestamp = parsed;
  }

  const baseTimestampMs = baseTimestamp.getTime();
  const diff = Math.abs(baseTimestampMs - now);
  if (diff > MAX_LEAD_LAG_MS) {
    return NextResponse.json({ capture: null, slices: [] }, { status: 422 });
  }

  const forwardHours = clampForward(Number.parseInt(forwardParam ?? '0', 10));
  const isHistoricalCapture = baseTimestampMs < now - HISTORICAL_THRESHOLD_MS;
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
    const forecastParams = {
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      hourly: 'surface_pressure,temperature_2m,weather_code,wind_speed_10m,wind_direction_10m',
      timezone: 'auto',
      start_date: startDate,
      end_date: endDate,
      wind_speed_unit: 'ms',
    };

    const marineParams = {
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      hourly: 'water_temperature',
      timezone: 'auto',
      start_date: startDate,
      end_date: endDate,
    };

    const astronomyParams = {
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      daily: 'moon_phase,moon_illumination',
      timezone: 'auto',
      start_date: startDate,
      end_date: endDate,
    };

    const weatherUrl = isHistoricalCapture
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast';

    const marinePromise = fetchWeatherApi('https://marine-api.open-meteo.com/v1/marine', marineParams)
      .then((responses) => responses[0] ?? null)
      .catch((error) => {
        console.warn('Failed to fetch marine water temperature', error);
        return null;
      });

    const [forecastResponses, astronomyResponses, marineResponse] = await Promise.all([
      fetchWeatherApi(weatherUrl, forecastParams),
      fetchWeatherApi('https://api.open-meteo.com/v1/astronomy', astronomyParams),
      marinePromise,
    ]);

    const forecastResponse = forecastResponses?.[0] ?? null;
    const astronomyResponse = astronomyResponses?.[0] ?? null;

    if (!forecastResponse || !astronomyResponse) {
      throw new Error('Unable to load required forecast data');
    }

    const forecastHourly = forecastResponse.hourly();
    const astronomyDaily = astronomyResponse.daily();
    const marineHourly = marineResponse?.hourly() ?? null;

    const forecastUtcOffsetSeconds = forecastResponse.utcOffsetSeconds();
    const astronomyUtcOffsetSeconds = astronomyResponse.utcOffsetSeconds();
    const marineUtcOffsetSeconds = marineResponse?.utcOffsetSeconds() ?? null;
    const marineTimezone = marineResponse?.timezone() ?? null;
    const utcOffsetSeconds =
      forecastUtcOffsetSeconds ??
      astronomyUtcOffsetSeconds ??
      marineUtcOffsetSeconds ??
      0;
    const timezone =
      forecastResponse.timezone() ??
      astronomyResponse.timezone() ??
      marineTimezone ??
      'UTC';

    const hourlyTimes = buildSeriesTimes(
      forecastHourly,
      forecastUtcOffsetSeconds ?? utcOffsetSeconds,
      toHourlyIsoString,
    );
    const hourlyPressures = getVariableValues(forecastHourly, 0);
    const hourlyAirTemperatures = getVariableValues(forecastHourly, 1);
    const hourlyWeatherCodes = getVariableValues(forecastHourly, 2);
    const hourlyWindSpeeds = getVariableValues(forecastHourly, 3);
    const hourlyWindDirections = getVariableValues(forecastHourly, 4);
    const hourlyWaterTemperatures = findVariableValuesByEnum(forecastHourly, [
      Variable.sea_surface_temperature,
    ]);

    const marineTimes =
      marineResponse != null
        ? buildSeriesTimes(marineHourly, marineUtcOffsetSeconds ?? utcOffsetSeconds, toHourlyIsoString)
        : [];
    const marineWaterTemperatures =
      marineResponse != null ? getVariableValues(marineHourly, 0) : [];

    const dailyTimes = buildSeriesTimes(
      astronomyDaily,
      astronomyUtcOffsetSeconds ?? utcOffsetSeconds,
      toDailyIsoDate,
    );
    const dailyMoonPhase = getVariableValues(astronomyDaily, 0);
    const dailyMoonIllumination = getVariableValues(astronomyDaily, 1);

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
