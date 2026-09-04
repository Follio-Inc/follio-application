import { AI_CONNECTOR_SCOPES, type AiConnectorScope } from './constants';

export type { AiConnectorScope };

const SCOPE_SET = new Set<string>(AI_CONNECTOR_SCOPES);

export function parseScopeString(value: string | null | undefined): AiConnectorScope[] {
  if (!value || !value.trim()) {
    return [...AI_CONNECTOR_SCOPES];
  }

  const requested = value
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  const allowed = requested.filter((scope): scope is AiConnectorScope => SCOPE_SET.has(scope));
  return allowed.length > 0 ? uniqueScopes(allowed) : [...AI_CONNECTOR_SCOPES];
}

export function uniqueScopes(scopes: AiConnectorScope[]): AiConnectorScope[] {
  return AI_CONNECTOR_SCOPES.filter((scope) => scopes.includes(scope));
}

export function hasScope(granted: string[], needed: AiConnectorScope): boolean {
  return granted.includes(needed);
}

export function formatScopeList(scopes: string[]): string {
  return scopes.join(' ');
}
