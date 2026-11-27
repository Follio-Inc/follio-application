import {
  AI_CONNECTOR_SCOPES,
  MCP_PATH,
  OAUTH_AUTHORIZE_PATH,
  OAUTH_REGISTER_PATH,
  OAUTH_TOKEN_PATH,
} from './constants';
import { configuredOrigin, isAllowedConnectorHost } from './public-origin';

export function oauthIssuer(origin?: string): string {
  return (origin ?? configuredOrigin()).replace(/\/+$/, '');
}

export function mcpResourceUrl(origin?: string): string {
  return `${oauthIssuer(origin)}${MCP_PATH}`;
}

export function authorizationServerMetadata(origin?: string) {
  const issuer = oauthIssuer(origin);
  return {
    issuer,
    authorization_endpoint: `${issuer}${OAUTH_AUTHORIZE_PATH}`,
    token_endpoint: `${issuer}${OAUTH_TOKEN_PATH}`,
    registration_endpoint: `${issuer}${OAUTH_REGISTER_PATH}`,
    scopes_supported: [...AI_CONNECTOR_SCOPES],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
  };
}

function mcpPath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/** True when the OAuth resource is omitted or is this app's MCP URL. */
export function isMcpResource(resource: string | null | undefined): boolean {
  if (!resource) return true;

  try {
    const given = new URL(resource);
    return mcpPath(given.pathname) === MCP_PATH && isAllowedConnectorHost(given.hostname);
  } catch {
    return false;
  }
}

export function protectedResourceMetadata(origin?: string) {
  const issuer = oauthIssuer(origin);
  return {
    resource: mcpResourceUrl(origin),
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: [...AI_CONNECTOR_SCOPES],
    resource_documentation: `${issuer}/settings?tab=ai-assistants`,
  };
}
