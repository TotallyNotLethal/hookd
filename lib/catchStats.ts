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
  id?: string;
  environmentSnapshot?: Partial<EnvironmentSnapshot> | null;
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
  uniqueSpeciesCount: number;
  personalBest: PersonalBest | null;
  environment: CatchEnvironmentSummary | null;
};

const POUNDS_PER_KILOGRAM = 2.2046226218;
const POUNDS_PER_GRAM = POUNDS_PER_KILOGRAM / 1000;
const POUNDS_PER_OUNCE = 1 / 16;

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

  let total = 0;
  let matched = false;

  for (const match of rawWeight.matchAll(WEIGHT_PATTERN)) {
    const value = Number.parseFloat(match[1]);
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

export function summarizeCatchMetrics<T extends CatchLike>(catches: T[]): CatchSummary {
  const totalCatches = catches.length;
  let trophyCount = 0;
  const speciesSet = new Set<string>();
  let personalBest: PersonalBest | null = null;
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

  for (const catchItem of catches) {
    if (catchItem.trophy) {
      trophyCount += 1;
    }

    const species = catchItem.species?.trim();
    if (species) {
      speciesSet.add(species.toLowerCase());
    }

    const weightValue = parseCatchWeight(catchItem.weight);
    if (weightValue == null) {
      continue;
    }

    if (!personalBest || weightValue > personalBest.weight) {
      personalBest = {
        catchId: catchItem.id,
        weight: weightValue,
        weightText: catchItem.weight ?? `${weightValue.toFixed(2)} lb`,
        species: catchItem.species ?? undefined,
      };
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

  return {
    totalCatches,
    trophyCount,
    uniqueSpeciesCount: speciesSet.size,
    personalBest,
    environment,
  };
}
