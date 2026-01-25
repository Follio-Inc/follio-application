import {
  isAIParserAvailable,
  normalizeResumeDataAI,
  ParsedResumeAI,
  parseResumeHybrid,
} from '@/services/resume-parser-ai.service';
import {
  normalizeResumeData,
  ParsedResume,
  parseResume,
  parseResumeText,
} from '@/services/resume-parser.service';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('\n========================================');
  console.log('[Test Resume API] Request received');
  console.log('[Test Resume API] AI Parser available:', isAIParserAvailable());
  console.log('========================================\n');

  try {
    const contentType = request.headers.get('content-type') || '';
    console.log('[Test Resume API] Content-Type:', contentType);

    // Check if we should use AI parser (query param ?ai=true or if AI is available)
    const url = new URL(request.url);
    const useAI = url.searchParams.get('ai') !== 'false' && isAIParserAvailable();
    console.log('[Test Resume API] Using AI parser:', useAI);

    let parsed: ParsedResume | ParsedResumeAI;
    let rawText: string = '';

    if (contentType.includes('application/json')) {
      // Handle text input
      const body = await request.json();
      console.log('[Test Resume API] Received JSON body, text length:', body.text?.length);

      if (!body.text || typeof body.text !== 'string') {
        return NextResponse.json({ success: false, error: 'No text provided' }, { status: 400 });
      }

      rawText = body.text;

      if (useAI) {
        // Use hybrid parser (AI + fallback)
        const buffer = Buffer.from(body.text, 'utf-8');
        parsed = await parseResumeHybrid(buffer, 'text/plain');
      } else {
        parsed = parseResumeText(body.text);
      }
    } else if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
      }

      console.log('[Test Resume API] File received:');
      console.log('  - Name:', file.name);
      console.log('  - Type:', file.type);
      console.log('  - Size:', file.size, 'bytes');

      // Validate file type
      const allowedTypes = ['application/pdf', 'text/plain'];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid file type: ${file.type}. Only PDF and TXT files are supported.`,
          },
          { status: 400 }
        );
      }

      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log('[Test Resume API] Buffer created, size:', buffer.length);

      // Parse the resume using hybrid parser (AI when available, fallback otherwise)
      if (useAI) {
        parsed = await parseResumeHybrid(buffer, file.type);
      } else {
        parsed = await parseResume(buffer, file.type);
      }
      rawText = parsed.rawText;

      // Debug: Print first 500 chars of raw text to see section headers
      console.log('\n[DEBUG] Raw text sample (first 500 chars):');
      console.log(rawText.substring(0, 500));
    } else {
      return NextResponse.json({ success: false, error: 'Invalid content type' }, { status: 400 });
    }

    const parseMethod = 'parseMethod' in parsed ? parsed.parseMethod : 'rule-based';

    console.log('\n[Test Resume API] Parsing complete!');
    console.log('[Test Resume API] Parse method:', parseMethod);
    console.log('[Test Resume API] Parsed result summary:');
    console.log('  - First Name:', parsed.basics?.firstName);
    console.log('  - Last Name:', parsed.basics?.lastName);
    console.log('  - Email:', parsed.basics?.email);
    console.log('  - Phone:', parsed.basics?.phone);
    console.log('  - Skills:', parsed.skills?.length || 0);
    console.log('  - Work Experiences:', parsed.workExperiences?.length || 0);
    console.log('  - Educations:', parsed.educations?.length || 0);
    console.log('  - Links:', parsed.links?.length || 0);
    console.log('  - Confidence:', parsed.confidence);

    // Normalize the data based on which parser was used
    const normalized =
      parseMethod === 'ai'
        ? normalizeResumeDataAI(parsed as ParsedResumeAI)
        : normalizeResumeData(parsed as ParsedResume);

    console.log('\n[Test Resume API] Normalized result:');
    console.log('  - firstName:', normalized.firstName);
    console.log('  - lastName:', normalized.lastName);
    console.log('  - skills:', normalized.skills?.length || 0);
    console.log('  - workExperiences:', normalized.workExperiences?.length || 0);
    console.log('  - educations:', normalized.educations?.length || 0);

    return NextResponse.json({
      success: true,
      rawText,
      parsed,
      normalized,
    });
  } catch (error) {
    console.error('[Test Resume API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
