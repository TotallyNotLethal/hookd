import { NextRequest, NextResponse } from 'next/server';

import { GroupEventRecord, getGroupsRepository, groupEventCreateSchema } from '@/lib/groups';
import { requireAuth } from '@/lib/server/auth';

function serializeEvent(record: GroupEventRecord) {
  return {
    id: record.id,
    groupId: record.groupId,
    title: record.title,
    description: record.description,
    createdBy: record.createdBy,
    startAt: record.startAt.toISOString(),
    endAt: record.endAt ? record.endAt.toISOString() : null,
    locationName: record.locationName,
    locationLatitude: record.locationLatitude,
    locationLongitude: record.locationLongitude,
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

function getBooleanParam(url: URL, key: string) {
  const value = url.searchParams.get(key);
  if (!value) return false;
  return value === '1' || value.toLowerCase() === 'true';
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const url = new URL(request.url);
    const groupId = url.searchParams.get('groupId');
    if (!groupId) {
      return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
    }
    const includePast = getBooleanParam(url, 'includePast');
    const repo = getGroupsRepository();
    const events = await repo.listEvents(user.uid, groupId, { includePast });
    return NextResponse.json({ events: events.map(serializeEvent) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const payload = await request.json();
    const input = groupEventCreateSchema.parse(payload);
    const repo = getGroupsRepository();
    const created = await repo.createEvent(user.uid, input);
    return NextResponse.json(serializeEvent(created), { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
