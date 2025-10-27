'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LeafletEvent } from 'leaflet';
import { parse } from 'exifr';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebaseClient';
import {
  HookdUser,
  Tournament,
  TournamentLengthUnit,
  TournamentMeasurementMode,
  TournamentWeightUnit,
  createCatch,
  deleteCatch,
  getActiveTournaments,
  subscribeToActiveTournaments,
  subscribeToUser,
} from '@/lib/firestore';
import type { EnvironmentBands, EnvironmentSnapshot } from '@/lib/environmentTypes';
import { deriveLocationKey } from '@/lib/location';
import FishSelector from './FishSelector';
import WeightPicker, { type WeightValue } from './WeightPicker';

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 };
const EMPTY_TOURNAMENT_HASHTAGS: string[] = [];

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

const parseGpsPositionString = (value: unknown): Coordinates | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const [latPart, lngPart] = value.split(',');
  if (!latPart || !lngPart) {
    return null;
  }

  const parsePart = (part: string): number | null => {
    const trimmed = part.trim();
    const match = trimmed.match(
      /^(-?\d+(?:\.\d+)?)\s*deg(?:\s*(\d+(?:\.\d+)?))?(?:'\s*(\d+(?:\.\d+)?))?(?:"\s*)?([NSEW])$/i,
    );

    if (!match) {
      return null;
    }

    const [, degreesRaw, minutesRaw, secondsRaw, directionRaw] = match;
    const degrees = Number.parseFloat(degreesRaw);
    const minutes = minutesRaw ? Number.parseFloat(minutesRaw) : 0;
    const seconds = secondsRaw ? Number.parseFloat(secondsRaw) : 0;

    if (Number.isNaN(degrees) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
      return null;
    }

    const decimal = degrees + minutes / 60 + seconds / 3600;
    const direction = directionRaw.toUpperCase();
    const sign = direction === 'S' || direction === 'W' ? -1 : 1;

    return sign * Math.abs(decimal);
  };

  const lat = parsePart(latPart);
  const lng = parsePart(lngPart);

  if (lat === null || lng === null) {
    return null;
  }

  return {
    lat,
    lng: normalizeLongitude(lng),
  };
};

interface AddCatchModalProps {
  onClose: () => void;
}

function LocationUpdater({
  coordinates,
  zoom,
}: {
  coordinates: Coordinates | null;
  zoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!coordinates) return;
    const targetZoom = Number.isFinite(zoom) ? zoom : map.getZoom();
    map.setView([coordinates.lat, coordinates.lng], targetZoom, {
      animate: true,
    });
  }, [coordinates, map, zoom]);

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

function ZoomTracker({
  onZoomChange,
}: {
  onZoomChange: (zoom: number, isUserInteraction: boolean) => void;
}) {
  const map = useMap();

  useEffect(() => {
    onZoomChange(map.getZoom(), false);
  }, [map, onZoomChange]);

  useMapEvents({
    zoomend(event: LeafletEvent) {
      const isUserInteraction = 'originalEvent' in event && Boolean(event.originalEvent);
      onZoomChange(map.getZoom(), isUserInteraction);
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
  const [verifiedWeight, setVerifiedWeight] = useState<WeightValue | null>(null);
  const [verifiedLength, setVerifiedLength] = useState('');
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [location, setLocation] = useState('');
  const [isLocationPrivate, setIsLocationPrivate] = useState(false);
  const [caption, setCaption] = useState('');
  const [isTrophy, setIsTrophy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [captureDate, setCaptureDate] = useState('');
  const [captureTime, setCaptureTime] = useState('');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const initialCaptureRef = useRef<{ date: string; time: string } | null>(null);
  const [captureWasCorrected, setCaptureWasCorrected] = useState(false);
  const [environmentSnapshot, setEnvironmentSnapshot] = useState<EnvironmentSnapshot | null>(null);
  const [environmentBands, setEnvironmentBands] = useState<EnvironmentBands | null>(null);
  const [environmentLoading, setEnvironmentLoading] = useState(false);
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const capturedAt = useMemo(() => {
    if (!captureDate || !captureTime) return null;
    const candidate = new Date(`${captureDate}T${captureTime}`);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }, [captureDate, captureTime]);
  const [mapZoom, setMapZoomState] = useState(4);
  const mapZoomRef = useRef(mapZoom);
  const userAdjustedZoomRef = useRef(false);
  const [readingMetadata, setReadingMetadata] = useState(false);
  const [locationDirty, setLocationDirty] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [isConfirmingLocation, setIsConfirmingLocation] = useState(false);
  const [geolocationStatus, setGeolocationStatus] = useState<string | null>(null);
  const [geolocationSupported, setGeolocationSupported] = useState(false);
  const [geolocationPending, setGeolocationPending] = useState(false);
  const isMountedRef = useRef(true);
  const initialGeolocationRequestRef = useRef(false);
  const searchRequestId = useRef(0);
  const [user] = useAuthState(auth);
  const [profile, setProfile] = useState<HookdUser | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const [tournamentError, setTournamentError] = useState<string | null>(null);
  const formattedWeight = useMemo(() => formatWeight(weight), [weight]);
  const selectedTournament = useMemo(
    () => tournaments.find((item) => item.id === selectedTournamentId) ?? null,
    [selectedTournamentId, tournaments],
  );
  const tournamentMeasurementMode: TournamentMeasurementMode | null = selectedTournament
    ? selectedTournament.measurement.mode
    : null;
  const requiresWeight =
    tournamentMeasurementMode === 'weight' || tournamentMeasurementMode === 'combined';
  const requiresLength =
    tournamentMeasurementMode === 'length' || tournamentMeasurementMode === 'combined';
  const measurementWeightUnit: TournamentWeightUnit =
    selectedTournament?.measurement.weightUnit ?? 'lb';
  const measurementLengthUnit: TournamentLengthUnit =
    selectedTournament?.measurement.lengthUnit ?? 'in';
  const verifiedWeightDisplay = useMemo(() => {
    if (!requiresWeight) return '';
    const source = verifiedWeight ?? weight;
    return formatWeight(source);
  }, [requiresWeight, verifiedWeight, weight]);
  const lengthUnitLabel = measurementLengthUnit === 'cm' ? 'cm' : 'in';
  const measurementWeightUnitLabel =
    measurementWeightUnit === 'kg' ? 'kilograms' : 'pounds';
  const measurementLengthUnitLabel =
    measurementLengthUnit === 'cm' ? 'centimeters' : 'inches';
  const tournamentMeasurementSummary = useMemo(() => {
    if (!selectedTournament) return '';
    const segments: string[] = [];
    if (requiresWeight) {
      segments.push(`Weight (${measurementWeightUnitLabel})`);
    }
    if (requiresLength) {
      segments.push(`Length (${measurementLengthUnitLabel})`);
    }
    return segments.join(' • ');
  }, [measurementLengthUnitLabel, measurementWeightUnitLabel, requiresLength, requiresWeight, selectedTournament]);
  const lengthPlaceholder = measurementLengthUnit === 'cm' ? 'e.g. 75' : 'e.g. 24';
  const tournamentHashtags = useMemo(
    () => selectedTournament?.requiredHashtags ?? EMPTY_TOURNAMENT_HASHTAGS,
    [selectedTournament],
  );
  const tournamentAntiCheat = selectedTournament?.antiCheat;
  const tournamentsAvailable = tournaments.length > 0;
  const originalFileName = originalFile ? originalFile.name : '';
  const missingTournamentHashtags = useMemo(() => {
    if (!selectedTournament || tournamentHashtags.length === 0) {
      return [] as string[];
    }
    const normalizedCaption = caption.toLowerCase();
    return tournamentHashtags.filter((tag) => !normalizedCaption.includes(tag.toLowerCase()));
  }, [caption, selectedTournament, tournamentHashtags]);
  const handleWeightChange = useCallback((next: WeightValue) => setWeight(next), []);
  const handleVerifiedWeightChange = useCallback(
    (next: WeightValue) => setVerifiedWeight(next),
    [],
  );

  useEffect(() => {
    if (!user?.uid) {
      setProfile(null);
      return undefined;
    }

    const unsubscribe = subscribeToUser(user.uid, (data) => {
      setProfile(data);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  useEffect(() => {
    let isMounted = true;
    setTournamentsLoading(true);
    setTournamentError(null);

    getActiveTournaments()
      .then((events) => {
        if (!isMounted) return;
        setTournaments(events);
        setTournamentsLoading(false);
      })
      .catch((error) => {
        console.warn('Unable to load tournaments', error);
        if (!isMounted) return;
        setTournamentError('Unable to load active tournaments right now.');
        setTournamentsLoading(false);
      });

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribeToActiveTournaments((events) => {
        if (!isMounted) return;
        setTournaments(events);
        setTournamentError(null);
        setTournamentsLoading(false);
      });
    } catch (error) {
      console.warn('Unable to subscribe to tournaments', error);
    }

    return () => {
      isMounted = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (selectedTournamentId) {
      const exists = tournaments.some((event) => event.id === selectedTournamentId);
      if (!exists) {
        setSelectedTournamentId('');
      }
      return;
    }

    if (!selectedTournamentId && tournaments.length === 1) {
      setSelectedTournamentId(tournaments[0]!.id);
    }
  }, [selectedTournamentId, tournaments]);

  useEffect(() => {
    setVerifiedWeight(null);
    setVerifiedLength('');
  }, [selectedTournamentId]);

  useEffect(() => {
    if (!requiresWeight) {
      setVerifiedWeight(null);
      return;
    }

    setVerifiedWeight((previous) => previous ?? weight);
  }, [requiresWeight, weight]);

  useEffect(() => {
    if (!requiresLength) {
      setVerifiedLength('');
    }
  }, [requiresLength]);

  const handleLocationPrivacyChange = useCallback((checked: boolean) => {
    setIsLocationPrivate(checked);
  }, []);

  const updateMapZoom = useCallback(
    (value: number | ((previous: number) => number)) => {
      setMapZoomState((previous) => {
        const next =
          typeof value === 'function' ? (value as (prev: number) => number)(previous) : value;
        mapZoomRef.current = next;
        return next;
      });
    },
    [],
  );

  const handleZoomChange = useCallback(
    (nextZoom: number, isUserInteraction: boolean) => {
      if (isUserInteraction) {
        userAdjustedZoomRef.current = true;
      }
      if (mapZoomRef.current === nextZoom) {
        return;
      }
      updateMapZoom(nextZoom);
    },
    [updateMapZoom],
  );

  const lookupLocationName = useCallback(
    async (lat: number, lng: number, options?: { requestId?: number }) => {
      const normalizedLng = normalizeLongitude(lng);
      const shouldApply = () =>
        options?.requestId === undefined || options.requestId === searchRequestId.current;
      if (shouldApply()) {
        setIsConfirmingLocation(true);
        setLocationError(null);
      }
      try {
        const params = new URLSearchParams({
          latitude: lat.toString(),
          longitude: normalizedLng.toString(),
          language: 'en',
          count: '1',
        });
        const response = await fetch(`/api/open-meteo/reverse?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Reverse lookup failed with status ${response.status}`);
        }
        const data = await response.json();
        if (!shouldApply()) {
          return null;
        }
        const result = data.results?.[0];
        if (result?.name) {
          const admin = [result.admin1, result.admin2, result.country_code].filter(Boolean).join(', ');
          const resolvedName = admin ? `${result.name}, ${admin}` : result.name;
          setLocation(resolvedName);
          return resolvedName;
        }
        setLocationError('Unable to confirm the selected location.');
        return null;
      } catch (err) {
        console.warn('Unable to lookup location name', err);
        if (shouldApply()) {
          setLocationError('Unable to confirm the selected location.');
        }
        return null;
      } finally {
        if (shouldApply()) {
          setIsConfirmingLocation(false);
          setLocationDirty(false);
        }
      }
    },
    [searchRequestId],
  );

  const requestGeolocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (!isMountedRef.current) return;
      setGeolocationStatus('Location services are not available in this browser.');
      setGeolocationPending(false);
      updateMapZoom(4);
      userAdjustedZoomRef.current = false;
      return;
    }

    setGeolocationPending(true);
    setGeolocationStatus('Detecting your location…');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!isMountedRef.current) return;
        const lat = position.coords.latitude;
        const lng = normalizeLongitude(position.coords.longitude);
        const nextCoordinates = { lat, lng };
        setCoordinates(nextCoordinates);
        updateMapZoom(12);
        userAdjustedZoomRef.current = false;
        setGeolocationStatus(null);
        setGeolocationPending(false);
        void lookupLocationName(lat, lng);
      },
      (error) => {
        if (!isMountedRef.current) return;
        console.warn('Unable to access geolocation', error);
        setCoordinates(null);
        updateMapZoom(4);
        userAdjustedZoomRef.current = false;
        setGeolocationStatus('Unable to access GPS. Please select a location manually.');
        setGeolocationPending(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [lookupLocationName, updateMapZoom]);

  useEffect(() => {
    isMountedRef.current = true;
    const supported = typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
    setGeolocationSupported(supported);

    if (!initialGeolocationRequestRef.current) {
      initialGeolocationRequestRef.current = true;
      if (supported) {
        requestGeolocation();
      } else {
        setGeolocationStatus('Location services are not available in this browser.');
        updateMapZoom(4);
        userAdjustedZoomRef.current = false;
      }
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [requestGeolocation, updateMapZoom]);

  const handleFileSelection = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setOriginalFile(selectedFile);
      setReadingMetadata(true);
      setCaptureDate('');
      setCaptureTime('');
      setCoordinates(null);
      initialCaptureRef.current = null;
      setCaptureWasCorrected(false);
      setEnvironmentSnapshot(null);
      setEnvironmentBands(null);
      setEnvironmentError(null);
      setEnvironmentLoading(false);
      updateMapZoom(4);
      userAdjustedZoomRef.current = false;
      setLocation('');
      setLocationDirty(false);
      setLocationError(null);
      try {
        const metadata = (await parse(selectedFile, {
          pick: [
            'DateTimeOriginal',
            'GPSLatitude',
            'GPSLatitudeRef',
            'GPSLongitude',
            'GPSLongitudeRef',
            'gpsPosition',
            'GPSPosition',
            'gps_position',
          ],
        })) as
          | {
              DateTimeOriginal?: string | Date;
              GPSLatitude?: unknown;
              GPSLatitudeRef?: 'N' | 'S';
              GPSLongitude?: unknown;
              GPSLongitudeRef?: 'E' | 'W';
              gpsPosition?: unknown;
              GPSPosition?: unknown;
              gps_position?: unknown;
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
          initialCaptureRef.current = {
            date: iso.slice(0, 10),
            time: iso.slice(11, 16),
          };
          setCaptureWasCorrected(false);
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
          updateMapZoom(12);
          userAdjustedZoomRef.current = false;
          await lookupLocationName(lat, lng);
        } else {
          const fallbackPosition =
            parseGpsPositionString(metadata?.gpsPosition) ||
            parseGpsPositionString(metadata?.GPSPosition) ||
            parseGpsPositionString(metadata?.gps_position);

          if (fallbackPosition) {
            setCoordinates(fallbackPosition);
            updateMapZoom(12);
            userAdjustedZoomRef.current = false;
            await lookupLocationName(fallbackPosition.lat, fallbackPosition.lng);
          }
        }
      } catch (err) {
        console.warn('Unable to read photo metadata', err);
      } finally {
        setReadingMetadata(false);
      }
    },
    [lookupLocationName, updateMapZoom],
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

  const markCaptureManualChange = useCallback((nextDate: string, nextTime: string) => {
    const initial = initialCaptureRef.current;
    if (!initial) {
      setCaptureWasCorrected(Boolean(nextDate || nextTime));
      return;
    }
    setCaptureWasCorrected(initial.date !== nextDate || initial.time !== nextTime);
  }, []);

  const handleCaptureDateChange = useCallback(
    (value: string) => {
      setCaptureDate(value);
      markCaptureManualChange(value, captureTime);
    },
    [captureTime, markCaptureManualChange],
  );

  const handleCaptureTimeChange = useCallback(
    (value: string) => {
      setCaptureTime(value);
      markCaptureManualChange(captureDate, value);
    },
    [captureDate, markCaptureManualChange],
  );

  const handleOriginalFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      setOriginalFile(files[0]);
    } else {
      setOriginalFile(null);
    }
  }, []);

  const handleCoordinatesChange = useCallback(
    (latLng: Coordinates) => {
      const nextCoordinates = {
        lat: latLng.lat,
        lng: normalizeLongitude(latLng.lng),
      };
      setCoordinates(nextCoordinates);
      updateMapZoom((previous) => {
        if (!Number.isFinite(previous)) {
          userAdjustedZoomRef.current = false;
          return 12;
        }

        if (userAdjustedZoomRef.current) {
          return previous;
        }

        const next = Math.max(previous, 12);
        if (next !== previous) {
          userAdjustedZoomRef.current = false;
        }
        return next;
      });
      setLocationError(null);
      setLocationDirty(false);
      lookupLocationName(nextCoordinates.lat, nextCoordinates.lng);
    },
    [lookupLocationName, updateMapZoom],
  );

  useEffect(() => {
    if (!coordinates || !capturedAt) {
      setEnvironmentSnapshot(null);
      setEnvironmentBands(null);
      setEnvironmentError(null);
      setEnvironmentLoading(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    async function loadEnvironmentSnapshot() {
      setEnvironmentLoading(true);
      setEnvironmentError(null);
      try {
        const params = new URLSearchParams({
          lat: coordinates.lat.toString(),
          lng: coordinates.lng.toString(),
          timestamp: capturedAt.toISOString(),
          forwardHours: '0',
        });
        const response = await fetch(`/api/environment?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Unable to fetch environment data.');
        }
        const body = await response.json();
        const snapshot: EnvironmentSnapshot | undefined =
          body.capture ?? body.slices?.[0]?.snapshot;
        if (!snapshot) {
          throw new Error('Environment data unavailable.');
        }
        if (isActive) {
          setEnvironmentSnapshot(snapshot);
          setEnvironmentBands({
            timeOfDay: snapshot.timeOfDayBand,
            moonPhase: snapshot.moonPhaseBand,
            pressure: snapshot.pressureBand,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted && isActive) {
          setEnvironmentError(
            error instanceof Error ? error.message : 'Unable to fetch environment data.',
          );
        }
      } finally {
        if (!controller.signal.aborted && isActive) {
          setEnvironmentLoading(false);
        }
      }
    }

    loadEnvironmentSnapshot();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [coordinates?.lat, coordinates?.lng, capturedAt?.getTime()]);

  useEffect(() => {
    if (!locationDirty) return;

    setIsConfirmingLocation(false);

    const trimmed = location.trim();

    if (!trimmed) {
      setCoordinates(null);
      updateMapZoom(4);
      userAdjustedZoomRef.current = false;
      setLocationError(null);
      setLocationDirty(false);
      return;
    }

    if (coordinates) {
      setLocationError(null);
      setLocationDirty(false);
      return;
    }

    const controller = new AbortController();
    const requestId = ++searchRequestId.current;
    const timeoutId = setTimeout(() => {
      (async () => {
        setIsSearchingLocation(true);
        setLocationError(null);
        try {
          const params = new URLSearchParams({
            name: trimmed,
            count: '1',
            language: 'en',
          });
          const response = await fetch(`/api/open-meteo/search?${params.toString()}`, {
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(`Search failed with status ${response.status}`);
          }
          const data = await response.json();
          if (searchRequestId.current !== requestId) {
            return;
          }
          const topResult = data.results?.[0];
          if (topResult?.latitude != null && topResult?.longitude != null) {
            const lat = Number(topResult.latitude);
            const lng = normalizeLongitude(Number(topResult.longitude));
            setCoordinates({ lat, lng });
            updateMapZoom(12);
            userAdjustedZoomRef.current = false;
            if (searchRequestId.current !== requestId) {
              return;
            }
            await lookupLocationName(lat, lng, { requestId });
          } else {
            setCoordinates(null);
            updateMapZoom(4);
            userAdjustedZoomRef.current = false;
            setLocationError('No matches found for that location.');
            if (searchRequestId.current === requestId) {
              setLocationDirty(false);
            }
          }
        } catch (error) {
          if ((error as { name?: string })?.name === 'AbortError') {
            return;
          }
          console.warn('Unable to search for location', error);
          if (searchRequestId.current === requestId) {
            setLocationError('Unable to find that location. Try a different search.');
            updateMapZoom(4);
            userAdjustedZoomRef.current = false;
            setLocationDirty(false);
          }
        } finally {
          if (searchRequestId.current === requestId) {
            setIsSearchingLocation(false);
          }
        }
      })();
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [coordinates, location, locationDirty, lookupLocationName, searchRequestId, updateMapZoom]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return alert('Sign in first!');
    if (!file) return alert('Upload an image');
    const trimmedSpecies = species.trim();
    if (!trimmedSpecies) return alert('Please choose a species or enter one manually.');
    if (!weight.pounds && !weight.ounces) return alert('Please select a weight.');

    let finalLocation = location.trim();

    if (!finalLocation && coordinates) {
      const resolved = await lookupLocationName(coordinates.lat, coordinates.lng);
      if (resolved) {
        finalLocation = resolved;
      }
    }

    if (isLocationPrivate && !finalLocation) {
      finalLocation = 'Private Location';
      setLocation('Private Location');
    }

    if (!finalLocation && !coordinates) {
      alert('Please search for a location or drop a pin on the map.');
      return;
    }

    const tournament = selectedTournament;
    let weightScorePounds: number | null = null;
    let weightValueForUnit: number | null = null;
    let lengthScoreInches: number | null = null;
    let verifiedLengthValue: number | null = null;
    let weightForTournament: WeightValue | null = null;

    const normalizeNumber = (value: number, decimals: number) =>
      Number.isFinite(value) ? Number.parseFloat(value.toFixed(decimals)) : value;

    if (tournament) {
      if (requiresWeight) {
        weightForTournament = verifiedWeight ?? weight;
        const pounds = (weightForTournament.pounds || 0) + (weightForTournament.ounces || 0) / 16;
        if (!pounds) {
          alert('Enter a verified tournament weight.');
          return;
        }
        weightScorePounds = normalizeNumber(pounds, 3);
        weightValueForUnit =
          measurementWeightUnit === 'kg'
            ? normalizeNumber(pounds * 0.45359237, 3)
            : weightScorePounds;
      }

      if (requiresLength) {
        const parsed = Number.parseFloat(verifiedLength);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          alert(`Enter a valid verified length in ${lengthUnitLabel}.`);
          return;
        }
        verifiedLengthValue = normalizeNumber(parsed, 2);
        lengthScoreInches =
          measurementLengthUnit === 'cm'
            ? normalizeNumber(parsed / 2.54, 2)
            : verifiedLengthValue;
      }

      if (!originalFile) {
        alert('Please upload the original, unedited photo for tournament validation.');
        return;
      }

      if (missingTournamentHashtags.length > 0) {
        alert(
          `Add the required tournament hashtags before submitting: ${missingTournamentHashtags.join(', ')}`,
        );
        return;
      }
    }

    setUploading(true);
    let createdCatchId: string | null = null;
    let shouldRollbackCatch = Boolean(tournament);

    try {
      const capturedAtDate = capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null;
      const captureNormalizedAt = capturedAtDate
        ? new Date(Math.floor(capturedAtDate.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000)
        : null;
      createdCatchId = await createCatch({
        uid: user.uid,
        displayName: profile?.displayName || user.displayName || 'Angler',
        userPhoto: profile?.photoURL || user.photoURL || undefined,
        species: trimmedSpecies,
        weight: formattedWeight,
        location: finalLocation,
        locationPrivate: isLocationPrivate,
        caption,
        trophy: isTrophy,
        file,
        captureDate: captureDate || null,
        captureTime: captureTime || null,
        capturedAt: capturedAtDate,
        captureWasCorrected,
        captureManualEntry: captureWasCorrected
          ? {
              captureDate: captureDate || null,
              captureTime: captureTime || null,
            }
          : null,
        captureNormalizedAt,
        environmentSnapshot,
        environmentBands,
        locationKey: deriveLocationKey({ coordinates, locationName: finalLocation }),
        coordinates,
      });

      if (tournament) {
        const formData = new FormData();
        formData.append('tournamentId', tournament.id);
        formData.append('catchId', createdCatchId);
        formData.append('userId', user.uid);
        formData.append('userDisplayName', profile?.displayName || user.displayName || 'Angler');
        formData.append('tournamentTitle', tournament.title);
        formData.append('measurementMode', tournament.measurement.mode);
        formData.append('weightUnit', measurementWeightUnit);
        formData.append('lengthUnit', measurementLengthUnit);
        formData.append('measurementSummary', tournamentMeasurementSummary);
        formData.append('species', trimmedSpecies);
        formData.append('caption', caption);
        formData.append('ruleset', tournament.ruleset);
        formData.append('requiredHashtags', JSON.stringify(tournamentHashtags));
        if (requiresWeight && weightForTournament && weightScorePounds !== null) {
          formData.append('verifiedWeightDisplay', formatWeight(weightForTournament));
          formData.append('verifiedWeightInPounds', weightScorePounds.toString());
          if (weightValueForUnit !== null) {
            formData.append('verifiedWeightValue', weightValueForUnit.toString());
          }
        }
        if (requiresLength && verifiedLengthValue !== null && lengthScoreInches !== null) {
          formData.append('verifiedLengthValue', verifiedLengthValue.toString());
          formData.append('verifiedLengthInInches', lengthScoreInches.toString());
          formData.append('verifiedLengthDisplay', `${verifiedLengthValue} ${lengthUnitLabel}`);
        }
        if (coordinates) {
          formData.append('latitude', coordinates.lat.toString());
          formData.append('longitude', coordinates.lng.toString());
        }
        if (captureDate) {
          formData.append('captureDate', captureDate);
        }
        if (captureTime) {
          formData.append('captureTime', captureTime);
        }

        formData.append('originalPhoto', originalFile);

        const response = await fetch('/api/tournaments/submit', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          let message = 'Tournament submission failed.';
          try {
            const errorBody = await response.json();
            if (typeof errorBody?.error === 'string') {
              message = errorBody.error;
            }
          } catch (error) {
            console.warn('Unable to parse tournament submission error body', error);
          }
          throw new Error(message);
        }

        shouldRollbackCatch = false;
      }

      alert('Catch uploaded!');
      onClose();
    } catch (err) {
      console.error(err);
      if (createdCatchId && shouldRollbackCatch) {
        try {
          await deleteCatch(createdCatchId);
        } catch (cleanupError) {
          console.error('Failed to roll back catch after tournament submission error', cleanupError);
        }
      }
      alert(err instanceof Error ? err.message : 'Error uploading catch');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="glass p-6 rounded-xl w-full max-w-xl space-y-4 relative border border-white/10 max-h-[90vh] flex flex-col"
      >
        <div className="flex items-start justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold">Add Catch</h2>
          <button type="button" onClick={onClose} className="text-sm text-white/60 hover:text-white">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
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

          <div className="space-y-2">
            <label className="text-sm text-white/70" htmlFor="tournament-select">
              Active tournament
            </label>
            <select
              id="tournament-select"
              className="input"
              value={selectedTournamentId}
              onChange={(event) => setSelectedTournamentId(event.target.value)}
            >
              <option value="">No tournament</option>
              {tournaments.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
            {tournamentsLoading && (
              <p className="text-xs text-white/60">Loading tournaments…</p>
            )}
            {tournamentError && (
              <p className="text-xs text-red-400">{tournamentError}</p>
            )}
            {!tournamentsLoading && !tournamentError && !tournamentsAvailable && (
              <p className="text-xs text-white/50">No active tournaments right now.</p>
            )}
          </div>

          {selectedTournament && (
            <div className="space-y-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 p-4">
              <div>
                <p className="text-sm font-semibold text-white">{selectedTournament.title}</p>
                {tournamentMeasurementSummary && (
                  <p className="text-xs text-white/60">{tournamentMeasurementSummary}</p>
                )}
              </div>
              {selectedTournament.description && (
                <p className="text-xs text-white/60">{selectedTournament.description}</p>
              )}
              {selectedTournament.ruleset && (
                <p className="text-xs text-brand-200">{selectedTournament.ruleset}</p>
              )}
              {requiresWeight && (
                <div className="space-y-1">
                  <span className="text-sm text-white/70">
                    Verified weight ({measurementWeightUnitLabel})
                  </span>
                  <WeightPicker
                    value={verifiedWeight ?? weight}
                    onChange={handleVerifiedWeightChange}
                  />
                  <p className="text-xs text-white/60">
                    Tournament submission: {verifiedWeightDisplay || '0 lb'}
                  </p>
                </div>
              )}
              {requiresLength && (
                <div className="space-y-1">
                  <label className="text-sm text-white/70" htmlFor="verified-length">
                    Verified length ({lengthUnitLabel})
                  </label>
                  <input
                    id="verified-length"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="input"
                    placeholder={lengthPlaceholder}
                    value={verifiedLength}
                    onChange={(event) => setVerifiedLength(event.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm text-white/70" htmlFor="original-photo">
                  Original photo for validation
                </label>
                <input
                  id="original-photo"
                  type="file"
                  accept="image/*"
                  className="input file:mr-3 file:rounded-lg file:border-0 file:bg-brand-400 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                  onChange={handleOriginalFileChange}
                />
                <p className="text-xs text-white/60">
                  {originalFileName ? `Selected: ${originalFileName}` : 'Defaults to your uploaded catch photo.'}
                </p>
              </div>
              {tournamentHashtags.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-brand-200">Required hashtags</p>
                  <div className="flex flex-wrap gap-2">
                    {tournamentHashtags.map((tag) => (
                      <span key={tag} className="rounded-full bg-brand-500/20 px-2 py-1 text-xs text-brand-100">
                        {tag}
                      </span>
                    ))}
                  </div>
                  {missingTournamentHashtags.length > 0 && (
                    <p className="text-xs text-amber-300">
                      Missing: {missingTournamentHashtags.join(', ')}
                    </p>
                  )}
                </div>
              )}
              {tournamentAntiCheat && (
                <ul className="space-y-1 text-xs text-white/60">
                  {tournamentAntiCheat.requireExif && <li>• EXIF metadata must be intact.</li>}
                  {tournamentAntiCheat.requireOriginalPhoto && <li>• Original photo required.</li>}
                  {tournamentAntiCheat.enforcePose && <li>• Pose heuristics will be reviewed.</li>}
                </ul>
              )}
            </div>
          )}

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
                onChange={(event) => handleCaptureDateChange(event.target.value)}
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
                onChange={(event) => handleCaptureTimeChange(event.target.value)}
              />
            </div>
          </div>
          <div className="text-xs text-white/60 space-y-1">
            {environmentLoading && <p>Pulling moon and pressure tags…</p>}
            {!environmentLoading && environmentSnapshot && (
              <p>
                Tagged as {environmentSnapshot.timeOfDayBand} · {environmentSnapshot.moonPhaseBand} moon ·{' '}
                {environmentSnapshot.pressureBand} pressure
              </p>
            )}
            {environmentError && !environmentLoading && (
              <p className="text-amber-300">Environment data unavailable: {environmentError}</p>
            )}
            {captureWasCorrected && (
              <p className="text-brand-200">Manual time correction noted.</p>
            )}
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
              onChange={(e) => {
                setLocation(e.target.value);
                setLocationDirty(true);
                setLocationError(null);
              }}
              required={!isLocationPrivate && !coordinates}
            />
            {(isSearchingLocation || isConfirmingLocation) && (
              <p className="text-xs text-white/60">
                {isSearchingLocation ? 'Searching for location…' : 'Confirming location…'}
              </p>
            )}
              {(geolocationStatus || geolocationSupported) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {geolocationStatus && <span className="text-white/50">{geolocationStatus}</span>}
                  {geolocationSupported && (
                    <button
                      type="button"
                      onClick={requestGeolocation}
                      className="rounded-full border border-white/20 px-3 py-1 text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={geolocationPending}
                    >
                      {geolocationPending ? 'Locating…' : 'Use my location'}
                    </button>
                  )}
                </div>
              )}
              {locationError && (
                <p className="text-xs text-red-400">{locationError}</p>
              )}
              <div className="h-56 w-full overflow-hidden rounded-xl border border-white/10">
            <MapContainer
              center={coordinates ? [coordinates.lat, coordinates.lng] : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]}
              zoom={mapZoom}
              scrollWheelZoom
              className="h-full w-full"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <LocationUpdater coordinates={coordinates} zoom={mapZoom} />
              <ZoomTracker onZoomChange={handleZoomChange} />
              {coordinates && <Marker position={[coordinates.lat, coordinates.lng]} icon={markerIcon} />}
              <LocationClickHandler onSelect={handleCoordinatesChange} />
            </MapContainer>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
            <input
              id="location-private"
              type="checkbox"
              checked={isLocationPrivate}
              onChange={(event) => handleLocationPrivacyChange(event.target.checked)}
              className="mt-1"
            />
            <div>
              <label htmlFor="location-private" className="text-sm font-semibold text-white">
                Keep location private
              </label>
              <p className="text-xs text-white/60">
                When enabled, your catch location stays visible only to you and will not appear on the public map.
              </p>
            </div>
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

        <label className="flex items-center gap-2 text-sm pt-2 flex-shrink-0">
          <input type="checkbox" checked={isTrophy} onChange={(e) => setIsTrophy(e.target.checked)} />
          Mark as Trophy Catch
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end pt-3 flex-shrink-0">
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
