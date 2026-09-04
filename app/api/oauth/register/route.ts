import { NextRequest } from 'next/server';

import { corsEmpty, corsJson } from '@/lib/ai-connector/cors';
import { isAppError } from '@/lib/errors';
import { registerOauthClient } from '@/services/ai-connector-oauth.service';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return corsEmpty(204);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const client = await registerOauthClient(body);
    return corsJson(client, { status: 201 });
  } catch (error) {
    if (isAppError(error)) {
      return corsJson(
        { error: 'invalid_client_metadata', error_description: error.message },
        { status: error.statusCode }
      );
    }
    return corsJson(
      { error: 'invalid_client_metadata', error_description: 'Could not register client' },
      { status: 400 }
    );
  }
}
