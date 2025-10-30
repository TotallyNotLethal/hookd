import { NextRequest, NextResponse } from 'next/server';

import {
  GroupEventRecord,
  getGroupsRepository,
  groupEventUpdateSchema,
} from '@/lib/groups';
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

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const user = await requireAuth(request);
    const repo = getGroupsRepository();
    const event = await repo.getEvent(user.uid, params.eventId);
    if (!event) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(serializeEvent(event));
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const user = await requireAuth(request);
    const payload = await request.json();
    const input = groupEventUpdateSchema.parse({ ...payload, eventId: params.eventId });
    const repo = getGroupsRepository();
    const updated = await repo.updateEvent(user.uid, input);
    return NextResponse.json(serializeEvent(updated));
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const user = await requireAuth(request);
    const repo = getGroupsRepository();
    await repo.deleteEvent(user.uid, params.eventId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
