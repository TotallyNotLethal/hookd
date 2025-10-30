import { NextRequest, NextResponse } from 'next/server';

import { GroupMemberRecord, GroupRecord, getGroupsRepository, groupUpdateSchema } from '@/lib/groups';
import { requireAuth } from '@/lib/server/auth';

function serializeGroup(record: GroupRecord, membership?: GroupMemberRecord | null) {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    visibility: record.visibility,
    ownerId: record.ownerId,
    photoURL: record.photoURL,
    featuredCatchIds: record.featuredCatchIds,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    membership: membership
      ? {
          role: membership.role,
          status: membership.status,
        }
      : null,
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

export async function GET(request: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const user = await requireAuth(request);
    const repo = getGroupsRepository();
    const group = await repo.getGroup(user.uid, params.groupId);
    if (!group) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const membership = await repo.getMembership(group.id, user.uid);
    return NextResponse.json(serializeGroup(group, membership));
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const user = await requireAuth(request);
    const payload = await request.json();
    const input = groupUpdateSchema.parse(payload);
    const repo = getGroupsRepository();
    const updated = await repo.updateGroup(user.uid, params.groupId, input);
    const membership = await repo.getMembership(updated.id, user.uid);
    return NextResponse.json(serializeGroup(updated, membership));
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const user = await requireAuth(request);
    const repo = getGroupsRepository();
    await repo.deleteGroup(user.uid, params.groupId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
