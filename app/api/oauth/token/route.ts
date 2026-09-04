import { NextRequest } from 'next/server';

import { corsEmpty, corsJson } from '@/lib/ai-connector/cors';
import { isAppError } from '@/lib/errors';
import { exchangeAuthorizationCode } from '@/services/ai-connector-oauth.service';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return corsEmpty(204);
}

async function readTokenParams(request: NextRequest): Promise<Record<string, string>> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = (await request.json()) as Record<string, unknown>;
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') params[key] = value;
    }
    return params;
  }

  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') params[key] = value;
  }
  return params;
}

export async function POST(request: NextRequest) {
  try {
    const params = await readTokenParams(request);
    if (params.grant_type !== 'authorization_code') {
      return corsJson(
        { error: 'unsupported_grant_type', error_description: 'Use authorization_code' },
        { status: 400 }
      );
    }

    const code = params.code;
    const clientId = params.client_id;
    const redirectUri = params.redirect_uri;
    const codeVerifier = params.code_verifier;

    if (!code || !clientId || !redirectUri || !codeVerifier) {
      return corsJson(
        {
          error: 'invalid_request',
          error_description: 'code, client_id, redirect_uri, and code_verifier are required',
        },
        { status: 400 }
      );
    }

    const token = await exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri,
      codeVerifier,
    });

    return corsJson(token);
  } catch (error) {
    const description = isAppError(error) ? error.message : 'Token exchange failed';
    return corsJson({ error: 'invalid_grant', error_description: description }, { status: 400 });
  }
}
