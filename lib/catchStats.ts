import type {
  EnvironmentSnapshot,
  MoonPhaseBand,
  PressureBand,
  TimeOfDayBand,
} from './environmentTypes';

export type CatchLike = {
  trophy?: boolean | null;
  species?: string | null;
  weight?: string | null;
  weightValueLbs?: number | null;
  id?: string;
  environmentSnapshot?: Partial<EnvironmentSnapshot> | null;
  caughtAt?: string | Date | null;
  capturedAt?: string | Date | null;
  captureNormalizedAt?: string | Date | null;
  capturedAtDate?: Date | null;
  createdAt?: string | Date | null;
  createdAtDate?: Date | null;
};

export type PersonalBest = {
  catchId?: string;
  weight: number;
  weightText: string;
  species?: string;
};

export type CatchEnvironmentSummary = {
  sampleSize: number;
  typicalWeather: { description: string; code: number | null } | null;
  averageAirTempF: number | null;
  averageWaterTempF: number | null;
  typicalMoonPhase: MoonPhaseBand | null;
  typicalTimeOfDay: TimeOfDayBand | null;
  typicalPressure: PressureBand | null;
  prevailingWind: { direction: string | null; degrees: number | null; speedMph: number | null } | null;
};

export type CatchSummary = {
  totalCatches: number;
  trophyCount: number;
  trophyRate: number | null;
  uniqueSpeciesCount: number;
  personalBest: PersonalBest | null;
  averageCatchWeight: AverageCatchWeightSummary | null;
  mostCaughtSpecies: MostCaughtSpeciesSummary | null;
  recentActivity: RecentActivitySummary | null;
  environment: CatchEnvironmentSummary | null;
};

export type AverageCatchWeightSummary = {
  weight: number;
  weightText: string;
  sampleSize: number;
};

export type MostCaughtSpeciesSummary = {
  species: string;
  count: number;
  share: number | null;
};

export type RecentActivitySummary = {
  last7Days: number;
  last30Days: number;
  last90Days: number;
};

const POUNDS_PER_KILOGRAM = 2.2046226218;
const POUNDS_PER_GRAM = POUNDS_PER_KILOGRAM / 1000;
const POUNDS_PER_OUNCE = 1 / 16;
const OUNCES_PER_POUND = 16;

const WEIGHT_PATTERN = /(\d+(?:\.\d+)?)(?:\s*)(lbs?|pounds?|lb\.?|#|oz|ounces?|kgs?|kilograms?|kg\.?|g|grams?)?/gi;

const WIND_CARDINALS = [
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

function unitToPounds(value: number, unit?: string): number {
  if (!unit) {
    return value;
  }

  const normalized = unit.toLowerCase();

  if (/(^lbs?$)|pounds?|lb\.?|#/.test(normalized)) {
    return value;
  }

  if (/oz|ounces?/.test(normalized)) {
    return value * POUNDS_PER_OUNCE;
  }

  if (/kg|kilograms?/.test(normalized)) {
    return value * POUNDS_PER_KILOGRAM;
  }

  if (/g|grams?/.test(normalized)) {
    return value * POUNDS_PER_GRAM;
  }

  return value;
}

export function parseCatchWeight(rawWeight?: string | null): number | null {
  if (!rawWeight) {
    return null;
  }

  const normalizedWeight = rawWeight
    .replace(/(?<=\d),(?=\s*\d)/g, '')
    .replace(/[-–—/\\]/g, ' ')
    .replace(/[()\[\]]/g, ' ')
    .replace(/\band\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalizedWeight) {
    return null;
  }

  let total = 0;
  let matched = false;

  for (const match of normalizedWeight.matchAll(WEIGHT_PATTERN)) {
    const valueText = match[1]?.replace(/_/g, '') ?? '';
    const value = Number.parseFloat(valueText);
    if (Number.isNaN(value)) {
      continue;
    }

    matched = true;
    const unit = match[2];
    total += unitToPounds(value, unit);
  }

  if (!matched) {
    return null;
  }

  return total;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function celsiusToFahrenheit(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(((value * 9) / 5 + 32) * 100) / 100;
}

function metersPerSecondToMilesPerHour(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value * 2.23693629 * 100) / 100;
}

function formatWeightImperial(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 oz';
  }

  let totalOunces = Math.round(value * OUNCES_PER_POUND);
  if (totalOunces === 0) {
    totalOunces = 1;
  }

  let pounds = Math.floor(totalOunces / OUNCES_PER_POUND);
  let ounces = totalOunces % OUNCES_PER_POUND;

  if (ounces === OUNCES_PER_POUND) {
    pounds += 1;
    ounces = 0;
  }

  const parts: string[] = [];
  if (pounds > 0) {
    parts.push(`${pounds} lb`);
  }
  if (ounces > 0) {
    parts.push(`${ounces} oz`);
  }

  if (parts.length === 0) {
    return '0 oz';
  }

  return parts.join(' ');
}

function resolveAverageDirection(values: number[]): number | null {
  if (!values.length) return null;
  let x = 0;
  let y = 0;
  for (const degrees of values) {
    const radians = (degrees * Math.PI) / 180;
    x += Math.cos(radians);
    y += Math.sin(radians);
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9)) {
    return null;
  }
  const angle = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round(((angle + 360) % 360) * 100) / 100;
}

function toCardinalDirection(degrees: number | null): string | null {
  if (degrees == null) return null;
  const index = Math.round((degrees % 360) / 22.5) % WIND_CARDINALS.length;
  return WIND_CARDINALS[index] ?? null;
}

function mostCommonKey<K>(counts: Map<K, number>): K | null {
  let best: K | null = null;
  let bestCount = 0;
  counts.forEach((count, key) => {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  });
  return best;
}

type WeatherCountEntry = {
  count: number;
  description: string;
  code: number | null;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const candidate = new Date(value);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }
  if (typeof (value as { toDate?: () => unknown })?.toDate === 'function') {
    const converted = (value as { toDate: () => unknown }).toDate();
    return toDate(converted);
  }
  return null;
}

function resolveCatchTimestamp(catchItem: CatchLike): number | null {
  const candidates: Array<unknown> = [
    catchItem.captureNormalizedAt,
    catchItem.capturedAt,
    catchItem.caughtAt,
    catchItem.capturedAtDate,
    catchItem.createdAt,
    catchItem.createdAtDate,
  ];

  for (const candidate of candidates) {
    const parsed = toDate(candidate);
    if (parsed) {
      return parsed.getTime();
    }
  }

  return null;
}

export function summarizeCatchMetrics<T extends CatchLike>(catches: T[]): CatchSummary {
  const totalCatches = catches.length;
  let trophyCount = 0;
  const speciesSet = new Set<string>();
  const speciesCounts = new Map<string, { count: number; label: string }>();
  let personalBest: PersonalBest | null = null;
  let weightSampleCount = 0;
  let weightSampleTotal = 0;
  const weatherCounts = new Map<string, WeatherCountEntry>();
  const timeOfDayCounts = new Map<TimeOfDayBand, number>();
  const moonPhaseCounts = new Map<MoonPhaseBand, number>();
  const pressureCounts = new Map<PressureBand, number>();
  const windCardinalCounts = new Map<string, number>();
  const windDirectionSamples: number[] = [];
  const windSpeedSamples: number[] = [];
  const airTempSamples: number[] = [];
  const waterTempSamples: number[] = [];
  let environmentSamples = 0;
  let hasActivityTimestamps = false;
  let recentLast7 = 0;
  let recentLast30 = 0;
  let recentLast90 = 0;
  const nowMs = Date.now();
  const last7Ms = 7 * 24 * 60 * 60 * 1000;
  const last30Ms = 30 * 24 * 60 * 60 * 1000;
  const last90Ms = 90 * 24 * 60 * 60 * 1000;

  for (const catchItem of catches) {
    if (catchItem.trophy) {
      trophyCount += 1;
    }

    const species = catchItem.species?.trim();
    if (species) {
      const normalized = species.toLowerCase();
      speciesSet.add(normalized);
      const entry = speciesCounts.get(normalized);
      if (entry) {
        entry.count += 1;
      } else {
        speciesCounts.set(normalized, { count: 1, label: species });
      }
    }

    const environment = catchItem.environmentSnapshot;
    if (environment) {
      environmentSamples += 1;

      const weatherDescription = typeof environment.weatherDescription === 'string'
        ? environment.weatherDescription.trim()
        : '';
      if (weatherDescription) {
        const key = weatherDescription.toLowerCase();
        const entry = weatherCounts.get(key);
        if (entry) {
          entry.count += 1;
        } else {
          weatherCounts.set(key, {
            count: 1,
            description: weatherDescription,
            code: asNumber(environment.weatherCode),
          });
        }
      }

      const timeOfDay = environment.timeOfDayBand;
      if (timeOfDay) {
        timeOfDayCounts.set(timeOfDay, (timeOfDayCounts.get(timeOfDay) ?? 0) + 1);
      }

      const moonPhase = environment.moonPhaseBand;
      if (moonPhase) {
        moonPhaseCounts.set(moonPhase, (moonPhaseCounts.get(moonPhase) ?? 0) + 1);
      }

      const pressure = environment.pressureBand;
      if (pressure) {
        pressureCounts.set(pressure, (pressureCounts.get(pressure) ?? 0) + 1);
      }

      const windCardinal = typeof environment.windDirectionCardinal === 'string'
        ? environment.windDirectionCardinal.trim()
        : '';
      if (windCardinal) {
        windCardinalCounts.set(windCardinal, (windCardinalCounts.get(windCardinal) ?? 0) + 1);
      }

      const windDegrees = asNumber(environment.windDirectionDegrees);
      if (windDegrees != null) {
        windDirectionSamples.push(windDegrees);
      }

      const windSpeedMph = asNumber(environment.windSpeedMph)
        ?? metersPerSecondToMilesPerHour(asNumber(environment.windSpeedMps));
      if (windSpeedMph != null) {
        windSpeedSamples.push(windSpeedMph);
      }

      const airTempF = asNumber(environment.airTemperatureF)
        ?? celsiusToFahrenheit(asNumber(environment.airTemperatureC));
      if (airTempF != null) {
        airTempSamples.push(airTempF);
      }

      const waterTempF = asNumber(environment.waterTemperatureF)
        ?? celsiusToFahrenheit(asNumber(environment.waterTemperatureC));
      if (waterTempF != null) {
        waterTempSamples.push(waterTempF);
      }
    }

    const rawWeightText = catchItem.weight?.trim() ?? '';
    const parsedWeight = parseCatchWeight(rawWeightText || undefined);
    const numericWeight = asNumber(catchItem.weightValueLbs);
    const weightValue = parsedWeight ?? numericWeight;

    if (weightValue != null) {
      weightSampleTotal += weightValue;
      weightSampleCount += 1;
      if (!personalBest || weightValue > personalBest.weight) {
        const normalizedWeightText = (() => {
          if (parsedWeight != null && rawWeightText) {
            const trimmed = rawWeightText.trim();
            if (/[a-zA-Z]/.test(trimmed)) {
              return trimmed;
            }
          }
          return formatWeightImperial(weightValue);
        })();
        personalBest = {
          catchId: catchItem.id,
          weight: weightValue,
          weightText: normalizedWeightText,
          species: catchItem.species ?? undefined,
        };
      }
    }

    const timestamp = resolveCatchTimestamp(catchItem);
    if (timestamp != null) {
      const age = nowMs - timestamp;
      if (Number.isFinite(age)) {
        hasActivityTimestamps = true;
        if (age <= last7Ms && age >= 0) {
          recentLast7 += 1;
        }
        if (age <= last30Ms && age >= 0) {
          recentLast30 += 1;
        }
        if (age <= last90Ms && age >= 0) {
          recentLast90 += 1;
        }
      }
    }
  }

  let environment: CatchEnvironmentSummary | null = null;

  if (environmentSamples > 0) {
    const mostCommonWeatherKey = (() => {
      let bestKey: string | null = null;
      let bestCount = 0;
      weatherCounts.forEach((entry, key) => {
        if (entry.count > bestCount) {
          bestKey = key;
          bestCount = entry.count;
        }
      });
      return bestKey;
    })();

    const weatherEntry = mostCommonWeatherKey ? weatherCounts.get(mostCommonWeatherKey) ?? null : null;
    const typicalTimeOfDay = mostCommonKey(timeOfDayCounts);
    const typicalMoonPhase = mostCommonKey(moonPhaseCounts);
    const typicalPressure = mostCommonKey(pressureCounts);
    const prevailingWindCardinal = mostCommonKey(windCardinalCounts);
    const averageWindDegrees = resolveAverageDirection(windDirectionSamples);
    const prevailingWindDirection = prevailingWindCardinal
      ?? toCardinalDirection(averageWindDegrees);
    const prevailingWind: CatchEnvironmentSummary['prevailingWind'] = (
      prevailingWindDirection || averageWindDegrees != null || windSpeedSamples.length > 0
    )
      ? {
          direction: prevailingWindDirection,
          degrees: averageWindDegrees,
          speedMph: average(windSpeedSamples),
        }
      : null;

    environment = {
      sampleSize: environmentSamples,
      typicalWeather: weatherEntry
        ? { description: weatherEntry.description, code: weatherEntry.code ?? null }
        : null,
      averageAirTempF: average(airTempSamples),
      averageWaterTempF: average(waterTempSamples),
      typicalMoonPhase: typicalMoonPhase ?? null,
      typicalTimeOfDay: typicalTimeOfDay ?? null,
      typicalPressure: typicalPressure ?? null,
      prevailingWind,
    };
  }

  const trophyRate = totalCatches > 0 ? trophyCount / totalCatches : null;
  const averageWeightValue = weightSampleCount > 0 ? weightSampleTotal / weightSampleCount : null;
  const averageCatchWeight = averageWeightValue != null
    ? {
        weight: averageWeightValue,
        weightText: formatWeightImperial(averageWeightValue),
        sampleSize: weightSampleCount,
      }
    : null;

  let mostCaughtSpecies: MostCaughtSpeciesSummary | null = null;
  let bestSpeciesCount = 0;
  speciesCounts.forEach((entry) => {
    if (entry.count > bestSpeciesCount) {
      bestSpeciesCount = entry.count;
      mostCaughtSpecies = {
        species: entry.label,
        count: entry.count,
        share: totalCatches > 0 ? entry.count / totalCatches : null,
      };
    }
  });

  const recentActivity: RecentActivitySummary | null = hasActivityTimestamps
    ? { last7Days: recentLast7, last30Days: recentLast30, last90Days: recentLast90 }
    : null;

  return {
    totalCatches,
    trophyCount,
    trophyRate,
    uniqueSpeciesCount: speciesSet.size,
    personalBest,
    averageCatchWeight,
    mostCaughtSpecies,
    recentActivity,
    environment,
  };
}
