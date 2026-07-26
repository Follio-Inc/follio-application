import { NextRequest, NextResponse } from 'next/server';

import { parsePdfLayoutQueryParam } from '@/lib/document-design';
import { handleApiError } from '@/lib/errors';
import { generateResumePDF } from '@/services/export.service';
import { getProfileByHandle } from '@/services/profile.service';

import { assertResumeExportAccess, contentDispositionAttachment } from '../access';

/**
 * PDF generation launches a headless Chromium instance, which requires the
 * full Node.js runtime (not the Edge runtime).
 */
export const runtime = 'nodejs';

/** Never cache export responses at the CDN or in Next's data cache. */
export const dynamic = 'force-dynamic';

/**
 * Rendering and converting the resume HTML to PDF can take several seconds,
 * which exceeds the default serverless timeout. Allow up to 60s.
 */
export const maxDuration = 60;

/**
 * GET /api/export/[handle]/pdf?layout=continuous|a4|letter
 * Export profile as a downloadable PDF resume.
 *
 * Query params:
 *  - `layout` – `'continuous'`, `'a4'`, or `'letter'` (default `'letter'`).
 *    Legacy `'paged'` is accepted and treated as `'letter'`.
 *
 * The profile owner may always download their own PDF, regardless of
 * visibility settings. External visitors are subject to the normal
 * PUBLIC + resume-visibility checks.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;

  try {
    const layout = parsePdfLayoutQueryParam(request.nextUrl.searchParams.get('layout'), 'letter');

    const profile = await getProfileByHandle(handle);

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const access = await assertResumeExportAccess(request, handle, profile);
    if (!access.allowed) {
      return access.response;
    }

    const pdfBuffer = await generateResumePDF(profile, { layout });
    const uint8 = new Uint8Array(pdfBuffer);

    return new NextResponse(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDispositionAttachment(`${handle}-resume.pdf`),
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    return handleApiError(error, { path: `/api/export/${handle}/pdf`, method: 'GET' });
  }
}
