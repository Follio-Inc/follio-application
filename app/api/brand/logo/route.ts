import { NextResponse, type NextRequest } from 'next/server';

import { cacheKey, readCache, writeCache } from '@/lib/brand-logo/cache';
import { domainFromUrl, resolveBrandDomains, type BrandKind } from '@/lib/brand-logo/domain';
import { fetchBrandLogo } from '@/lib/brand-logo/fetch';

/**
 * GET /api/brand/logo?name=Molson+Coors&kind=company[&url=https://molsoncoors.com]
 *
 * Returns a normalized 128px PNG, or 404 when no official logo can be found —
 * the caller then renders a monogram.
 *
 * Only `name` and `kind` drive the lookup, and `url` is reduced to a bare
 * hostname before use. Outbound requests always go to a fixed set of provider
 * hosts, so a caller cannot point this endpoint at an arbitrary address.
 */

const MAX_NAME_LENGTH = 120;
/** A year: logos are stable, and a wrong-but-cached miss expires server-side. */
const CACHE_CONTROL = 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800';

function isBrandKind(value: string | null): value is BrandKind {
  return value === 'company' || value === 'school';
}

function notFound(): NextResponse {
  // Cached briefly so a missing logo does not hammer providers, but not so long
  // that newly added coverage stays invisible.
  return new NextResponse(null, {
    status: 404,
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const name = params.get('name')?.trim();
  const kind = params.get('kind');

  if (!name || name.length > MAX_NAME_LENGTH || !isBrandKind(kind)) {
    return NextResponse.json({ error: 'Invalid brand lookup' }, { status: 400 });
  }

  const domainHint = domainFromUrl(params.get('url'));
  const key = cacheKey(kind, name, domainHint);

  const cached = readCache(key);
  if (cached === null) return notFound();
  if (cached) {
    return new NextResponse(new Uint8Array(cached), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': CACHE_CONTROL },
    });
  }

  const domains = resolveBrandDomains({ name, url: domainHint, kind });
  if (domains.length === 0) {
    writeCache(key, null);
    return notFound();
  }

  const logo = await fetchBrandLogo(domains);
  writeCache(key, logo?.body ?? null);

  if (!logo) return notFound();

  return new NextResponse(new Uint8Array(logo.body), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': CACHE_CONTROL,
      'X-Brand-Domain': logo.domain,
    },
  });
}
