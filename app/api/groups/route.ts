import { NextRequest, NextResponse } from 'next/server';

import { GroupMemberRecord, GroupRecord, getGroupsRepository, groupCreateSchema } from '@/lib/groups';
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

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const repo = getGroupsRepository();
    const groups = await repo.listGroupsForUser(user.uid);
    const enriched = await Promise.all(
      groups.map(async (group) => {
        const membership = await repo.getMembership(group.id, user.uid);
        return serializeGroup(group, membership);
      }),
    );
    return NextResponse.json({ groups: enriched });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const payload = await request.json();
    const input = groupCreateSchema.parse(payload);
    const repo = getGroupsRepository();
    const created = await repo.createGroup(user.uid, input);
    const membership = await repo.getMembership(created.id, user.uid);
    return NextResponse.json(serializeGroup(created, membership), { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

