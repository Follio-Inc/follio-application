import { NextRequest, NextResponse } from 'next/server';

import { getProfileByHandle } from '@/services/profile.service';
import { toPDFHtml } from '@/services/export.service';

/**
 * GET /api/export/[handle]/pdf
 * Export profile as PDF
 * 
 * TODO: Implement proper PDF generation using Puppeteer/Playwright
 * For serverless (Vercel), consider:
 * - Using @vercel/functions with extended timeout
 * - External PDF generation service (e.g., Browserless, ApiFlash)
 * - Pre-generating PDFs and storing in blob storage
 * 
 * Current implementation returns print-friendly HTML that can be
 * printed to PDF using browser's print function.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await params;
    const profile = await getProfileByHandle(handle);

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.status !== 'PUBLIC') {
      return NextResponse.json({ error: 'Profile is not public' }, { status: 403 });
    }

    const html = toPDFHtml(profile);

    // Return HTML with instructions to print to PDF
    // In production, this would be converted to PDF using Puppeteer
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // TODO: Change to application/pdf when PDF generation is implemented
        // 'Content-Disposition': `attachment; filename="${handle}-resume.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
