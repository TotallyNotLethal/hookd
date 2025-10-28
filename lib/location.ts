export type Coordinates = { lat: number; lng: number };

const COORD_PRECISION = 2;

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
      count: "1",
    });
    const response = await fetch(`/api/open-meteo/reverse?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Reverse lookup failed with status ${response.status}`);
    }
    const data = await response.json();
    const result = data?.results?.[0];
    if (!result?.name) return fallbackName;
    const admin = [result.admin1, result.admin2, result.country_code].filter(Boolean).join(", ");
    return admin ? `${result.name}, ${admin}` : result.name;
  } catch (error) {
    console.warn("Unable to reverse geocode location", error);
    return fallbackName;
  }
}
