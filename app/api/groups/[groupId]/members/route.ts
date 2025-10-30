import { NextRequest, NextResponse } from 'next/server';

import { GroupMemberRecord, getGroupsRepository } from '@/lib/groups';
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

export async function GET(request: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const user = await requireAuth(request);
    const repo = getGroupsRepository();
    const members = await repo.listMembers(user.uid, params.groupId);
    return NextResponse.json({ members: members.map(serializeMember) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const user = await requireAuth(request);
    const repo = getGroupsRepository();
    const member = await repo.joinGroup(user.uid, params.groupId);
    return NextResponse.json(serializeMember(member), { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
