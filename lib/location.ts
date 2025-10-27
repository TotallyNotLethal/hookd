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
