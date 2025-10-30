import { NextRequest, NextResponse } from 'next/server';

import { type CatchRecord, validateCatchUpdate } from '@/lib/catches';
import { requireAuth } from '@/lib/server/auth';
import { getCatchRepository } from '@/lib/server/catchesRepository';

type CatchRouteContext = {
  params?: Promise<Record<string, string | string[] | undefined>>;
};

async function resolveCatchId(context: CatchRouteContext): Promise<string> {
  const params = (await context.params) ?? {};
  const catchId = params.catchId;
  if (typeof catchId !== 'string' || !catchId) {
    const error = new Error('Catch not found.');
    (error as Error & { code?: string }).code = 'not-found';
    throw error;
  }
  return catchId;
}

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

export async function GET(request: NextRequest, context: CatchRouteContext) {
  try {
    const repo = getCatchRepository();
    const user = await requireAuth(request);
    const catchId = await resolveCatchId(context);
    const record = await repo.getCatch(user.uid, catchId);
    if (!record) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(serializeCatch(record));
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, context: CatchRouteContext) {
  try {
    const user = await requireAuth(request);
    const payload = await request.json();
    const catchId = await resolveCatchId(context);
    const update = validateCatchUpdate({ ...payload, id: catchId });
    const repo = getCatchRepository();
    const updated = await repo.updateCatch(user.uid, update);
    return NextResponse.json(serializeCatch(updated));
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, context: CatchRouteContext) {
  try {
    const user = await requireAuth(request);
    const repo = getCatchRepository();
    const catchId = await resolveCatchId(context);
    await repo.deleteCatch(user.uid, catchId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleError(error);
  }
}
