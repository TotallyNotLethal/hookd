export type Coordinates = { lat: number; lng: number };

const COORD_PRECISION = 2;

const CITY_FEATURE_CODES = new Set([
  "PPL",
  "PPLA",
  "PPLA2",
  "PPLA3",
  "PPLA4",
  "PPLC",
  "PPLF",
  "PPLG",
  "PPLH",
  "PPLL",
  "PPLQ",
  "PPLR",
  "PPLS",
  "PPLW",
  "PPLX",
  "STLMT",
]);

const COUNTY_FEATURE_CODES = new Set(["ADM2"]);

const US_STATE_ABBREVIATIONS: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
  "District of Columbia": "DC",
  "Puerto Rico": "PR",
  "United States Virgin Islands": "VI",
  Guam: "GU",
  "American Samoa": "AS",
  "Northern Mariana Islands": "MP",
};

type ReverseGeocodeResult = {
  name?: string;
  admin1?: string;
  admin2?: string;
  country_code?: string;
  feature_code?: string;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatRegion(admin1: string, countryCode: string): string {
  if (countryCode.toUpperCase() === "US" && admin1) {
    const abbreviation = US_STATE_ABBREVIATIONS[admin1];
    if (abbreviation) return abbreviation;
  }

  return admin1 || countryCode;
}

function buildLocationName(
  result: ReverseGeocodeResult,
  { preferCounty }: { preferCounty?: boolean } = {},
): string | null {
  const name = normalizeString(result.name);
  const admin1 = normalizeString(result.admin1);
  const admin2 = normalizeString(result.admin2);
  const countryCode = normalizeString(result.country_code);

  const region = formatRegion(admin1, countryCode);

  if (preferCounty) {
    if (admin2) {
      return region ? `${admin2}, ${region}` : admin2;
    }
    if (name) {
      return region ? `${name}, ${region}` : name;
    }
    return region || null;
  }

  if (name) {
    return region ? `${name}, ${region}` : name;
  }

  if (admin2) {
    return region ? `${admin2}, ${region}` : admin2;
  }

  return region || null;
}

function isCityLike(result: ReverseGeocodeResult): boolean {
  const featureCode = normalizeString(result.feature_code).toUpperCase();
  return featureCode ? CITY_FEATURE_CODES.has(featureCode) : false;
}

function isCountyLike(result: ReverseGeocodeResult): boolean {
  const featureCode = normalizeString(result.feature_code).toUpperCase();
  return featureCode ? COUNTY_FEATURE_CODES.has(featureCode) : false;
}

function roundCoordinate(value: number, precision: number = COORD_PRECISION) {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function deriveLocationKey({
  coordinates,
  locationName,
}: {
  coordinates?: Coordinates | null;
  locationName?: string | null;
}): string | null {
  if (coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng)) {
    const roundedLat = roundCoordinate(coordinates.lat);
    const roundedLng = roundCoordinate(coordinates.lng);
    return `${roundedLat.toFixed(COORD_PRECISION)},${roundedLng.toFixed(COORD_PRECISION)}`;
  }

  if (locationName && locationName.trim().length > 0) {
    const slug = slugify(locationName);
    return slug.length > 0 ? `name:${slug}` : null;
  }

  return null;
}

export async function reverseGeocodeLocation(
  latitude: number,
  longitude: number,
  fallbackName: string,
): Promise<string> {
  try {
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      language: "en",
      count: "5",
    });
    const response = await fetch(`/api/open-meteo/reverse?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Reverse lookup failed with status ${response.status}`);
    }
    const data = await response.json();
    const results: ReverseGeocodeResult[] = Array.isArray(data?.results) ? data.results : [];

    if (results.length === 0) {
      return fallbackName;
    }

    const cityResult = results.find(isCityLike);
    if (cityResult) {
      const name = buildLocationName(cityResult);
      if (name) return name;
    }

    const countyResult = results.find(isCountyLike);
    if (countyResult) {
      const name = buildLocationName(countyResult, { preferCounty: true });
      if (name) return name;
    }

    const fallbackResult = results[0];
    const name = buildLocationName(fallbackResult);
    return name ?? fallbackName;
  } catch (error) {
    console.warn("Unable to reverse geocode location", error);
    return fallbackName;
  }
}
