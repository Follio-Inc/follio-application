/**
 * Test Resume Parser API
 *
 * A testing endpoint for the AI resume parser.
 * Supports both PDF file upload and raw text input.
 *
 * Usage:
 * - POST with multipart/form-data and 'file' field for PDF
 * - POST with application/json and 'text' field for raw text
 * - Add ?ai=false to disable AI and use rule-based parser
 */

import { importResumeWithAI, isAIParserAvailable } from '@/services/import/resume-ai.service';
import {
  normalizeResumeData,
  ParsedResume,
  parseResume,
  parseResumeText,
} from '@/services/resume-parser.service';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  // Health check endpoint
  return NextResponse.json({
    available: isAIParserAvailable(),
    model: 'gpt-4o-mini',
    message: isAIParserAvailable()
      ? 'AI resume parser is ready for testing'
      : 'OPENAI_API_KEY not configured - add it to .env.local',
  });
}

export async function POST(request: NextRequest) {
  console.log('\n========================================');
  console.log('[Test Resume API] Request received');
  console.log('[Test Resume API] AI Parser available:', isAIParserAvailable());
  console.log('========================================\n');

  try {
    const contentType = request.headers.get('content-type') || '';
    console.log('[Test Resume API] Content-Type:', contentType);

    // Check if we should use AI parser (query param ?ai=false to disable)
    const url = new URL(request.url);
    const forceRuleBased = url.searchParams.get('ai') === 'false';
    const useAI = !forceRuleBased && isAIParserAvailable();
    console.log('[Test Resume API] Using AI parser:', useAI);

    if (contentType.includes('application/json')) {
      // Handle text input
      const body = await request.json();
      console.log('[Test Resume API] Received JSON body, text length:', body.text?.length);

      if (!body.text || typeof body.text !== 'string') {
        return NextResponse.json({ success: false, error: 'No text provided' }, { status: 400 });
      }

      if (useAI) {
        // Use new AI parser
        const buffer = Buffer.from(body.text, 'utf-8');
        // Note: AI parser expects PDF, but we can still test with text
        // by creating a mock userId
        const result = await importResumeWithAI(buffer, 'test-user');

        // Transform normalized data to the format the UI expects
        const parsed = result.data
          ? {
              basics: {
                firstName: result.data.profile.firstName,
                lastName: result.data.profile.lastName,
                email: result.data.contactInfo?.email,
                phone: result.data.contactInfo?.phone,
                location: result.data.profile.location,
                headline: result.data.profile.headline,
                summary: result.data.profile.summary,
              },
              workExperiences: result.data.experiences.map((exp) => ({
                title: exp.role,
                company: exp.company,
                location: exp.location,
                startDate: exp.startDate,
                endDate: exp.endDate,
                isCurrent: exp.isCurrent,
                description: exp.description,
                bullets: exp.bullets,
              })),
              educations: result.data.educations.map((edu) => ({
                institution: edu.institution,
                degree: edu.degree,
                fieldOfStudy: edu.fieldOfStudy,
                startDate: edu.startDate,
                endDate: edu.endDate,
                gpa: edu.gpa,
              })),
              skills: result.data.skills,
              projects: result.data.projects.map((proj) => ({
                name: proj.name,
                title: proj.name,
                description: proj.description,
                url: proj.url,
                technologies: proj.technologies,
              })),
              certifications: result.data.certifications,
              links: result.data.links,
              confidence: result.data.meta.confidence,
              parseMethod: 'ai' as const,
            }
          : undefined;

        return NextResponse.json({
          success: result.success,
          error: result.error,
          parsed,
          normalized: result.data,
          parseMethod: 'ai',
          model: result.data?.meta.model,
          processingTimeMs: result.data?.meta.processingTimeMs,
          confidence: result.data?.meta.confidence,
        });
      } else {
        // Use rule-based parser
        const parsed = parseResumeText(body.text);
        const normalized = normalizeResumeData(parsed);

        return NextResponse.json({
          success: true,
          rawText: body.text,
          parsed,
          normalized,
          parseMethod: 'rule-based',
        });
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

      if (useAI) {
        // Use new pure AI parser
        const result = await importResumeWithAI(buffer, 'test-user');

        // Transform normalized data to the format the UI expects
        const parsed = result.data
          ? {
              basics: {
                firstName: result.data.profile.firstName,
                lastName: result.data.profile.lastName,
                email: result.data.contactInfo?.email,
                phone: result.data.contactInfo?.phone,
                location: result.data.profile.location,
                headline: result.data.profile.headline,
                summary: result.data.profile.summary,
              },
              workExperiences: result.data.experiences.map((exp) => ({
                title: exp.role,
                company: exp.company,
                location: exp.location,
                startDate: exp.startDate,
                endDate: exp.endDate,
                isCurrent: exp.isCurrent,
                description: exp.description,
                bullets: exp.bullets,
              })),
              educations: result.data.educations.map((edu) => ({
                institution: edu.institution,
                degree: edu.degree,
                fieldOfStudy: edu.fieldOfStudy,
                startDate: edu.startDate,
                endDate: edu.endDate,
                gpa: edu.gpa,
              })),
              skills: result.data.skills,
              projects: result.data.projects.map((proj) => ({
                name: proj.name,
                title: proj.name,
                description: proj.description,
                url: proj.url,
                technologies: proj.technologies,
              })),
              certifications: result.data.certifications,
              links: result.data.links,
              confidence: result.data.meta.confidence,
              parseMethod: 'ai' as const,
            }
          : undefined;

        return NextResponse.json({
          success: result.success,
          error: result.error,
          parsed,
          normalized: result.data,
          parseMethod: 'ai',
          model: result.data?.meta.model,
          processingTimeMs: result.data?.meta.processingTimeMs,
          confidence: result.data?.meta.confidence,
          message: result.message,
        });
      } else {
        // Use rule-based parser
        const parsed = await parseResume(buffer, file.type);
        const normalized = normalizeResumeData(parsed as ParsedResume);

        return NextResponse.json({
          success: true,
          rawText: parsed.rawText,
          parsed,
          normalized,
          parseMethod: 'rule-based',
        });
      }
    } else {
      return NextResponse.json({ success: false, error: 'Invalid content type' }, { status: 400 });
    }
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
