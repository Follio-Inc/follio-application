import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { parseResume, normalizeResumeData } from '@/services/resume-parser.service';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const text = formData.get('text') as string | null;

    if (!file && !text) {
      return NextResponse.json(
        { error: 'Either file or text is required' },
        { status: 400 }
      );
    }

    let parsed;

    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'text/plain'];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { error: 'Only PDF and plain text files are supported' },
          { status: 400 }
        );
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'File size must be less than 5MB' },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      parsed = await parseResume(buffer, file.type);
    } else if (text) {
      parsed = await parseResume(text, 'text/plain');
    }

    if (!parsed) {
      return NextResponse.json(
        { error: 'Failed to parse resume' },
        { status: 500 }
      );
    }

    const normalized = normalizeResumeData(parsed);

    return NextResponse.json({
      success: true,
      data: normalized,
      confidence: parsed.confidence,
      message: `Resume parsed with ${Math.round(parsed.confidence * 100)}% confidence`,
    });
  } catch (error) {
    console.error('Resume import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import resume' },
      { status: 500 }
    );
  }
}
