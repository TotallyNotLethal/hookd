import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { GROUP_ROLES, GroupMemberRecord, getGroupsRepository } from '@/lib/groups';
import { requireAuth } from '@/lib/server/auth';

function serializeMember(member: GroupMemberRecord) {
  return {
    id: member.id,
    groupId: member.groupId,
    userId: member.userId,
    role: member.role,
    status: member.status,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
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

const roleUpdateSchema = z.object({
  role: z.enum(GROUP_ROLES),
});

export async function PATCH(request: NextRequest, { params }: { params: { groupId: string; userId: string } }) {
  try {
    const user = await requireAuth(request);
    const payload = await request.json();
    const input = roleUpdateSchema.parse(payload);
    const repo = getGroupsRepository();
    const updated = await repo.updateMemberRole(user.uid, params.groupId, params.userId, input.role);
    return NextResponse.json(serializeMember(updated));
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { groupId: string; userId: string } }) {
  try {
    const user = await requireAuth(request);
    const repo = getGroupsRepository();
    if (params.userId === user.uid) {
      await repo.leaveGroup(user.uid, params.groupId);
    } else {
      await repo.leaveGroup(user.uid, params.groupId, params.userId);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
