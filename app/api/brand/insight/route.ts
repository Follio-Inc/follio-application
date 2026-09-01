import { NextResponse, type NextRequest } from 'next/server';

import {
  fetchBrandInsight,
  insightCacheKey,
  readInsightCache,
  writeInsightCache,
} from '@/lib/brand-insight';
import { domainFromUrl, type BrandKind } from '@/lib/brand-logo/domain';

/**
 * GET /api/brand/insight?name=Stripe&kind=company[&url=https://stripe.com]
 *
 * Returns a short public-domain description of a company or school (Wikipedia),
 * or 404 when nothing trustworthy is found. Visitors never talk to Wikipedia
 * directly — this route caches and rate-limits the lookup.
 */

const MAX_NAME_LENGTH = 120;
const CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800';

function isBrandKind(value: string | null): value is BrandKind {
  return value === 'company' || value === 'school';
}

function notFound(): NextResponse {
  return NextResponse.json(
    { error: 'No insight found' },
    {
      status: 404,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
    }
  );
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const name = params.get('name')?.trim();
  const kind = params.get('kind');

  if (!name || name.length > MAX_NAME_LENGTH || !isBrandKind(kind)) {
    return NextResponse.json({ error: 'Invalid insight lookup' }, { status: 400 });
  }

  const domainHint = domainFromUrl(params.get('url'));
  const key = insightCacheKey(kind, name, domainHint);

  const cached = readInsightCache(key);
  if (cached === null) return notFound();
  if (cached) {
    return NextResponse.json(
      { insight: { ...cached, siteUrl: domainHint ? `https://${domainHint}` : null } },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  }

  const insight = await fetchBrandInsight(name, kind);
  writeInsightCache(key, insight);

  if (!insight) return notFound();

  return NextResponse.json(
    { insight: { ...insight, siteUrl: domainHint ? `https://${domainHint}` : null } },
    { headers: { 'Cache-Control': CACHE_CONTROL } }
  );
}
