import { absoluteUrl } from '@/lib/utils';

import {
  AI_CONNECTOR_SCOPES,
  OAUTH_AUTHORIZE_PATH,
  OAUTH_REGISTER_PATH,
  OAUTH_TOKEN_PATH,
} from './constants';
import { mcpResourceUrl } from './cors';

export function oauthIssuer(): string {
  return absoluteUrl('').replace(/\/+$/, '');
}

export function authorizationServerMetadata() {
  const issuer = oauthIssuer();
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

export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [oauthIssuer()],
    bearer_methods_supported: ['header'],
    scopes_supported: [...AI_CONNECTOR_SCOPES],
    resource_documentation: absoluteUrl('/settings?tab=ai-assistants'),
  };
}
