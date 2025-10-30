'use server';

import { FieldValue, FirestoreDataConverter, Timestamp } from 'firebase-admin/firestore';

import { adminDb } from '../firebaseAdmin';
import type {
  CatchFilters,
  CatchInput,
  CatchListResult,
  CatchRecord,
  CatchUpdateInput,
  CatchVisibility,
} from '../catches';
import { sanitizeGear, sanitizeMeasurements } from '../catches';

export type CatchRepository = {
  createCatch: (userId: string, input: CatchInput) => Promise<CatchRecord>;
  updateCatch: (userId: string, update: CatchUpdateInput) => Promise<CatchRecord>;
  deleteCatch: (userId: string, id: string) => Promise<void>;
  getCatch: (userId: string, id: string) => Promise<CatchRecord | null>;
  listCatches: (userId: string, filters?: CatchFilters) => Promise<CatchListResult>;
  listForCommunity: (visibility?: CatchVisibility) => Promise<CatchRecord[]>;
};

const catchesConverter: FirestoreDataConverter<CatchRecord> = {
  toFirestore: () => {
    throw new Error('Writing via converter is not supported.');
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
    const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : createdAt;
    const deletedAt = data.deletedAt instanceof Timestamp ? data.deletedAt.toDate() : null;
    let caughtAt: string;
    if (typeof data.caughtAt === 'string') {
      caughtAt = data.caughtAt;
    } else if (data.caughtAt instanceof Timestamp) {
      caughtAt = data.caughtAt.toDate().toISOString();
    } else if (typeof data.caughtAt?.toDate === 'function') {
      caughtAt = data.caughtAt.toDate().toISOString();
    } else {
      caughtAt = new Date(0).toISOString();
    }
    const gear = sanitizeGear(data.gear ?? undefined) ?? null;
    const measurements = sanitizeMeasurements(data.measurements ?? undefined) ?? undefined;
    return {
      id: snapshot.id,
      userId: data.userId,
      species: data.species,
      caughtAt,
      notes: typeof data.notes === 'string' ? data.notes : undefined,
      location: data.location ?? {},
      gear,
      measurements,
      sharing: data.sharing ?? { visibility: 'private', shareWithCommunity: false, shareLocationCoordinates: false },
      environmentSnapshot: data.environmentSnapshot ?? undefined,
      forecastSnapshot: data.forecastSnapshot ?? undefined,
      createdAt,
      updatedAt,
      deletedAt,
    } as CatchRecord;
  },
};

function normalizeCaughtAt(value: string): Timestamp {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid caughtAt timestamp.');
  }
  return Timestamp.fromDate(parsed);
}

async function createCatch(userId: string, input: CatchInput): Promise<CatchRecord> {
  const ref = adminDb.collection('catches').doc();
  const now = FieldValue.serverTimestamp();
  const measurements = sanitizeMeasurements(input.measurements);
  const gear = sanitizeGear(input.gear);
  const payload = {
    userId,
    species: input.species,
    caughtAt: normalizeCaughtAt(input.caughtAt),
    notes: input.notes ?? null,
    location: input.location,
    gear: gear ?? null,
    measurements: measurements ?? null,
    sharing: input.sharing,
    environmentSnapshot: input.environmentSnapshot ?? null,
    forecastSnapshot: input.forecastSnapshot ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await ref.set(payload);
  const snapshot = await ref.withConverter(catchesConverter).get();
  return snapshot.data()!;
}

async function assertOwnership(userId: string, catchId: string) {
  const doc = await adminDb.collection('catches').doc(catchId).get();
  if (!doc.exists) {
    const error = new Error('Catch not found.');
    (error as Error & { code?: string }).code = 'not-found';
    throw error;
  }
  const data = doc.data() as { userId?: string };
  if (data.userId !== userId) {
    const error = new Error('Forbidden.');
    (error as Error & { code?: string }).code = 'forbidden';
    throw error;
  }
  return doc;
}

async function updateCatch(userId: string, update: CatchUpdateInput): Promise<CatchRecord> {
  const doc = await assertOwnership(userId, update.id);
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  if (update.species != null) updates.species = update.species;
  if (update.caughtAt != null) updates.caughtAt = normalizeCaughtAt(update.caughtAt);
  if (update.notes !== undefined) updates.notes = update.notes ?? null;
  if (update.location != null) updates.location = update.location;
  if (update.gear != null) {
    const gear = sanitizeGear(update.gear);
    updates.gear = gear ?? null;
  }
  if (update.measurements !== undefined) {
    updates.measurements = sanitizeMeasurements(update.measurements) ?? null;
  }
  if (update.sharing != null) updates.sharing = update.sharing;
  if (update.environmentSnapshot !== undefined) updates.environmentSnapshot = update.environmentSnapshot ?? null;
  if (update.forecastSnapshot !== undefined) updates.forecastSnapshot = update.forecastSnapshot ?? null;

  await doc.ref.update(updates);
  const snapshot = await doc.ref.withConverter(catchesConverter).get();
  return snapshot.data()!;
}

async function deleteCatch(userId: string, id: string): Promise<void> {
  const doc = await assertOwnership(userId, id);
  await doc.ref.update({ deletedAt: FieldValue.serverTimestamp() });
}

async function getCatch(userId: string, id: string): Promise<CatchRecord | null> {
  const snapshot = await adminDb.collection('catches').doc(id).withConverter(catchesConverter).get();
  if (!snapshot.exists) return null;
  const record = snapshot.data()!;
  if (record.userId !== userId) {
    return null;
  }
  if (record.deletedAt) {
    return null;
  }
  return record;
}

type FirestoreQuery = FirebaseFirestore.Query;

function applyFilters(query: FirestoreQuery, filters?: CatchFilters) {
  let next = query;
  if (filters?.visibility) {
    next = next.where('sharing.visibility', '==', filters.visibility);
  }
  if (filters?.from) {
    next = next.where('caughtAt', '>=', Timestamp.fromDate(filters.from));
  }
  if (filters?.to) {
    next = next.where('caughtAt', '<=', Timestamp.fromDate(filters.to));
  }
  next = next.orderBy('caughtAt', 'desc');
  if (filters?.limit) {
    next = next.limit(filters.limit);
  }
  return next;
}

async function listCatches(userId: string, filters?: CatchFilters): Promise<CatchListResult> {
  const base = adminDb.collection('catches').where('userId', '==', userId).where('deletedAt', '==', null);
  const query = applyFilters(base, filters);
  const snapshot = await query.withConverter(catchesConverter).get();
  return { entries: snapshot.docs.map((doc) => doc.data()) };
}

async function listForCommunity(visibility?: CatchVisibility): Promise<CatchRecord[]> {
  let base = adminDb
    .collection('catches')
    .where('deletedAt', '==', null)
    .where('sharing.shareWithCommunity', '==', true);
  if (visibility) {
    base = base.where('sharing.visibility', '==', visibility);
  }
  const snapshot = await base.orderBy('caughtAt', 'desc').limit(500).withConverter(catchesConverter).get();
  return snapshot.docs.map((doc) => doc.data());
}

let repository: CatchRepository = {
  createCatch,
  updateCatch,
  deleteCatch,
  getCatch,
  listCatches,
  listForCommunity,
};

export function setCatchRepositoryForTesting(mock?: CatchRepository) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test hooks are not available in production.');
  }
  repository = mock ?? {
    createCatch,
    updateCatch,
    deleteCatch,
    getCatch,
    listCatches,
    listForCommunity,
  };
}

export function getCatchRepository(): CatchRepository {
  return repository;
}
