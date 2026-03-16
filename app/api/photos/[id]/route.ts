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
 * This endpoint is public (no auth) because profile photos are displayed
 * on public portfolio pages.  The photo ID is an opaque cuid so it cannot
 * be guessed or enumerated.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const photo = await db.profilePhoto.findUnique({
    where: { id },
    select: { url: true, isVisible: true },
  });

  if (!photo?.url || photo.isVisible === false) {
    return new NextResponse(null, { status: 404 });
  }

  // ── Data URL → decode & serve image bytes ────────────────────────
  if (photo.url.startsWith('data:')) {
    const match = photo.url.match(/^data:([^;]+);base64,(.+)$/);
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
        // Photo content is immutable per ID — cache aggressively.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  // ── External URL → redirect ──────────────────────────────────────
  if (photo.url.startsWith('http://') || photo.url.startsWith('https://')) {
    return NextResponse.redirect(photo.url, 307);
  }

  return new NextResponse(null, { status: 404 });
}
