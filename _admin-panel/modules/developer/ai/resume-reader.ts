/**
 * Developer-tool resume reader.
 *
 * Calls the same Follio product service (`importResumeWithAI`) used by
 * onboarding / builder import. Does not save to a profile.
 */

import fs from 'node:fs';

import { listResumeFixtures, resolveResumePath } from '@/_admin-panel/modules/developer/live-qa';
import {
  importResumeWithAI,
  isAIParserAvailable,
  type NormalizedResumeData,
} from '@/services/import/resume-ai.service';

import type { ResumeReaderCatalog, ResumeReaderRunResult, ResumeReaderSummary } from './types';

/** Match the product resume import limit. */
export const RESUME_READER_MAX_BYTES = 5 * 1024 * 1024;

export function summarizeResumeRead(data: NormalizedResumeData): ResumeReaderSummary {
  const name = [data.profile.firstName, data.profile.middleName, data.profile.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    name: name || null,
    headline: data.profile.headline ?? null,
    email: data.contactInfo?.email ?? null,
    location: data.profile.location ?? null,
    experiences: data.experiences.length,
    educations: data.educations.length,
    skills: data.skills.length,
    projects: data.projects.length,
    links: data.links.length,
    certifications: data.certifications.length,
    confidence: data.meta.confidence,
    model: data.meta.model,
    processingTimeMs: data.meta.processingTimeMs,
  };
}

export function buildResumeReaderCatalog(): ResumeReaderCatalog {
  const fixtures = listResumeFixtures().map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    source: item.source,
  }));

  return {
    fixtures,
    defaults: {
      fixtureId: fixtures[0]?.id ?? null,
      maxBytes: RESUME_READER_MAX_BYTES,
      aiAvailable: isAIParserAvailable(),
      saveToProfile: false,
    },
  };
}

function isPdfFile(name: string, type: string): boolean {
  return type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
}

export async function runResumeReader(input: {
  userId: string;
  file?: { name: string; type: string; size: number; buffer: Buffer };
  fixtureId?: string;
}): Promise<ResumeReaderRunResult> {
  const started = Date.now();
  const aiAvailable = isAIParserAvailable();

  const fail = (error: string, source: ResumeReaderRunResult['source']): ResumeReaderRunResult => ({
    ok: false,
    error,
    durationMs: Date.now() - started,
    source,
    aiAvailable,
    savedToProfile: false,
  });

  if (!aiAvailable) {
    return fail(
      'AI resume parser is not configured. Add OPENAI_API_KEY to environment variables.',
      {
        kind: input.file ? 'upload' : 'fixture',
        label: input.file?.name ?? input.fixtureId ?? 'unknown',
        fixtureId: input.fixtureId,
      }
    );
  }

  let buffer: Buffer;
  let source: ResumeReaderRunResult['source'];

  if (input.file) {
    if (!isPdfFile(input.file.name, input.file.type)) {
      return fail('Only PDF files are supported. Please upload a PDF resume.', {
        kind: 'upload',
        label: input.file.name,
      });
    }
    if (
      input.file.size > RESUME_READER_MAX_BYTES ||
      input.file.buffer.length > RESUME_READER_MAX_BYTES
    ) {
      return fail('File size must be less than 5MB.', {
        kind: 'upload',
        label: input.file.name,
      });
    }
    buffer = input.file.buffer;
    source = { kind: 'upload', label: input.file.name };
  } else if (input.fixtureId) {
    const fixture = listResumeFixtures().find((item) => item.id === input.fixtureId);
    if (!fixture) {
      return fail(`Unknown resume fixture: ${input.fixtureId}`, {
        kind: 'fixture',
        label: input.fixtureId,
        fixtureId: input.fixtureId,
      });
    }
    const path = resolveResumePath(input.fixtureId);
    if (!path || !fs.existsSync(path)) {
      return fail(`Resume fixture file missing: ${input.fixtureId}`, {
        kind: 'fixture',
        label: fixture.label,
        fixtureId: input.fixtureId,
      });
    }
    buffer = fs.readFileSync(path);
    source = {
      kind: 'fixture',
      label: fixture.label,
      fixtureId: input.fixtureId,
    };
  } else {
    return fail('Upload a PDF or choose a fixture.', {
      kind: 'upload',
      label: 'none',
    });
  }

  const result = await importResumeWithAI(buffer, input.userId);
  const durationMs = Date.now() - started;

  if (!result.success || !result.data) {
    return {
      ok: false,
      error: result.error || 'Failed to parse resume',
      durationMs,
      source,
      aiAvailable,
      savedToProfile: false,
    };
  }

  return {
    ok: true,
    message: result.message,
    durationMs,
    source,
    aiAvailable,
    savedToProfile: false,
    summary: summarizeResumeRead(result.data),
    data: result.data,
  };
}
