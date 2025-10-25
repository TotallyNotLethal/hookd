'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { parse } from 'exifr';
import { useAuthState } from 'react-firebase-hooks/auth';
import { db, storage, auth } from '@/lib/firebaseClient';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, GeoPoint, Timestamp } from 'firebase/firestore';

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 };

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
  const [notes, setNotes] = useState('');
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
    try {
      const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lng.toString(),
        language: 'en',
        count: '1',
      });
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?${params.toString()}`);
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
          const lng = metadata.longitude;
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
      setCoordinates(latLng);
      lookupLocationName(latLng.lat, latLng.lng);
    },
    [lookupLocationName],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return alert('Sign in first!');
    if (!file) return alert('Upload an image');

    setUploading(true);
    try {
      const storageRef = ref(storage!, `catches/${user.uid}-${Date.now()}`);
      await uploadBytes(storageRef, file);
      const imageUrl = await getDownloadURL(storageRef);

      let capturedAt: Date | null = null;
      if (captureDate) {
        const timestampString = captureTime ? `${captureDate}T${captureTime}` : `${captureDate}T00:00`;
        const parsed = new Date(timestampString);
        capturedAt = Number.isNaN(parsed.getTime()) ? null : parsed;
      }

      await addDoc(collection(db, 'catches'), {
        userId: user.uid,
        userName: user.displayName,
        species,
        weight,
        location,
        notes,
        isTrophy,
        imageUrl,
        likes: [],
        commentsCount: 0,
        createdAt: serverTimestamp(),
        capturedAt: capturedAt ? Timestamp.fromDate(capturedAt) : null,
        captureDate: captureDate || null,
        captureTime: captureTime || null,
        coordinates: coordinates ? new GeoPoint(coordinates.lat, coordinates.lng) : null,
      });

      alert('Catch uploaded!');
      setUploading(false);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error uploading catch');
      setUploading(false);
    }
  };

  return (
    <div className="modal">
      <form onSubmit={handleSubmit} className="modal-content glass p-6 rounded-xl w-full max-w-xl space-y-4">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">Add Catch</h2>
          <button type="button" onClick={onClose} className="text-sm text-white/60 hover:text-white">
            Close
          </button>
        </div>

        <div className="space-y-4">
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

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="input"
              placeholder="Species"
              value={species}
              onChange={(event) => setSpecies(event.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Weight"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm text-white/70" htmlFor="capture-date">
                Catch date
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
                Catch time
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
              onChange={(event) => setLocation(event.target.value)}
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
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <LocationUpdater coordinates={coordinates} />
                {coordinates && <Marker position={[coordinates.lat, coordinates.lng]} icon={markerIcon} />} 
                <LocationClickHandler onSelect={handleCoordinatesChange} />
              </MapContainer>
            </div>
            <p className="text-xs text-white/60">
              Tap the map to adjust the pin. We&apos;ll use your photo metadata when available.
            </p>
          </div>

          <textarea
            className="input"
            placeholder="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isTrophy} onChange={(event) => setIsTrophy(event.target.checked)} />
          Mark as Trophy Catch
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
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
