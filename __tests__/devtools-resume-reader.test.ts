import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportResult, NormalizedResumeData } from '@/services/import/resume-ai.service';

const importResumeWithAI = vi.fn();
const isAIParserAvailable = vi.fn(() => true);

vi.mock('@/services/import/resume-ai.service', () => ({
  importResumeWithAI: (...args: unknown[]) => importResumeWithAI(...args),
  isAIParserAvailable: () => isAIParserAvailable(),
}));

import {
  RESUME_READER_MAX_BYTES,
  buildResumeReaderCatalog,
  runResumeReader,
  summarizeResumeRead,
} from '@/_admin-panel/modules/developer/ai';
import { getQuickLinks } from '@/_admin-panel/modules/developer/links';
import { getSmokeItems } from '@/_admin-panel/modules/developer/smoke';

function sampleData(overrides: Partial<NormalizedResumeData> = {}): NormalizedResumeData {
  return {
    profile: {
      firstName: 'Alex',
      lastName: 'Morgan',
      headline: 'Product Engineer',
      location: 'Austin, TX',
    },
    contactInfo: { email: 'alex@example.com' },
    experiences: [{ company: 'Acme', role: 'Engineer', bullets: ['Shipped X'] }],
    educations: [{ institution: 'UT Austin', degree: 'BS' }],
    projects: [{ name: 'Follio' }],
    skills: ['TypeScript', 'React'],
    links: [{ type: 'github', url: 'https://github.com/alex' }],
    certifications: [],
    meta: {
      confidence: 0.86,
      parseMethod: 'ai',
      model: 'gpt-4o-mini',
      importedAt: new Date('2026-01-01T00:00:00.000Z'),
      processingTimeMs: 1200,
    },
    ...overrides,
  };
}

describe('developer resume reader', () => {
  beforeEach(() => {
    importResumeWithAI.mockReset();
    isAIParserAvailable.mockReset();
    isAIParserAvailable.mockReturnValue(true);
  });

  it('summarizes normalized resume data', () => {
    const summary = summarizeResumeRead(sampleData());
    expect(summary.name).toBe('Alex Morgan');
    expect(summary.email).toBe('alex@example.com');
    expect(summary.experiences).toBe(1);
    expect(summary.skills).toBe(2);
    expect(summary.confidence).toBe(0.86);
    expect(summary.model).toBe('gpt-4o-mini');
  });

  it('lists live-qa resume fixtures and never saves to profile', () => {
    const catalog = buildResumeReaderCatalog();
    expect(catalog.fixtures.some((item) => item.id === 'alex-morgan')).toBe(true);
    expect(catalog.defaults.fixtureId).toBe('alex-morgan');
    expect(catalog.defaults.maxBytes).toBe(RESUME_READER_MAX_BYTES);
    expect(catalog.defaults.saveToProfile).toBe(false);
    expect(catalog.defaults.aiAvailable).toBe(true);
  });

  it('rejects unknown fixtures without calling the product parser', async () => {
    const result = await runResumeReader({ userId: 'admin-1', fixtureId: 'not-a-fixture' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown resume fixture/i);
    expect(result.savedToProfile).toBe(false);
    expect(importResumeWithAI).not.toHaveBeenCalled();
  });

  it('rejects non-PDF uploads without calling the product parser', async () => {
    const result = await runResumeReader({
      userId: 'admin-1',
      file: {
        name: 'notes.txt',
        type: 'text/plain',
        size: 12,
        buffer: Buffer.from('hello world'),
      },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/pdf/i);
    expect(importResumeWithAI).not.toHaveBeenCalled();
  });

  it('rejects oversized PDFs without calling the product parser', async () => {
    const result = await runResumeReader({
      userId: 'admin-1',
      file: {
        name: 'huge.pdf',
        type: 'application/pdf',
        size: RESUME_READER_MAX_BYTES + 1,
        buffer: Buffer.alloc(16),
      },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/5mb/i);
    expect(importResumeWithAI).not.toHaveBeenCalled();
  });

  it('calls importResumeWithAI for a fixture and does not save the profile', async () => {
    const data = sampleData();
    importResumeWithAI.mockResolvedValue({
      success: true,
      data,
      message: 'ok',
    } satisfies ImportResult);

    const result = await runResumeReader({ userId: 'admin-1', fixtureId: 'alex-morgan' });

    expect(result.ok).toBe(true);
    expect(result.savedToProfile).toBe(false);
    expect(result.summary?.name).toBe('Alex Morgan');
    expect(result.source).toEqual({
      kind: 'fixture',
      label: 'Alex Morgan',
      fixtureId: 'alex-morgan',
    });
    expect(importResumeWithAI).toHaveBeenCalledTimes(1);
    const [buffer, userId] = importResumeWithAI.mock.calls[0] as [Buffer, string];
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
    expect(userId).toBe('admin-1');
  });

  it('wires smoke + quick link to the resume reader tab', () => {
    const smoke = getSmokeItems().find((item) => item.id === 'ai-resume-reader');
    const link = getQuickLinks().find((item) => item.id === 'developer-resume-reader');
    expect(smoke?.href).toBe('/admin/developer?tab=resume-reader');
    expect(link?.href).toBe('/admin/developer?tab=resume-reader');
  });
});
