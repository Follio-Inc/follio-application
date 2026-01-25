/**
 * Test API endpoint for OpenResume-style parser
 * Uses the ported OpenResume parser for feature-scoring based extraction
 */

import { ParsedResume, parseResumeFromPdfBuffer, parseResumeWithDebug } from '@/lib/resume-parser';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('\n========================================');
  console.log('[OpenResume Parser API] Request received');
  console.log('========================================\n');

  try {
    const contentType = request.headers.get('content-type') || '';
    console.log('[OpenResume Parser API] Content-Type:', contentType);

    // Check if debug mode is enabled
    const url = new URL(request.url);
    const debugMode = url.searchParams.get('debug') === 'true';

    let parsed: ParsedResume;
    let debugInfo: unknown = null;

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
      }

      console.log('[OpenResume Parser API] File received:');
      console.log('  - Name:', file.name);
      console.log('  - Type:', file.type);
      console.log('  - Size:', file.size, 'bytes');

      // Validate file type - OpenResume parser only works with PDFs
      if (file.type !== 'application/pdf') {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid file type: ${file.type}. OpenResume parser only supports PDF files.`,
          },
          { status: 400 }
        );
      }

      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log('[OpenResume Parser API] Buffer created, size:', buffer.length);

      // Parse using OpenResume parser
      if (debugMode) {
        const result = await parseResumeWithDebug(buffer);
        parsed = result.parsed;
        debugInfo = {
          textItemCount: result.debug.textItems.length,
          lineCount: result.debug.lines.length,
          sections: Object.keys(result.debug.sections),
          rawResume: result.debug.rawResume,
        };
      } else {
        parsed = await parseResumeFromPdfBuffer(buffer);
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid content type. Use multipart/form-data with a PDF file.' },
        { status: 400 }
      );
    }

    console.log('\n[OpenResume Parser API] Parsing complete!');
    console.log('[OpenResume Parser API] Results:');
    console.log('  - Name:', `${parsed.firstName} ${parsed.lastName}`);
    console.log('  - Email:', parsed.email);
    console.log('  - Phone:', parsed.phone);
    console.log('  - Location:', parsed.location);
    console.log('  - Skills:', parsed.skills.length);
    console.log('  - Work Experiences:', parsed.workExperiences.length);
    console.log('  - Educations:', parsed.educations.length);
    console.log('  - Projects:', parsed.projects.length);
    console.log('  - Links:', parsed.links.length);
    console.log('  - Confidence:', parsed.confidence);

    // Format response similar to the existing test API
    const response: {
      success: boolean;
      parsed: ParsedResume;
      normalized: {
        firstName: string;
        lastName: string;
        headline: string;
        email: string;
        phone: string;
        location: string;
        summary: string;
        skills: string[];
        workExperiences: typeof parsed.workExperiences;
        educations: typeof parsed.educations;
        projects: typeof parsed.projects;
        links: string[];
      };
      debug?: unknown;
    } = {
      success: true,
      parsed,
      normalized: {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        headline: parsed.headline,
        email: parsed.email,
        phone: parsed.phone,
        location: parsed.location,
        summary: parsed.summary,
        skills: parsed.skills,
        workExperiences: parsed.workExperiences,
        educations: parsed.educations,
        projects: parsed.projects,
        links: parsed.links,
      },
    };

    if (debugMode && debugInfo) {
      response.debug = debugInfo;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[OpenResume Parser API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
