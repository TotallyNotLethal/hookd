export type CatchLike = {
  trophy?: boolean | null;
  species?: string | null;
  weight?: string | null;
  id?: string;
};

export type PersonalBest = {
  catchId?: string;
  weight: number;
  weightText: string;
  species?: string;
};

export type CatchSummary = {
  totalCatches: number;
  trophyCount: number;
  uniqueSpeciesCount: number;
  personalBest: PersonalBest | null;
};

const POUNDS_PER_KILOGRAM = 2.2046226218;
const POUNDS_PER_GRAM = POUNDS_PER_KILOGRAM / 1000;
const POUNDS_PER_OUNCE = 1 / 16;

const WEIGHT_PATTERN = /(\d+(?:\.\d+)?)(?:\s*)(lbs?|pounds?|lb\.?|#|oz|ounces?|kgs?|kilograms?|kg\.?|g|grams?)?/gi;

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

export function summarizeCatchMetrics<T extends CatchLike>(catches: T[]): CatchSummary {
  const totalCatches = catches.length;
  let trophyCount = 0;
  const speciesSet = new Set<string>();
  let personalBest: PersonalBest | null = null;

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
  }

  return {
    totalCatches,
    trophyCount,
    uniqueSpeciesCount: speciesSet.size,
    personalBest,
  };
}
