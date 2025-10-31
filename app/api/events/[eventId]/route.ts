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

type EventRouteContext = {
  params: Promise<{ eventId: string }>;
};

async function resolveEventId(context: EventRouteContext) {
  const params = await context.params;
  return params.eventId;
}

export async function GET(request: NextRequest, context: EventRouteContext) {
  try {
    const user = await requireAuth(request);
    const repo = getGroupsRepository();
    const eventId = await resolveEventId(context);
    const event = await repo.getEvent(user.uid, eventId);
    if (!event) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(serializeEvent(event));
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, context: EventRouteContext) {
  try {
    const user = await requireAuth(request);
    const payload = await request.json();
    const eventId = await resolveEventId(context);
    const input = groupEventUpdateSchema.parse({ ...payload, eventId });
    const repo = getGroupsRepository();
    const updated = await repo.updateEvent(user.uid, input);
    return NextResponse.json(serializeEvent(updated));
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, context: EventRouteContext) {
  try {
    const user = await requireAuth(request);
    const repo = getGroupsRepository();
    const eventId = await resolveEventId(context);
    await repo.deleteEvent(user.uid, eventId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
