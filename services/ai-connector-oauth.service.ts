import { ACCESS_TOKEN_TTL_MS, AUTH_CODE_TTL_MS } from '@/lib/ai-connector/constants';
import {
  generateAccessToken,
  generateClientId,
  generateOpaqueToken,
  hashSecret,
} from '@/lib/ai-connector/crypto';
import {
  isAllowedRedirectUri,
  oauthRegisterSchema,
  redirectUriMatches,
} from '@/lib/ai-connector/oauth-register';
import { verifyPkceS256 } from '@/lib/ai-connector/pkce';
import {
  formatScopeList,
  parseScopeString,
  uniqueScopes,
  type AiConnectorScope,
} from '@/lib/ai-connector/scopes';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';

export async function registerOauthClient(body: unknown) {
  const parsed = oauthRegisterSchema.safeParse(body);
  if (!parsed.success) {
    throw Errors.badRequest('Invalid client registration');
  }

  const redirectUris = parsed.data.redirect_uris.filter(isAllowedRedirectUri);
  if (redirectUris.length === 0) {
    throw Errors.badRequest('At least one https (or localhost) redirect URI is required');
  }

  const clientId = generateClientId();
  const client = await db.aiConnectorClient.create({
    data: {
      clientId,
      redirectUris,
      name: parsed.data.client_name?.trim() || 'AI assistant',
      tokenEndpointAuthMethod: parsed.data.token_endpoint_auth_method ?? 'none',
    },
  });

  return {
    client_id: client.clientId,
    client_name: client.name,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
  };
}

export async function getOauthClient(clientId: string) {
  return db.aiConnectorClient.findUnique({
    where: { clientId },
  });
}

export async function createAuthorizationCode(options: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: AiConnectorScope[];
}): Promise<string> {
  const client = await getOauthClient(options.clientId);
  if (!client) {
    throw Errors.badRequest('Unknown client');
  }
  if (!redirectUriMatches(client.redirectUris, options.redirectUri)) {
    throw Errors.badRequest('redirect_uri does not match the registered client');
  }

  const code = generateOpaqueToken(32);
  await db.aiConnectorAuthCode.create({
    data: {
      codeHash: hashSecret(code),
      clientId: options.clientId,
      userId: options.userId,
      redirectUri: options.redirectUri,
      codeChallenge: options.codeChallenge,
      codeChallengeMethod: 'S256',
      scopes: options.scopes,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  });

  return code;
}

export async function exchangeAuthorizationCode(options: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const record = await db.aiConnectorAuthCode.findUnique({
    where: { codeHash: hashSecret(options.code) },
    include: { client: true, user: { select: { id: true } } },
  });

  if (!record) {
    throw Errors.unauthorized('Invalid authorization code');
  }
  if (record.usedAt) {
    throw Errors.unauthorized('Authorization code already used');
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    throw Errors.unauthorized('Authorization code expired');
  }
  if (record.clientId !== options.clientId) {
    throw Errors.unauthorized('client_id does not match');
  }
  if (record.redirectUri !== options.redirectUri) {
    throw Errors.unauthorized('redirect_uri does not match');
  }
  if (!verifyPkceS256(options.codeVerifier, record.codeChallenge)) {
    throw Errors.unauthorized('PKCE verification failed');
  }

  await db.aiConnectorAuthCode.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  const accessToken = generateAccessToken();
  const scopes = uniqueScopes(parseScopeString(record.scopes.join(' ')));

  await db.aiConnectorToken.create({
    data: {
      userId: record.userId,
      clientId: record.clientId,
      tokenHash: hashSecret(accessToken),
      scopes,
      label: record.client.name,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    },
  });

  return {
    access_token: accessToken,
    token_type: 'bearer' as const,
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: formatScopeList(scopes),
  };
}

export { parseScopeString };
