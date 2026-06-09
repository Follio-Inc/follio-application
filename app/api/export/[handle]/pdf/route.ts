import { NextRequest, NextResponse } from 'next/server';

import type { PdfLayout } from '@/services/export.service';
import { generateResumePDF } from '@/services/export.service';
import { getProfileByHandle } from '@/services/profile.service';

import { assertResumeExportAccess, contentDispositionAttachment } from '../access';

const VALID_LAYOUTS = new Set<PdfLayout>(['paged', 'continuous']);

/**
 * PDF generation launches a headless Chromium instance, which requires the
 * full Node.js runtime (not the Edge runtime).
 */
export const runtime = 'nodejs';

/**
 * Rendering and converting the resume HTML to PDF can take several seconds,
 * which exceeds the default serverless timeout. Allow up to 60s.
 */
export const maxDuration = 60;

/**
 * GET /api/export/[handle]/pdf?layout=paged|continuous
 * Export profile as a downloadable PDF resume.
 *
 * Query params:
 *  - `layout` – `'paged'` (default) or `'continuous'`.
 *
 * The profile owner may always download their own PDF, regardless of
 * visibility settings. External visitors are subject to the normal
 * PUBLIC + resume-visibility checks.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await params;

    // Parse layout from query string, default to 'paged'
    const layoutParam = request.nextUrl.searchParams.get('layout') ?? 'paged';
    const layout: PdfLayout = VALID_LAYOUTS.has(layoutParam as PdfLayout)
      ? (layoutParam as PdfLayout)
      : 'paged';

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
      },
    });
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
