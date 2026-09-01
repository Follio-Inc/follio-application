import sharp from 'sharp';

import { logger } from '@/lib/logger';

import { activeProviders } from './providers';

/**
 * Fetch and normalize a brand logo.
 *
 * Every logo is re-rendered to the same square PNG so a wordmark, a favicon,
 * and a square app icon all sit identically on the page. Sources below a
 * minimum resolution are rejected — a blurry upscaled favicon looks broken,
 * while a clean monogram looks deliberate.
 */

const brandLogger = logger.child({ source: 'brand-logo' });

const OUTPUT_PX = 128;
/**
 * Below this the source is a 16px browser favicon, which renders visibly mushy
 * even in a small tile. Sized against the ~36px tile at 2x device pixels.
 */
const MIN_SOURCE_PX = 32;
const MAX_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 4000;

export type BrandLogo = {
  body: Buffer;
  domain: string;
  providerId: string;
};

async function download(url: string): Promise<Buffer | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'follow',
      headers: { Accept: 'image/*' },
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;
  if (!response.headers.get('content-type')?.startsWith('image/')) return null;

  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.length > 0 && buffer.length <= MAX_BYTES ? buffer : null;
}

/** Square PNG on a transparent background, letterboxed rather than cropped. */
async function normalize(source: Buffer): Promise<Buffer | null> {
  try {
    const image = sharp(source, { animated: false });
    const { width, height } = await image.metadata();
    if (!width || !height) return null;
    if (Math.max(width, height) < MIN_SOURCE_PX) return null;

    return await image
      .resize(OUTPUT_PX, OUTPUT_PX, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Try each domain against each provider and return the first real logo.
 * Domains are ordered best-guess-first by the resolver.
 */
export async function fetchBrandLogo(domains: string[]): Promise<BrandLogo | null> {
  const providers = activeProviders();

  for (const domain of domains) {
    for (const provider of providers) {
      const url = provider.url(domain);
      if (!url) continue;

      const source = await download(url);
      if (!source) continue;

      const body = await normalize(source);
      if (!body) continue;

      brandLogger.debug('Resolved brand logo', { domain, providerId: provider.id });
      return { body, domain, providerId: provider.id };
    }
  }

  return null;
}
