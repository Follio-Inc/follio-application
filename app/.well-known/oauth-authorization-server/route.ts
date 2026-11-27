import { NextRequest } from 'next/server';

import { corsEmpty, corsJson } from '@/lib/ai-connector/cors';
import { authorizationServerMetadata } from '@/lib/ai-connector/oauth-metadata';
import { publicOriginFromHeaders } from '@/lib/ai-connector/public-origin';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return corsEmpty(204);
}

export async function GET(request: NextRequest) {
  return corsJson(authorizationServerMetadata(publicOriginFromHeaders(request.headers)));
}
