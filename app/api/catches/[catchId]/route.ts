import { NextResponse } from 'next/server';

import { type CatchRecord, validateCatchUpdate } from '@/lib/catches';
import { requireAuth } from '@/lib/server/auth';
import { getCatchRepository } from '@/lib/server/catchesRepository';

function serializeCatch(record: CatchRecord) {
  const gear = record.gear && Object.keys(record.gear).length ? record.gear : null;
  const measurements =
    record.measurements && Object.keys(record.measurements).length ? record.measurements : null;
  return {
    id: record.id,
    species: record.species,
    caughtAt: record.caughtAt,
    notes: record.notes ?? null,
    location: record.location,
    gear,
    measurements,
    sharing: record.sharing,
    environmentSnapshot: record.environmentSnapshot ?? null,
    forecastSnapshot: record.forecastSnapshot ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function handleError(error: unknown) {
  if (error && typeof error === 'object') {
    const code = (error as { code?: string }).code;
    if (code === 'unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (code === 'forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (code === 'not-found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
}

export async function GET(request: Request, context: { params: { catchId: string } }) {
  try {
    const repo = getCatchRepository();
    const user = await requireAuth(request);
    const record = await repo.getCatch(user.uid, context.params.catchId);
    if (!record) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(serializeCatch(record));
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, context: { params: { catchId: string } }) {
  try {
    const user = await requireAuth(request);
    const payload = await request.json();
    const update = validateCatchUpdate({ ...payload, id: context.params.catchId });
    const repo = getCatchRepository();
    const updated = await repo.updateCatch(user.uid, update);
    return NextResponse.json(serializeCatch(updated));
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: { params: { catchId: string } }) {
  try {
    const user = await requireAuth(request);
    const repo = getCatchRepository();
    await repo.deleteCatch(user.uid, context.params.catchId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleError(error);
  }
}
