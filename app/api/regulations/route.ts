import { NextResponse } from 'next/server';

import { requireAuth } from '@/lib/server/auth';
import { getRegulationsPayload } from '@/lib/server/regulationsService';

export async function GET(request: Request) {
  try {
    await requireAuth(request);
  } catch (error) {
    const message = (error as Error)?.message ?? 'Unauthorized';
    const status = (error as { code?: string }).code === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  const url = new URL(request.url);
  const region = url.searchParams.get('region');
  const species = url.searchParams.get('species');

  const payload = await getRegulationsPayload({ region, species });

  return NextResponse.json(
    {
      items: payload.items,
      count: payload.items.length,
      version: payload.version,
    },
    {
      status: 200,
      headers: {
        'cache-control': 'private, max-age=300',
        'x-regulations-version': payload.version,
      },
    },
  );
}
