import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { parseScopeString } from '@/lib/ai-connector/scopes';
import { db } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { createAuthorizationCode, getOauthClient } from '@/services/ai-connector-oauth.service';
import { redirectUriMatches } from '@/lib/ai-connector/oauth-register';

export const dynamic = 'force-dynamic';

function redirectWithParams(redirectUri: string, params: Record<string, string>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await request.formData();
  const clientId = String(form.get('client_id') || '');
  const redirectUri = String(form.get('redirect_uri') || '');
  const codeChallenge = String(form.get('code_challenge') || '');
  const state = String(form.get('state') || '');
  const scope = String(form.get('scope') || '');
  const decision = String(form.get('decision') || '');

  const client = await getOauthClient(clientId);
  if (!client || !redirectUriMatches(client.redirectUris, redirectUri)) {
    return NextResponse.json({ error: 'Invalid client or redirect URI' }, { status: 400 });
  }

  if (decision !== 'allow') {
    return redirectWithParams(redirectUri, {
      error: 'access_denied',
      ...(state ? { state } : {}),
    });
  }

  if (!codeChallenge) {
    return redirectWithParams(redirectUri, {
      error: 'invalid_request',
      error_description: 'code_challenge is required',
      ...(state ? { state } : {}),
    });
  }

  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true, profile: { select: { id: true } } },
  });

  if (!user?.profile) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  try {
    const code = await createAuthorizationCode({
      clientId,
      userId: user.id,
      redirectUri,
      codeChallenge,
      scopes: parseScopeString(scope),
    });

    return redirectWithParams(redirectUri, {
      code,
      ...(state ? { state } : {}),
    });
  } catch (error) {
    const description = isAppError(error) ? error.message : 'Could not complete authorization';
    return redirectWithParams(redirectUri, {
      error: 'server_error',
      error_description: description,
      ...(state ? { state } : {}),
    });
  }
}
