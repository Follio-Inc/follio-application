import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/photos/[id]
 *
 * Serves a profile photo by its database ID. Two modes:
 *
 * 1. **Stored data URL** – The photo was uploaded as base64 and stored in
 *    `ProfilePhoto.url`.  We decode it and return raw image bytes with the
 *    correct `Content-Type` and aggressive caching headers.
 *
 * 2. **External URL** – The photo URL is an HTTP(S) link (e.g. from GitHub
 *    or LinkedIn).  We 307-redirect to the origin so the browser fetches
 *    it directly.
 *
 * Query params:
 *   `?original=true` — serve the unmodified original (`originalUrl`) instead
 *   of the processed `url`. Falls back to `url` if no original is stored.
 *
 * This endpoint is public (no auth) because profile photos are displayed
 * on public portfolio pages.  The photo ID is an opaque cuid so it cannot
 * be guessed or enumerated.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const serveOriginal = request.nextUrl.searchParams.get('original') === 'true';

  const photo = await db.profilePhoto.findUnique({
    where: { id },
  });

  if (!photo?.url || photo.isVisible === false) {
    return new NextResponse(null, { status: 404 });
  }

  // Choose which URL to serve: original (for the editor) or processed (for display).
  // The `originalUrl` field exists in the generated Prisma client; the cast is
  // only needed because the TS server may be using stale cached types.
  const { originalUrl } = photo as typeof photo & { originalUrl?: string | null };
  const targetUrl = serveOriginal ? (originalUrl ?? photo.url) : photo.url;

  // ── Data URL → decode & serve image bytes ────────────────────────
  if (targetUrl.startsWith('data:')) {
    const match = targetUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return new NextResponse(null, { status: 500 });
    }

    const contentType = match[1];
    const imageBuffer = Buffer.from(match[2], 'base64');

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(imageBuffer.length),
        // When serving the original for editing, use short cache.
        // Processed images are immutable per URL (cache-busted on update).
        'Cache-Control': serveOriginal
          ? 'private, no-cache'
          : 'public, max-age=31536000, immutable',
      },
    });
  }

  // ── External URL → redirect ──────────────────────────────────────
  if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
    return NextResponse.redirect(targetUrl, 307);
  }

  return new NextResponse(null, { status: 404 });
}
