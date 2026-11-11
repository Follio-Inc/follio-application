import { ROOT_DOMAIN } from '@/lib/url';
import { getBaseUrl } from '@/lib/utils';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

type HeaderSource = { get(name: string): string | null };

/** Origin from NEXT_PUBLIC_APP_URL, without a trailing slash. */
export function configuredOrigin(): string {
  return getBaseUrl().replace(/\/+$/, '');
}

function hostnameFromHostHeader(hostHeader: string): string {
  const host = hostHeader.trim().toLowerCase();
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end === -1 ? host : host.slice(0, end + 1);
  }
  return host.split(':')[0] ?? host;
}

function portSuffix(hostHeader: string): string {
  const host = hostHeader.trim();
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    const rest = end === -1 ? '' : host.slice(end + 1);
    return rest.startsWith(':') ? rest : '';
  }
  const colon = host.indexOf(':');
  return colon === -1 ? '' : host.slice(colon);
}

/** Hosts that may appear in Claude's connector URL for this app. */
export function isAllowedConnectorHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) return true;

  try {
    const configured = new URL(configuredOrigin()).hostname.toLowerCase();
    return host === configured || host === `www.${configured}` || configured === `www.${host}`;
  } catch {
    return false;
  }
}

function originForHost(hostHeader: string, hostname: string, headers: HeaderSource): string {
  const protoHeader = headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const proto =
    protoHeader === 'http' || protoHeader === 'https'
      ? protoHeader
      : LOCAL_HOSTS.has(hostname)
        ? 'http'
        : 'https';

  let port = portSuffix(hostHeader);
  if ((proto === 'https' && port === ':443') || (proto === 'http' && port === ':80')) {
    port = '';
  }

  return `${proto}://${hostname}${port}`;
}

/**
 * Public origin for OAuth discovery. Claude requires this to match the connector
 * URL exactly, so a request to www must not advertise the apex host that redirects.
 * Untrusted Host headers fall back to the configured app origin.
 */
export function publicOriginFromHeaders(headers: HeaderSource): string {
  for (const raw of [headers.get('x-forwarded-host'), headers.get('host')]) {
    const first = raw?.split(',')[0]?.trim();
    if (!first) continue;
    const hostname = hostnameFromHostHeader(first);
    if (!isAllowedConnectorHost(hostname)) continue;
    return originForHost(first, hostname, headers);
  }
  return configuredOrigin();
}
