import { NextResponse } from 'next/server';

import {
  assertCanRunDeveloperSuites,
  DeveloperSuitesDisabledError,
} from '@/_admin-panel/modules/developer/guard';
import { getLiveQaPathway, runLiveQa } from '@/_admin-panel/modules/developer/live-qa';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Body = {
  pathwayIds?: unknown;
  resumeFixtureId?: unknown;
  personaFixtureId?: unknown;
  customResumePath?: unknown;
  baseUrl?: unknown;
  headed?: unknown;
  triageWithAi?: unknown;
};

export async function POST(request: Request) {
  try {
    await requireAdmin();
    assertCanRunDeveloperSuites();

    const body = (await request.json()) as Body;
    const pathwayIds = Array.isArray(body.pathwayIds)
      ? body.pathwayIds.filter((id): id is string => typeof id === 'string')
      : [];

    if (!pathwayIds.length) {
      return NextResponse.json({ error: 'pathwayIds required' }, { status: 400 });
    }
    for (const id of pathwayIds) {
      if (!getLiveQaPathway(id)) {
        return NextResponse.json({ error: `Unknown pathwayId: ${id}` }, { status: 400 });
      }
    }

    const result = await runLiveQa({
      pathwayIds,
      resumeFixtureId: typeof body.resumeFixtureId === 'string' ? body.resumeFixtureId : undefined,
      personaFixtureId:
        typeof body.personaFixtureId === 'string' ? body.personaFixtureId : undefined,
      customResumePath:
        typeof body.customResumePath === 'string' ? body.customResumePath : undefined,
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
      headed: body.headed === true,
      triageWithAi: body.triageWithAi !== false,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, { path: '/api/admin/developer/live-qa/run', method: 'POST' });
  }
}
