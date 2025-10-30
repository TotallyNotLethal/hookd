import { NextRequest, NextResponse } from 'next/server';

import {
  CATCH_VISIBILITIES,
  type CatchFilters,
  type CatchRecord,
  validateCatchInput,
} from '@/lib/catches';
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

function parseFilters(url: URL): CatchFilters {
  const filters: CatchFilters = {};
  const visibility = url.searchParams.get('visibility');
  if (visibility && (CATCH_VISIBILITIES as readonly string[]).includes(visibility)) {
    filters.visibility = visibility as CatchFilters['visibility'];
  }
  const from = url.searchParams.get('from');
  if (from) {
    const parsed = new Date(from);
    if (!Number.isNaN(parsed.getTime())) {
      filters.from = parsed;
    }
  }
  const to = url.searchParams.get('to');
  if (to) {
    const parsed = new Date(to);
    if (!Number.isNaN(parsed.getTime())) {
      filters.to = parsed;
    }
  }
  const limit = url.searchParams.get('limit');
  if (limit) {
    const parsed = Number.parseInt(limit, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      filters.limit = Math.min(parsed, 100);
    }
  }
  return filters;
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

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const filters = parseFilters(new URL(request.url));
    const repo = getCatchRepository();
    const result = await repo.listCatches(user.uid, filters);
    return NextResponse.json({ entries: result.entries.map(serializeCatch) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const payload = await request.json();
    const input = validateCatchInput(payload);
    const repo = getCatchRepository();
    const created = await repo.createCatch(user.uid, input);
    return NextResponse.json(serializeCatch(created), { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
