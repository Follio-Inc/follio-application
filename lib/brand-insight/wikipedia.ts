import type { CachedInsight } from './cache';
import { peekSummary, pickWikipediaTitle, type WikipediaSearchHit } from './match';

const WIKI_ORIGIN = 'https://en.wikipedia.org';
const USER_AGENT = 'Follio/1.0 (https://follio.me; brand-insight)';
const FETCH_MS = 4000;

type SearchResponse = {
  pages?: Array<{
    title?: string;
    description?: string | null;
    excerpt?: string | null;
  }>;
};

type SummaryResponse = {
  type?: string;
  title?: string;
  description?: string | null;
  extract?: string | null;
  content_urls?: { desktop?: { page?: string } };
};

async function wikiGet(path: string): Promise<Response> {
  return fetch(`${WIKI_ORIGIN}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      'Api-User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(FETCH_MS),
    redirect: 'follow',
  });
}

export async function fetchBrandInsight(
  name: string,
  kind: 'company' | 'school'
): Promise<CachedInsight | null> {
  const query = encodeURIComponent(name.trim());
  if (!query) return null;

  let searchRes: Response;
  try {
    searchRes = await wikiGet(`/w/rest.php/v1/search/page?q=${query}&limit=5`);
  } catch {
    return null;
  }
  if (!searchRes.ok) return null;

  const searchJson = (await searchRes.json()) as SearchResponse;
  const hits: WikipediaSearchHit[] = (searchJson.pages ?? [])
    .map((page) => ({
      title: page.title?.trim() ?? '',
      description: page.description ?? null,
      excerpt: page.excerpt ?? null,
    }))
    .filter((hit) => hit.title);

  const title = pickWikipediaTitle(name, hits, kind);
  if (!title) return null;

  let summaryRes: Response;
  try {
    summaryRes = await wikiGet(`/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  } catch {
    return null;
  }
  if (!summaryRes.ok) return null;

  const summary = (await summaryRes.json()) as SummaryResponse;
  if (summary.type === 'disambiguation') return null;

  const extract = summary.extract?.replace(/\s+/g, ' ').trim() ?? '';
  if (extract.length < 40) return null;

  const blurb = peekSummary(extract);
  if (!blurb) return null;

  const sourceUrl = summary.content_urls?.desktop?.page ?? null;
  if (sourceUrl && !sourceUrl.startsWith(`${WIKI_ORIGIN}/`)) return null;

  return {
    name: summary.title?.trim() || name,
    description: summary.description?.trim() || null,
    summary: blurb,
    extract,
    sourceUrl,
  };
}
