'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { parse } from 'exifr';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebaseClient';
import { createCatch } from '@/lib/firestore';
import FishSelector from './FishSelector';
import WeightPicker, { type WeightValue } from './WeightPicker';

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 };

const normalizeLongitude = (longitude: number) =>
  ((longitude + 180) % 360 + 360) % 360 - 180;

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (
    value &&
    typeof value === 'object' &&
    'numerator' in value &&
    'denominator' in value &&
    typeof (value as { numerator: unknown }).numerator === 'number' &&
    typeof (value as { denominator: unknown }).denominator === 'number'
  ) {
    const { numerator, denominator } = value as { numerator: number; denominator: number };
    return denominator ? numerator / denominator : null;
  }

  return null;
};

const toDecimalDegrees = (value: unknown): number | null => {
  const directNumber = toNumber(value);
  if (directNumber !== null) {
    return directNumber;
  }

  if (Array.isArray(value)) {
    const [degrees, minutes = 0, seconds = 0] = value;
    const deg = toNumber(degrees);
    const min = toNumber(minutes);
    const sec = toNumber(seconds);

    if (deg !== null && min !== null && sec !== null) {
      return deg + min / 60 + sec / 3600;
    }
  }

  return null;
};

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowAnchor: [12, 41],
});

interface Coordinates {
  lat: number;
  lng: number;
}

interface AddCatchModalProps {
  onClose: () => void;
}

function LocationUpdater({ coordinates }: { coordinates: Coordinates | null }) {
  const map = useMap();

  useEffect(() => {
    if (!coordinates) return;
    map.setView([coordinates.lat, coordinates.lng], Math.max(map.getZoom(), 10), {
      animate: true,
    });
  }, [coordinates, map]);

  return null;
}

function LocationClickHandler({ onSelect }: { onSelect: (coordinates: Coordinates) => void }) {
  useMapEvents({
    click(event) {
      onSelect({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

function parseExifDateTime(value: string | Date | undefined) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const normalized = value
      .replace(/^([0-9]{4}):([0-9]{2}):([0-9]{2})/, '$1-$2-$3')
      .replace(' ', 'T');
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

const formatWeight = ({ pounds, ounces }: WeightValue) => {
  if (!pounds && !ounces) {
    return '0 lb';
  }

  const parts: string[] = [];
  if (pounds) {
    parts.push(`${pounds} lb`);
  }
  if (ounces) {
    parts.push(`${ounces} oz`);
  }

  return parts.join(' ');
};

export default function AddCatchModal({ onClose }: AddCatchModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [species, setSpecies] = useState('');
  const [weight, setWeight] = useState<WeightValue>({ pounds: 0, ounces: 0 });
  const [location, setLocation] = useState('');
  const [caption, setCaption] = useState('');
  const [isTrophy, setIsTrophy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [captureDate, setCaptureDate] = useState('');
  const [captureTime, setCaptureTime] = useState('');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [readingMetadata, setReadingMetadata] = useState(false);
  const [user] = useAuthState(auth);
  const formattedWeight = useMemo(() => formatWeight(weight), [weight]);
  const handleWeightChange = useCallback((next: WeightValue) => setWeight(next), []);

  const mapKey = useMemo(() => {
    const lat = coordinates?.lat ?? DEFAULT_CENTER.lat;
    const lng = coordinates?.lng ?? DEFAULT_CENTER.lng;
    return `${lat.toFixed(4)}-${lng.toFixed(4)}`;
  }, [coordinates]);

  const lookupLocationName = useCallback(async (lat: number, lng: number) => {
    const normalizedLng = normalizeLongitude(lng);
    try {
      const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: normalizedLng.toString(),
        language: 'en',
        count: '1',
      });
      const response = await fetch(`/api/open-meteo/reverse?${params.toString()}`);
      if (!response.ok) return;
      const data = await response.json();
      const result = data.results?.[0];
      if (result?.name) {
        const admin = [result.admin1, result.admin2, result.country_code].filter(Boolean).join(', ');
        setLocation(admin ? `${result.name}, ${admin}` : result.name);
      }
    } catch (err) {
      console.warn('Unable to lookup location name', err);
    }
  }, []);

  const handleFileSelection = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setReadingMetadata(true);
      setCaptureDate('');
      setCaptureTime('');
      setCoordinates(null);
      setLocation('');
      try {
        const metadata = (await parse(selectedFile, {
          pick: [
            'DateTimeOriginal',
            'GPSLatitude',
            'GPSLatitudeRef',
            'GPSLongitude',
            'GPSLongitudeRef',
          ],
        })) as
          | {
              DateTimeOriginal?: string | Date;
              GPSLatitude?: unknown;
              GPSLatitudeRef?: 'N' | 'S';
              GPSLongitude?: unknown;
              GPSLongitudeRef?: 'E' | 'W';
            }
          | undefined;

        const capturedAt = parseExifDateTime(metadata?.DateTimeOriginal);
        if (capturedAt) {
          const iso = new Date(
            capturedAt.getTime() - capturedAt.getTimezoneOffset() * 60 * 1000,
          )
            .toISOString()
            .slice(0, 16);
          setCaptureDate(iso.slice(0, 10));
          setCaptureTime(iso.slice(11, 16));
        }

        const rawLat = toDecimalDegrees(metadata?.GPSLatitude);
        const rawLng = toDecimalDegrees(metadata?.GPSLongitude);
        const latRef = metadata?.GPSLatitudeRef;
        const lngRef = metadata?.GPSLongitudeRef;

        if (rawLat !== null && rawLng !== null) {
          const lat = latRef === 'S' ? -Math.abs(rawLat) : Math.abs(rawLat);
          const lngValue = lngRef === 'W' ? -Math.abs(rawLng) : Math.abs(rawLng);
          const lng = normalizeLongitude(lngValue);
          setCoordinates({ lat, lng });
          await lookupLocationName(lat, lng);
        }
      } catch (err) {
        console.warn('Unable to read photo metadata', err);
      } finally {
        setReadingMetadata(false);
      }
    },
    [lookupLocationName],
  );

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files[0]) {
        await handleFileSelection(files[0]);
      }
    },
    [handleFileSelection],
  );

  const handleCoordinatesChange = useCallback(
    (latLng: Coordinates) => {
      const nextCoordinates = {
        lat: latLng.lat,
        lng: normalizeLongitude(latLng.lng),
      };
      setCoordinates(nextCoordinates);
      lookupLocationName(nextCoordinates.lat, nextCoordinates.lng);
    },
    [lookupLocationName],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return alert('Sign in first!');
    if (!file) return alert('Upload an image');
    const trimmedSpecies = species.trim();
    if (!trimmedSpecies) return alert('Please choose a species or enter one manually.');
    if (!weight.pounds && !weight.ounces) return alert('Please select a weight.');

    setUploading(true);
    try {
      const hasCaptureDetails = captureDate && captureTime;
      const capturedAt = hasCaptureDetails ? new Date(`${captureDate}T${captureTime}`) : null;
      await createCatch({
        uid: user.uid,
        displayName: user.displayName || 'Angler',
        userPhoto: user.photoURL || undefined,
        species: trimmedSpecies,
        weight: formattedWeight,
        location,
        caption,
        trophy: isTrophy,
        file,
        captureDate: captureDate || null,
        captureTime: captureTime || null,
        capturedAt: capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null,
        coordinates,
      });

      alert('Catch uploaded!');
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error uploading catch');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="glass p-6 rounded-xl w-full max-w-xl space-y-4 relative border border-white/10"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">Add Catch</h2>
          <button type="button" onClick={onClose} className="text-sm text-white/60 hover:text-white">
            ✕
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto max-h-[75vh] pr-1">
          {/* Photo */}
          <div className="space-y-1">
            <label className="text-sm text-white/70" htmlFor="catch-file">
              Catch photo
            </label>
            <input
              id="catch-file"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              required
              className="input file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
            />
            {readingMetadata && <p className="text-xs text-white/50">Reading photo metadata…</p>}
          </div>

          {/* Inputs */}
          <div className="grid gap-3 sm:grid-cols-2">
            <FishSelector value={species} onSelect={setSpecies} placeholder="Species" />
            <div className="space-y-2">
              <span className="text-sm text-white/70">Weight</span>
              <WeightPicker value={weight} onChange={handleWeightChange} />
              <p className="text-xs text-white/60">Selected weight: {formattedWeight}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm text-white/70" htmlFor="capture-date">
                Capture date
              </label>
              <input
                id="capture-date"
                type="date"
                className="input"
                value={captureDate}
                onChange={(event) => setCaptureDate(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-white/70" htmlFor="capture-time">
                Capture time
              </label>
              <input
                id="capture-time"
                type="time"
                className="input"
                value={captureTime}
                onChange={(event) => setCaptureTime(event.target.value)}
              />
            </div>
          </div>

          {/* Map + Location */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-white/70" htmlFor="location-name">
                Location
              </label>
              {coordinates && (
                <span className="text-xs text-white/50">
                  {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                </span>
              )}
            </div>
            <input
              id="location-name"
              className="input"
              placeholder="Where did you catch it?"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
            <div className="h-56 w-full overflow-hidden rounded-xl border border-white/10">
              <MapContainer
                key={mapKey}
                center={coordinates ? [coordinates.lat, coordinates.lng] : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]}
                zoom={coordinates ? 10 : 4}
                scrollWheelZoom
                className="h-full w-full"
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <LocationUpdater coordinates={coordinates} />
                {coordinates && <Marker position={[coordinates.lat, coordinates.lng]} icon={markerIcon} />}
                <LocationClickHandler onSelect={handleCoordinatesChange} />
              </MapContainer>
            </div>
          </div>

          {/* Caption */}
          <textarea
            className="input"
            placeholder="Caption or notes"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
          />
        </div>

        <label className="flex items-center gap-2 text-sm pt-2">
          <input type="checkbox" checked={isTrophy} onChange={(e) => setIsTrophy(e.target.checked)} />
          Mark as Trophy Catch
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end pt-3">
          <button type="button" onClick={onClose} className="btn-secondary w-full sm:w-auto">
            Cancel
          </button>
          <button type="submit" disabled={uploading} className="btn-primary w-full sm:w-auto">
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  );
}
