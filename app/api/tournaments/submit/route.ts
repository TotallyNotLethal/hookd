import { NextResponse } from 'next/server';
import { parse } from 'exifr';
import crypto from 'node:crypto';
import { FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import type { TournamentMeasurementMode } from '@/lib/firestore';

const TOURNAMENTS_COLLECTION = 'tournaments';
const TOURNAMENT_ENTRIES_COLLECTION = 'tournamentEntries';
const CATCHES_COLLECTION = 'catches';

export const runtime = 'nodejs';

function parseExifDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/^([0-9]{4}):([0-9]{2}):([0-9]{2})/, '$1-$2-$3').replace(' ', 'T');
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sanitizeStoragePath(name: string) {
  return name.replace(/[^A-Za-z0-9._-]+/g, '-');
}

function computePoseSuspicious(metadata: Record<string, unknown>): boolean {
  const roll = toFiniteNumber(metadata.Roll);
  const pitch = toFiniteNumber(metadata.Pitch);
  const rollSuspicious = roll !== null && Math.abs(roll) > 50;
  const pitchSuspicious = pitch !== null && Math.abs(pitch) > 50;
  return Boolean(rollSuspicious || pitchSuspicious);
}

function hasGps(metadata: Record<string, unknown>): boolean {
  const lat = metadata.GPSLatitude;
  const lng = metadata.GPSLongitude;
  if (typeof lat === 'number' && typeof lng === 'number') {
    return Number.isFinite(lat) && Number.isFinite(lng);
  }
  const latitude = toFiniteNumber(lat);
  const longitude = toFiniteNumber(lng);
  return latitude !== null && longitude !== null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const tournamentId = formData.get('tournamentId');
    const catchId = formData.get('catchId');
    const userId = formData.get('userId');
    const measurementModeRaw = formData.get('measurementMode');
    const weightUnitRaw = formData.get('weightUnit');
    const lengthUnitRaw = formData.get('lengthUnit');
    const weightValueRaw = formData.get('verifiedWeightInPounds');
    const weightDisplay = formData.get('verifiedWeightDisplay');
    const weightValueUnitRaw = formData.get('verifiedWeightValue');
    const lengthValueRaw = formData.get('verifiedLengthInInches');
    const lengthValueUnitRaw = formData.get('verifiedLengthValue');
    const lengthDisplay = formData.get('verifiedLengthDisplay');
    const originalPhoto = formData.get('originalPhoto');
    const caption = formData.get('caption')?.toString() ?? '';
    const requiredHashtagsRaw = formData.get('requiredHashtags');
    const ruleset = formData.get('ruleset')?.toString() ?? '';
    const species = formData.get('species')?.toString() ?? '';
    const userDisplayName = formData.get('userDisplayName')?.toString() ?? '';
    const tournamentTitle = formData.get('tournamentTitle')?.toString() ?? '';
    const measurementSummary = formData.get('measurementSummary')?.toString() ?? '';
    const captureDate = formData.get('captureDate')?.toString() ?? '';
    const captureTime = formData.get('captureTime')?.toString() ?? '';
    const latitudeRaw = formData.get('latitude');
    const longitudeRaw = formData.get('longitude');

    if (typeof tournamentId !== 'string' || !tournamentId) {
      return NextResponse.json({ error: 'Missing tournament identifier.' }, { status: 400 });
    }
    if (typeof catchId !== 'string' || !catchId) {
      return NextResponse.json({ error: 'Missing catch identifier.' }, { status: 400 });
    }
    if (typeof userId !== 'string' || !userId) {
      return NextResponse.json({ error: 'Missing user identifier.' }, { status: 400 });
    }
    if (!(originalPhoto instanceof File)) {
      return NextResponse.json({ error: 'Original photo is required for validation.' }, { status: 400 });
    }

    const measurementMode =
      measurementModeRaw === 'length' || measurementModeRaw === 'combined'
        ? (measurementModeRaw as TournamentMeasurementMode)
        : 'weight';

    const weightUnit = weightUnitRaw === 'kg' ? 'kg' : 'lb';
    const lengthUnit = lengthUnitRaw === 'cm' ? 'cm' : 'in';

    const tournamentSnap = await adminDb.collection(TOURNAMENTS_COLLECTION).doc(tournamentId).get();
    if (!tournamentSnap.exists) {
      return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 });
    }

    const tournamentData = tournamentSnap.data() ?? {};
    const startAt = tournamentData.startAt instanceof AdminTimestamp ? tournamentData.startAt.toDate() : null;
    const endAt = tournamentData.endAt instanceof AdminTimestamp ? tournamentData.endAt.toDate() : null;
    const now = new Date();
    if ((startAt && startAt > now) || (endAt && endAt < now)) {
      return NextResponse.json({ error: 'Tournament is not currently active.' }, { status: 409 });
    }

    const antiCheat = tournamentData.antiCheat ?? {};
    const requiredHashtags: string[] = (() => {
      if (!requiredHashtagsRaw) return Array.isArray(tournamentData.requiredHashtags)
        ? tournamentData.requiredHashtags
        : [];
      try {
        const parsed = JSON.parse(requiredHashtagsRaw.toString());
        return Array.isArray(parsed) ? parsed.filter((tag: unknown) => typeof tag === 'string') : [];
      } catch {
        return [];
      }
    })();

    const catchSnap = await adminDb.collection(CATCHES_COLLECTION).doc(catchId).get();
    if (!catchSnap.exists) {
      return NextResponse.json({ error: 'Catch record not found.' }, { status: 404 });
    }
    const catchData = catchSnap.data() ?? {};
    if (catchData.uid && catchData.uid !== userId) {
      return NextResponse.json({ error: 'Catch ownership mismatch.' }, { status: 403 });
    }

    const existingEntrySnap = await adminDb
      .collection(TOURNAMENT_ENTRIES_COLLECTION)
      .where('tournamentId', '==', tournamentId)
      .where('catchId', '==', catchId)
      .limit(1)
      .get();

    if (!existingEntrySnap.empty) {
      return NextResponse.json({ error: 'This catch has already been submitted to the tournament.' }, { status: 409 });
    }

    const originalBuffer = Buffer.from(await originalPhoto.arrayBuffer());
    const metadata = ((await parse(originalBuffer, {
      pick: [
        'DateTimeOriginal',
        'ModifyDate',
        'GPSLatitude',
        'GPSLongitude',
        'Pitch',
        'Roll',
      ],
    })) || {}) as Record<string, unknown>;

    const captureTimestamp = (() => {
      const explicit = captureDate && captureTime ? new Date(`${captureDate}T${captureTime}`) : null;
      if (explicit && !Number.isNaN(explicit.getTime())) {
        return explicit;
      }
      return parseExifDate(metadata.DateTimeOriginal);
    })();

    const hasMetadataGps = hasGps(metadata);
    const poseSuspicious = computePoseSuspicious(metadata);
    const modifyDate = parseExifDate(metadata.ModifyDate);
    const metadataMismatch = Boolean(
      captureTimestamp &&
        modifyDate &&
        Math.abs(modifyDate.getTime() - captureTimestamp.getTime()) > 1000 * 60 * 60 * 24 * 30,
    );

    if (antiCheat.requireExif && (!captureTimestamp || !hasMetadataGps)) {
      return NextResponse.json(
        { error: 'Photo metadata is incomplete for this tournament.' },
        { status: 422 },
      );
    }

    if (antiCheat.enforcePose && poseSuspicious) {
      return NextResponse.json(
        { error: 'Pose heuristics failed verification. Please retake the photo.' },
        { status: 422 },
      );
    }

    const weightScore = toFiniteNumber(weightValueRaw);
    const weightValueUnit = toFiniteNumber(weightValueUnitRaw);
    const lengthScore = toFiniteNumber(lengthValueRaw);
    const lengthValueUnit = toFiniteNumber(lengthValueUnitRaw);

    if (measurementMode !== 'length' && (weightScore === null || weightScore <= 0)) {
      return NextResponse.json({ error: 'Verified weight is required.' }, { status: 422 });
    }
    if (measurementMode !== 'weight' && (lengthScore === null || lengthScore <= 0)) {
      return NextResponse.json({ error: 'Verified length is required.' }, { status: 422 });
    }
    if (measurementMode !== 'weight' && (lengthValueUnit === null || lengthValueUnit <= 0)) {
      return NextResponse.json({ error: 'Provide the verified length in the required unit.' }, { status: 422 });
    }

    const catchHashtags: string[] = Array.isArray(catchData.hashtags)
      ? catchData.hashtags.filter((tag: unknown) => typeof tag === 'string')
      : [];
    const missingHashtags = requiredHashtags.filter(
      (tag) => !catchHashtags.some((existing) => existing.toLowerCase() === tag.toLowerCase()),
    );
    if (missingHashtags.length > 0) {
      return NextResponse.json(
        { error: `Missing required hashtags: ${missingHashtags.join(', ')}` },
        { status: 422 },
      );
    }

    const lat = toFiniteNumber(latitudeRaw);
    const lng = toFiniteNumber(longitudeRaw);

    const hash = crypto.createHash('sha256').update(originalBuffer).digest('hex');

    let storedOriginalPath: string | null = null;
    try {
      const filename = sanitizeStoragePath(`${Date.now()}-${originalPhoto.name || 'original.jpg'}`);
      storedOriginalPath = `tournamentEntries/${tournamentId}/${catchId}/${filename}`;
      await adminStorage.file(storedOriginalPath).save(originalBuffer, {
        contentType: originalPhoto.type || 'image/jpeg',
      });
    } catch (error) {
      console.warn('Unable to archive original tournament photo', error);
      storedOriginalPath = null;
    }

    const verificationPayload = {
      exifValidatedAt: FieldValue.serverTimestamp(),
      poseValidatedAt: FieldValue.serverTimestamp(),
      hasGps: hasMetadataGps,
      captureTimestamp: captureTimestamp
        ? AdminTimestamp.fromDate(captureTimestamp)
        : null,
      sha256: hash,
      missingHashtags,
      metadataMismatch,
      poseSuspicious,
    };

    const scoreValue = measurementMode === 'length' ? lengthScore ?? 0 : weightScore ?? 0;
    const scoreLabel = measurementMode === 'length' ? 'length' : 'weight';

    const entryDoc: Record<string, unknown> = {
      tournamentId,
      tournamentTitle,
      catchId,
      userId,
      userDisplayName,
      species,
      caption,
      ruleset,
      measurementMode,
      measurementUnit: { weight: weightUnit, length: lengthUnit },
      weightDisplay: weightDisplay ? weightDisplay.toString() : null,
      weightScore: weightScore ?? null,
      weightValue: weightValueUnit ?? null,
      lengthDisplay: lengthDisplay ? lengthDisplay.toString() : null,
      lengthScore: lengthScore ?? null,
      lengthValue: lengthValueUnit ?? null,
      scoreValue,
      scoreLabel,
      measurementSummary,
      verification: verificationPayload,
      requiredHashtags,
      originalPhotoPath: storedOriginalPath,
      metadata: {
        DateTimeOriginal: metadata.DateTimeOriginal ?? null,
        ModifyDate: metadata.ModifyDate ?? null,
        GPSLatitude: metadata.GPSLatitude ?? null,
        GPSLongitude: metadata.GPSLongitude ?? null,
      },
      location: lat !== null && lng !== null ? { latitude: lat, longitude: lng } : null,
      createdAt: FieldValue.serverTimestamp(),
      verifiedAt: FieldValue.serverTimestamp(),
    };

    await adminDb.collection(TOURNAMENT_ENTRIES_COLLECTION).add(entryDoc);

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Tournament submission failed', error);
    return NextResponse.json({ error: 'Failed to submit tournament entry.' }, { status: 500 });
  }
}
