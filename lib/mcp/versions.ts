/**
 * Protocol revisions this server answers.
 *
 * Legacy revisions use the initialize handshake (2025-11-25 and earlier).
 * Modern revisions send the version on every request (2026-07-28 and later).
 * Hosts pick one. The HTTP route serves both on the same URL.
 */

export const LEGACY_PROTOCOL_VERSIONS = ['2025-03-26', '2025-06-18', '2025-11-25'] as const;
export const MODERN_PROTOCOL_VERSIONS = ['2026-07-28'] as const;

export const OLDEST_LEGACY_PROTOCOL_VERSION = LEGACY_PROTOCOL_VERSIONS[0];
export const CURRENT_LEGACY_PROTOCOL_VERSION =
  LEGACY_PROTOCOL_VERSIONS[LEGACY_PROTOCOL_VERSIONS.length - 1];
export const CURRENT_PROTOCOL_VERSION =
  MODERN_PROTOCOL_VERSIONS[MODERN_PROTOCOL_VERSIONS.length - 1];

export const PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
export const SERVER_INFO_META_KEY = 'io.modelcontextprotocol/serverInfo';

/** MCP-reserved JSON-RPC error: the client asked for a revision we do not speak. */
export const JSON_RPC_UNSUPPORTED_PROTOCOL = -32022;
/** MCP-reserved JSON-RPC error: an HTTP header does not match the JSON-RPC body. */
export const JSON_RPC_HEADER_MISMATCH = -32020;

const LEGACY_SET = new Set<string>(LEGACY_PROTOCOL_VERSIONS);
const MODERN_SET = new Set<string>(MODERN_PROTOCOL_VERSIONS);

export function isLegacyProtocolVersion(version: string): boolean {
  return LEGACY_SET.has(version);
}

export function isModernProtocolVersion(version: string): boolean {
  return MODERN_SET.has(version);
}

export function isKnownProtocolVersion(version: string): boolean {
  return isLegacyProtocolVersion(version) || isModernProtocolVersion(version);
}

/**
 * Pick the handshake revision to answer with.
 * A supported request is echoed. An unknown request gets the newest handshake
 * we speak, so the client can disconnect instead of us pretending to match it.
 * A missing request gets the oldest handshake we speak.
 */
export function negotiateLegacyVersion(requested: unknown): string {
  if (typeof requested === 'string' && isLegacyProtocolVersion(requested)) {
    return requested;
  }
  if (typeof requested === 'string' && requested.length > 0) {
    return CURRENT_LEGACY_PROTOCOL_VERSION;
  }
  return OLDEST_LEGACY_PROTOCOL_VERSION;
}

export function modernProtocolVersions(): string[] {
  return [...MODERN_PROTOCOL_VERSIONS];
}

export function protocolVersionFromParams(params: unknown): string | null {
  if (!params || typeof params !== 'object') return null;
  const meta = (params as { _meta?: unknown })._meta;
  if (!meta || typeof meta !== 'object') return null;
  const version = (meta as Record<string, unknown>)[PROTOCOL_VERSION_META_KEY];
  return typeof version === 'string' && version.length > 0 ? version : null;
}

/**
 * Decode an MCP header value. Plain ASCII is used as-is. Values that cannot
 * be a header are wrapped as `=?base64?...?=`.
 */
export function decodeMcpHeaderValue(value: string): string {
  const match = value.match(/^=\?base64\?([A-Za-z0-9+/]+={0,2})\?=$/);
  if (!match) return value;
  return Buffer.from(match[1], 'base64').toString('utf8');
}
