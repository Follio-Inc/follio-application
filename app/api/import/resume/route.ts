/**
 * Resume Import API
 *
 * Uses OpenAI GPT-4o-mini for intelligent resume parsing.
 * The AI approach provides:
 * - Superior understanding of context and semantic meaning
 * - Handles ANY resume format without regex patterns
 * - Correctly identifies sections regardless of headers used
 * - Extracts structured data from unstructured text
 *
 * Cost: ~$0.15 per 1M input tokens (very affordable for resume parsing)
 */

import {
  importResumeWithAI,
  isAIParserAvailable,
  saveAIResumeToProfile,
} from '@/services/import/resume-ai.service';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    console.log('[Resume Import API] Starting AI-powered import for userId:', userId);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if AI parser is available
    if (!isAIParserAvailable()) {
      console.error('[Resume Import API] OPENAI_API_KEY not configured');
      return NextResponse.json(
        {
          error:
            'AI resume parser is not configured. Please add OPENAI_API_KEY to environment variables.',
        },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const saveToProfile = formData.get('saveToProfile') === 'true';

    console.log('[Resume Import API] File:', file?.name, 'Type:', file?.type, 'Size:', file?.size);
    console.log('[Resume Import API] Save to profile:', saveToProfile);

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    // Validate file type - only PDFs supported
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

    // Parse the resume with AI
    const result = await importResumeWithAI(buffer, userId);

    if (!result.success || !result.data) {
      console.log('[Resume Import API] AI parsing failed:', result.error);
      return NextResponse.json(
        { error: result.error || 'Failed to parse resume' },
        { status: 500 }
      );
    }

    console.log('[Resume Import API] AI parsing successful');
    console.log('[Resume Import API] Confidence:', result.data.meta.confidence);
    console.log('[Resume Import API] Model:', result.data.meta.model);
    console.log('[Resume Import API] Processing time:', result.data.meta.processingTimeMs, 'ms');

    // Optionally save to profile
    if (saveToProfile) {
      const saveResult = await saveAIResumeToProfile(userId, result.data);
      if (!saveResult.success) {
        console.error('[Resume Import API] Failed to save to profile:', saveResult.error);
        // Don't fail the whole request, just note the error
      }
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      confidence: result.data.meta.confidence,
      parseMethod: result.data.meta.parseMethod,
      model: result.data.meta.model,
      processingTimeMs: result.data.meta.processingTimeMs,
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

/**
 * GET endpoint to check if AI parser is available
 */
export async function GET() {
  return NextResponse.json({
    available: isAIParserAvailable(),
    model: 'gpt-4o-mini',
    message: isAIParserAvailable()
      ? 'AI resume parser is ready'
      : 'OPENAI_API_KEY not configured - please add it to environment variables',
  });
}
