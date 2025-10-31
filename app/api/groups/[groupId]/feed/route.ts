import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getGroupsRepository } from '@/lib/groups';
import { requireAuth } from '@/lib/server/auth';

const feedMutationSchema = z.object({
  catchId: z.string().min(1, 'Catch id is required.'),
});

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

type GroupFeedRouteContext = {
  params: Promise<{ groupId: string }>;
};

async function resolveGroupId(context: GroupFeedRouteContext) {
  const params = await context.params;
  return params.groupId;
}

export async function GET(request: NextRequest, context: GroupFeedRouteContext) {
  try {
    const user = await requireAuth(request);
    const repo = getGroupsRepository();
    const groupId = await resolveGroupId(context);
    const group = await repo.getGroup(user.uid, groupId);
    if (!group) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ featuredCatchIds: group.featuredCatchIds });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, context: GroupFeedRouteContext) {
  try {
    const user = await requireAuth(request);
    const payload = await request.json();
    const input = feedMutationSchema.parse(payload);
    const repo = getGroupsRepository();
    const groupId = await resolveGroupId(context);
    const group = await repo.addCatchToFeed(user.uid, groupId, input.catchId);
    return NextResponse.json({ featuredCatchIds: group.featuredCatchIds });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, context: GroupFeedRouteContext) {
  try {
    const user = await requireAuth(request);
    const payload = await request.json();
    const input = feedMutationSchema.parse(payload);
    const repo = getGroupsRepository();
    const groupId = await resolveGroupId(context);
    const group = await repo.removeCatchFromFeed(user.uid, groupId, input.catchId);
    return NextResponse.json({ featuredCatchIds: group.featuredCatchIds });
  } catch (error) {
    return handleError(error);
  }
}
