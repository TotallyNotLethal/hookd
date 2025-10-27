import { NextResponse } from 'next/server';

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
}: {
  target: Date;
  utcOffsetSeconds: number;
  timezone: string;
  moonPhase: number | null;
  moonIllumination: number | null;
  pressure: number | null;
  pressureBefore: number | null;
  pressureAfter: number | null;
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

  const forwardHours = clampForward(Number.parseInt(forwardParam ?? '0', 10));
  const targets: Date[] = [];
  for (let hour = 0; hour <= forwardHours; hour += 1) {
    targets.push(new Date(baseTimestamp.getTime() + hour * 60 * 60 * 1000));
  }

  const start = new Date(baseTimestamp.getTime() - 60 * 60 * 1000);
  const end = new Date(baseTimestamp.getTime() + (forwardHours + 2) * 60 * 60 * 1000);

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  try {
    const forecastParams = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      hourly: 'surface_pressure',
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

    const [forecastRes, astronomyRes] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${forecastParams.toString()}`),
      fetch(`https://api.open-meteo.com/v1/astronomy?${astronomyParams.toString()}`),
    ]);

    if (!forecastRes.ok || !astronomyRes.ok) {
      const status = !forecastRes.ok ? forecastRes.status : astronomyRes.status;
      throw new Error(`Upstream error ${status}`);
    }

    const forecast = await forecastRes.json();
    const astronomy = await astronomyRes.json();

    const hourlyTimes: string[] = forecast?.hourly?.time ?? [];
    const hourlyPressures: number[] = forecast?.hourly?.surface_pressure ?? [];
    const utcOffsetSeconds = forecast?.utc_offset_seconds ?? astronomy?.utc_offset_seconds ?? 0;
    const timezone = forecast?.timezone ?? astronomy?.timezone ?? 'UTC';

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
      });

      return {
        offsetHours: index,
        timestampUtc: target.toISOString(),
        snapshot,
      };
    });

    return NextResponse.json({
      capture: slices[0]?.snapshot ?? null,
      slices,
    });
  } catch (error) {
    console.error('Failed to load environment snapshot', error);
    return NextResponse.json({ error: 'Unable to load environment snapshot' }, { status: 502 });
  }
}
