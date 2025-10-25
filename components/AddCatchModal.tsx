'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { parse } from 'exifr';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebaseClient';
import { createCatch } from '@/lib/firestore';

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 };

const normalizeLongitude = (longitude: number) =>
  ((longitude + 180) % 360 + 360) % 360 - 180;

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

export default function AddCatchModal({ onClose }: AddCatchModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [species, setSpecies] = useState('');
  const [weight, setWeight] = useState('');
  const [location, setLocation] = useState('');
  const [caption, setCaption] = useState('');
  const [isTrophy, setIsTrophy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [captureDate, setCaptureDate] = useState('');
  const [captureTime, setCaptureTime] = useState('');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [readingMetadata, setReadingMetadata] = useState(false);
  const [user] = useAuthState(auth);

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
      try {
        const metadata = (await parse(selectedFile, {
          pick: ['DateTimeOriginal', 'latitude', 'longitude'],
        })) as { DateTimeOriginal?: string | Date; latitude?: number; longitude?: number } | undefined;

        if (metadata?.DateTimeOriginal) {
          const date = new Date(metadata.DateTimeOriginal);
          if (!Number.isNaN(date.getTime())) {
            const iso = date.toISOString();
            setCaptureDate(iso.slice(0, 10));
            setCaptureTime(iso.slice(11, 16));
          }
        }

        if (metadata?.latitude && metadata?.longitude) {
          const lat = metadata.latitude;
          const lng = normalizeLongitude(metadata.longitude);
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

    setUploading(true);
    try {
      await createCatch({
        uid: user.uid,
        displayName: user.displayName || 'Angler',
        userPhoto: user.photoURL || undefined,
        species,
        weight,
        location,
        caption,
        trophy: isTrophy,
        file,
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
            <input className="input" placeholder="Species" value={species} onChange={(e) => setSpecies(e.target.value)} required />
            <input className="input" placeholder="Weight" value={weight} onChange={(e) => setWeight(e.target.value)} required />
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
