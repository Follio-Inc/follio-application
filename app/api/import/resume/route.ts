/**
 * Resume Import API
 *
 * Uses the OpenResume-style parser for robust PDF extraction.
 * Handles partial data gracefully - saves whatever is available.
 */

import {
  importResumeFromPdf,
  saveResumeDataToProfile,
} from '@/services/import/resume-openresume.service';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    console.log('[Resume Import API] Starting for userId:', userId);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const saveToProfile = formData.get('saveToProfile') === 'true';

    console.log('[Resume Import API] File:', file?.name, 'Type:', file?.type, 'Size:', file?.size);
    console.log('[Resume Import API] Save to profile:', saveToProfile);

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    // Validate file type - OpenResume parser only works with PDFs
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are supported. Please upload a PDF resume.' },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    console.log('[Resume Import API] Buffer size:', buffer.length);

    // Parse the resume
    const result = await importResumeFromPdf(buffer, userId);

    if (!result.success || !result.data) {
      console.log('[Resume Import API] Parsing failed:', result.error);
      return NextResponse.json(
        { error: result.error || 'Failed to parse resume' },
        { status: 500 }
      );
    }

    console.log('[Resume Import API] Parsing successful');
    console.log('[Resume Import API] Confidence:', result.data.meta.confidence);

    // Optionally save to profile
    if (saveToProfile) {
      const saveResult = await saveResumeDataToProfile(userId, result.data);
      if (!saveResult.success) {
        console.error('[Resume Import API] Failed to save to profile:', saveResult.error);
        // Don't fail the whole request, just note the error
      }
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      confidence: result.data.meta.confidence,
      message: result.message,
    });
  } catch (error) {
    console.error('[Resume Import API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import resume' },
      { status: 500 }
    );
  }
}
