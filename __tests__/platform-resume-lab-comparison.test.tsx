/**
 * Resume lab: run comparison, AI vs openresume (PLATFORM_TODO item 23).
 *
 * The item has no `_Done when_` clause, so its title plus its Note are the
 * requirement:
 *
 * > `resume-openresume.service.ts` is currently dead code with no importers.
 * > The lab becomes its first consumer, so treat it as an untested baseline
 * > and say so in the UI.
 *
 * Two things make this comparison honest rather than decorative, and both
 * are what this file mostly tests: both parsers get the identical bytes, and
 * neither of them writes anything. The third is that the openresume side is
 * really the openresume parser — not the AI result wearing a different hat.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_TYPE,
  MAX_UPLOAD_BYTES,
  SECTIONS,
  buildComparison,
  buildComparisonWarnings,
  listResumeLabFixtures,
  normalizeKey,
  runResumeLab,
} from '@/_admin-panel/platform/labs/resume-import-ai';
// Imported from their own modules, not the barrel: these reach the
// OpenResume parser, which the barrel deliberately keeps out of the lab's
// shared entry point. A test that imported them from there would quietly
// undo the containment it is meant to protect.
import {
  EXECUTION_NOTE,
  runResumeComparison,
} from '@/_admin-panel/platform/labs/resume-import-ai/compare-runner';
import {
  OPENRESUME_IMPLEMENTATION,
  runOpenResume,
} from '@/_admin-panel/platform/labs/resume-import-ai/openresume';
import type {
  ParserRun,
  ResumeComparisonOptions,
  ResumeComparisonResult,
} from '@/_admin-panel/platform/labs/resume-import-ai';
import { ResumeLab } from '@/_admin-panel/platform/ui';

const COMPARE_RUNNER = '_admin-panel/platform/labs/resume-import-ai/compare-runner.ts';
const COMPARISON = '_admin-panel/platform/labs/resume-import-ai/comparison.ts';
const OPENRESUME = '_admin-panel/platform/labs/resume-import-ai/openresume.ts';
const COMPONENT = '_admin-panel/platform/ui/resume-lab.tsx';
const COMPARE_ROUTE = 'app/api/admin/platform/labs/resume-import-ai/compare/route.ts';
const OPENRESUME_SERVICE = 'services/import/resume-openresume.service.ts';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

/** Comments stripped: these files name in prose what they refuse to call. */
function executableOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Comments *and* string literals stripped.
 *
 * Needed where the operator-facing copy says the same words the code must
 * not contain — the openresume note explains that the AI side omits
 * `saveToProfile`, and the projection note says it does no fuzzy matching.
 * Searching the raw text would find the explanation and pass for the wrong
 * reason, so these checks run against the executable text alone.
 */
function codeOf(source: string): string {
  return executableOf(source)
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;|&#8217;/g, '’')
    .replace(/\s+/g, ' ');
}

function pdfBytes(body = 'x'.repeat(400)): Buffer {
  return Buffer.from(`%PDF-1.7\n${body}`, 'utf8');
}

const EXTRACTED = `Alex Morgan — Engineer. ${'Experience and skills. '.repeat(40)}`;

/** What the AI pipeline returns, in the shipped normalized shape. */
const AI_DATA = {
  profile: {
    firstName: 'Alex',
    lastName: 'Morgan',
    headline: 'Full-Stack Software Engineer',
    summary: 'Builds things.',
    location: 'San Francisco, CA',
  },
  contactInfo: { email: 'alex@example.test', phone: '(555) 123-4567' },
  experiences: [
    { company: 'CloudScale', role: 'Senior Engineer', bullets: ['a', 'b'] },
    { company: 'AgileStream', role: 'Engineer', bullets: ['c'] },
  ],
  educations: [{ institution: 'University of Washington', degree: 'MSc' }],
  projects: [{ name: 'Follio', technologies: ['TypeScript'] }],
  skills: ['TypeScript', 'React', 'SQL'],
  skillGroups: [{ name: 'Languages', skills: ['TypeScript'] }],
  links: [{ type: 'github', url: 'https://github.com/alexm-dev' }],
  certifications: [{ name: 'AWS SAA' }],
  meta: { confidence: 0.99, parseMethod: 'ai', model: 'gpt-4o-mini', processingTimeMs: 10 },
};

/** What openresume returns: same shape, visibly worse content. */
const OPENRESUME_DATA = {
  profile: { firstName: 'Alex', lastName: 'Morgan', location: 'Stack Engineer San Francisco, CA' },
  contactInfo: { email: 'ALEX@example.test' },
  // Same company, same role, different casing and spacing: must overlap.
  experiences: [{ company: 'CloudScale  ', role: 'senior engineer', bullets: ['a'] }],
  educations: [
    { institution: 'University of Washington', degree: 'MSc' },
    { institution: 'University of Illinois', degree: 'BSc' },
  ],
  projects: [],
  skills: [],
  skillGroups: [],
  // Same URL with a trailing slash: must overlap.
  links: [{ type: 'github', url: 'https://github.com/alexm-dev/' }],
  certifications: [],
  meta: { confidence: 0.74, parseMethod: 'open-resume' },
};

function agentResult() {
  return {
    output: { data: AI_DATA, saved: false },
    run: {
      id: 'run-1',
      agentId: 'resume-parse',
      version: 'agent-v2',
      status: 'succeeded',
      stepMetas: [
        { stepId: 'parse-resume-ai', kind: 'llm', durationMs: 900, timestamp: 'now' },
        { stepId: 'optional-save', kind: 'workflow', durationMs: 0, timestamp: 'now' },
      ],
      totalTokensUsed: { input: 0, output: 0 },
      startedAt: 'now',
    },
  };
}

function options(overrides: Partial<ResumeComparisonOptions> = {}): ResumeComparisonOptions {
  return {
    canRun: true,
    aiAvailable: true,
    userId: 'admin_test',
    readPages: async () => ({ pages: 2, via: 'test' }),
    extractText: async () => EXTRACTED,
    runAgent: async () => agentResult(),
    observeUsage: {
      calls: [
        {
          stage: 'resumeParse',
          model: 'gpt-4o-mini',
          inputTokens: 1800,
          outputTokens: 900,
          durationMs: 19000,
        },
      ],
      observe: async (body) => body(),
    },
    openResume: {
      parse: async () => ({ raw: true }),
      normalize: async () => OPENRESUME_DATA,
    },
    ...overrides,
  };
}

async function compare(
  overrides: Partial<ResumeComparisonOptions> = {}
): Promise<ResumeComparisonResult> {
  return runResumeComparison(
    { source: 'upload', bytes: pdfBytes(), filename: 'cv.pdf', declaredType: ACCEPTED_TYPE },
    options(overrides)
  );
}

describe('the two implementations, and why those boundaries', () => {
  it('uses the openresume service’s pure half, never its writing wrapper', () => {
    const source = executableOf(read(OPENRESUME));

    expect(source).toContain("await import('@/lib/resume-parser')");
    expect(source).toContain('parseResumeFromPdfBuffer(bytes)');
    expect(source).toContain("await import('@/services/import/resume-openresume.service')");
    expect(source).toContain('normalizeResumeData(parsed)');

    // The wrapper that looks like the entry point writes a RawImportPayload
    // row, so nothing in the lab may call it.
    for (const file of [OPENRESUME, COMPARE_RUNNER, COMPARISON, COMPARE_ROUTE, COMPONENT]) {
      expect(executableOf(read(file)), `${file} must not import the writing wrapper`).not.toMatch(
        /importResumeFromPdf|saveResumeDataToProfile/
      );
    }
  });

  it('is right about that wrapper writing', () => {
    // The claim above is only worth making because it is checked against the
    // shipped module rather than remembered.
    const service = read(OPENRESUME_SERVICE);
    const wrapper = service.slice(
      service.indexOf('export async function importResumeFromPdf'),
      service.indexOf('export async function saveResumeDataToProfile')
    );

    expect(wrapper).toContain('await db.rawImportPayload.create(');
    // While the normalizer the lab does call touches no database at all.
    const normalizer = service.slice(
      service.indexOf('export function normalizeResumeData'),
      service.indexOf('// MAIN IMPORT FUNCTION')
    );
    expect(normalizer.length).toBeGreaterThan(500);
    expect(normalizer).not.toMatch(/\bdb\./);
  });

  it('keeps the AI side on the shipped import path', async () => {
    const result = await compare();

    expect(result.ai!.implementation).toContain('extractTextFromPDF');
    expect(result.ai!.implementation).toContain('runResumeParseAgent');
    expect(result.openResume!.implementation).toBe(OPENRESUME_IMPLEMENTATION);
  });

  it('does not synthesize the openresume side from the AI result', async () => {
    let normalizeSawAiData = false;
    const result = await compare({
      openResume: {
        parse: async () => ({ raw: true }),
        normalize: async (parsed) => {
          normalizeSawAiData = JSON.stringify(parsed).includes('Full-Stack Software Engineer');
          return OPENRESUME_DATA;
        },
      },
    });

    expect(normalizeSawAiData).toBe(false);
    // And the two outputs really are different objects.
    expect(result.openResume!.json).not.toBe(result.ai!.json);
    expect(JSON.parse(result.openResume!.json!).meta.parseMethod).toBe('open-resume');

    // Structurally: the openresume call takes the source bytes, and it
    // completes before the AI call starts, so no AI output can reach it.
    const runner = executableOf(read(COMPARE_RUNNER));
    const openResumeCall = runner.indexOf('await runOpenResume(bytes');
    const aiCall = runner.indexOf('await (options.runAi ?? runResumeLab)');
    expect(openResumeCall).toBeGreaterThan(-1);
    expect(aiCall).toBeGreaterThan(-1);
    expect(openResumeCall).toBeLessThan(aiCall);
  });
});

describe('the same document, once', () => {
  it('resolves the input once and gives both parsers the identical buffer', async () => {
    const seen: Buffer[] = [];
    const result = await compare({
      extractText: async (bytes) => {
        seen.push(bytes);
        return EXTRACTED;
      },
      openResume: {
        parse: async (bytes) => {
          seen.push(bytes);
          return { raw: true };
        },
        normalize: async () => OPENRESUME_DATA,
      },
    });

    expect(seen).toHaveLength(2);
    expect(seen[0].equals(seen[1])).toBe(true);
    expect(seen[0].equals(pdfBytes())).toBe(true);
    // And the hash in the result is of that buffer, so the claim is checkable.
    const { createHash } = await import('node:crypto');
    expect(result.comparison!.summary.sourceSha256).toBe(
      createHash('sha256').update(pdfBytes()).digest('hex')
    );
    expect(result.comparison!.summary.sourceBytes).toBe(pdfBytes().length);
  });

  it('hands the AI side the bytes it already resolved, rather than letting it re-read', async () => {
    // Equal contents are not the same guarantee as one read: a fixture read
    // twice would also compare equal. This checks the AI side is given the
    // very buffer openresume received, which is what makes the two runs
    // provably the same document rather than probably.
    let openResumeBytes: Buffer | null = null;
    let aiResolved: { bytes: Buffer; label: string } | undefined;

    await runResumeComparison(
      { source: 'fixture', fixtureId: listResumeLabFixtures()[0].id },
      options({
        openResume: {
          parse: async (bytes) => {
            openResumeBytes = bytes;
            return { raw: true };
          },
          normalize: async () => OPENRESUME_DATA,
        },
        runAi: async (_input, runOptions) => {
          aiResolved = runOptions.resolvedInput;
          return runResumeLab(_input, runOptions);
        },
      })
    );

    expect(aiResolved).toBeDefined();
    expect(openResumeBytes).not.toBeNull();
    // The same object, not merely an equal one.
    expect(aiResolved!.bytes).toBe(openResumeBytes);
  });

  it('reads a fixture once rather than twice', async () => {
    const fixture = listResumeLabFixtures()[0];
    const seen: Buffer[] = [];

    const result = await runResumeComparison(
      { source: 'fixture', fixtureId: fixture.id },
      options({
        extractText: async (bytes) => {
          seen.push(bytes);
          return EXTRACTED;
        },
        openResume: {
          parse: async (bytes) => {
            seen.push(bytes);
            return { raw: true };
          },
          normalize: async () => OPENRESUME_DATA,
        },
      })
    );

    expect(seen).toHaveLength(2);
    expect(seen[0].equals(seen[1])).toBe(true);
    expect(result.comparison!.summary.sourceBytes).toBe(fixture.bytes);
  });

  it('applies the product route’s input rules before either parser runs', async () => {
    let touched = false;
    const spy = { parse: async () => ((touched = true), { raw: true }) };

    const tooBig = await runResumeComparison(
      { source: 'upload', bytes: Buffer.alloc(MAX_UPLOAD_BYTES + 1), filename: 'cv.pdf' },
      options({ openResume: spy })
    );
    expect(tooBig.outcome).toBe('too-large');

    const notPdf = await runResumeComparison(
      { source: 'upload', bytes: Buffer.from('not a pdf'), filename: 'cv.pdf' },
      options({ openResume: spy })
    );
    expect(notPdf.outcome).toBe('not-a-pdf');

    expect(touched).toBe(false);
  });
});

describe('two runs, sequential, once each', () => {
  it('calls each parser exactly once and makes no extra model call', async () => {
    let aiCalls = 0;
    let extractCalls = 0;
    let openResumeCalls = 0;

    await compare({
      extractText: async () => {
        extractCalls += 1;
        return EXTRACTED;
      },
      runAgent: async () => {
        aiCalls += 1;
        return agentResult();
      },
      openResume: {
        parse: async () => {
          openResumeCalls += 1;
          return { raw: true };
        },
        normalize: async () => OPENRESUME_DATA,
      },
    });

    expect(aiCalls).toBe(1);
    expect(extractCalls).toBe(1);
    expect(openResumeCalls).toBe(1);
  });

  it('runs them one after the other, openresume first', async () => {
    const order: string[] = [];

    await compare({
      extractText: async () => {
        order.push('ai:start');
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push('ai:end');
        return EXTRACTED;
      },
      openResume: {
        parse: async () => {
          order.push('or:start');
          await new Promise((resolve) => setTimeout(resolve, 5));
          order.push('or:end');
          return { raw: true };
        },
        normalize: async () => OPENRESUME_DATA,
      },
    });

    // No interleaving: the openresume call closes before the AI call opens.
    expect(order).toEqual(['or:start', 'or:end', 'ai:start', 'ai:end']);
    // And the reason is recorded with the result, not just in a comment.
    expect(EXECUTION_NOTE).toContain('sequential');
    expect(EXECUTION_NOTE).toContain('telemetry');
  });

  it('times each side independently', async () => {
    const result = await compare({
      openResume: {
        parse: async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          return { raw: true };
        },
        normalize: async () => OPENRESUME_DATA,
      },
    });

    expect(result.openResume!.durationMs).toBeGreaterThanOrEqual(35);
    expect(result.ai!.durationMs).toBeLessThan(result.openResume!.durationMs);
    // The whole comparison covers both, so it is at least the slower one.
    expect(result.comparison!.summary.totalMs).toBeGreaterThanOrEqual(
      result.openResume!.durationMs
    );
  });

  it('opens no provider client of its own', () => {
    for (const file of [COMPARE_RUNNER, COMPARISON, OPENRESUME]) {
      expect(executableOf(read(file)), `${file} must not call a provider`).not.toMatch(
        /from 'openai'|new OpenAI|executeAICall\(|executeChatCompletion\(/
      );
    }
  });
});

describe('neither side writes', () => {
  it('keeps the AI side’s item-21 guarantee', () => {
    for (const file of [COMPARE_RUNNER, COMPARISON, OPENRESUME, COMPARE_ROUTE]) {
      const source = codeOf(read(file));
      expect(source, `${file} must not reach the save path`).not.toContain('saveAIResumeToProfile');
      expect(source, `${file} must not pass saveToProfile`).not.toMatch(/saveToProfile/);
    }
  });

  it('touches no Prisma model from any comparison file', () => {
    for (const file of [COMPARE_RUNNER, COMPARISON, OPENRESUME, COMPARE_ROUTE, COMPONENT]) {
      const source = executableOf(read(file));
      expect(source, `${file} must not reach Prisma`).not.toMatch(/@\/lib\/db|\bdb\.|prisma\./i);
      expect(source, `${file} must not write`).not.toMatch(
        /writeFileSync|appendFileSync|mkdirSync|renameSync/
      );
    }
  });

  it('leaves no temporary file behind, because the parser needs none', () => {
    // `readPdfFromBuffer` pipes the PDF to a child process over stdin and
    // reads JSON back from stdout. Nothing is written to disk, so there is
    // nothing to clean up — asserted against the shipped reader.
    const reader = read('lib/resume-parser/read-pdf.ts');
    expect(reader).toContain('child.stdin.write(buffer)');
    expect(reader).not.toMatch(/writeFileSync|tmpdir\(|mkdtemp/);
  });
});

describe('failure independence', () => {
  it('reports both successes', async () => {
    const result = await compare();

    expect(result.ai!.outcome).toBe('parsed');
    expect(result.openResume!.outcome).toBe('parsed');
    expect(result.comparison).not.toBeNull();
    expect(result.comparison!.summary.bothSucceeded).toBe(true);
  });

  it('keeps the openresume result when the AI side fails', async () => {
    const result = await compare({
      runAgent: async () => {
        throw new Error('model refused');
      },
    });

    expect(result.ai!.outcome).toBe('failed');
    expect(result.ai!.error).toContain('model refused');
    // The other side survives in full.
    expect(result.openResume!.outcome).toBe('parsed');
    expect(result.openResume!.entities!.total).toBeGreaterThan(0);
    // Nothing to project, and the request is not an infrastructure failure.
    // Null rather than a comparison of the survivor against itself, which
    // would report a perfect match that never happened.
    expect(result.outcome).toBe('compared');
    expect(result.comparison).toBeNull();
    expect(result.warnings.map((w) => w.code)).toContain('ai-failed-openresume-succeeded');
  });

  it('keeps the AI result when openresume fails', async () => {
    const result = await compare({
      openResume: {
        parse: async () => {
          throw new Error('Failed to spawn PDF parser');
        },
        normalize: async () => OPENRESUME_DATA,
      },
    });

    expect(result.openResume!.outcome).toBe('failed');
    expect(result.openResume!.error).toContain('Failed to spawn');
    expect(result.ai!.outcome).toBe('parsed');
    expect(result.ai!.entities!.total).toBeGreaterThan(0);
    // Item 22's telemetry survives on the side that ran.
    expect(result.ai!.ai!.usage.status).toBe('observed');
    expect(result.outcome).toBe('compared');
    expect(result.comparison).toBeNull();
    expect(result.warnings.map((w) => w.code)).toContain('openresume-failed-ai-succeeded');
  });

  it('reports both failures without pretending the request broke', async () => {
    const result = await compare({
      runAgent: async () => {
        throw new Error('model refused');
      },
      openResume: {
        parse: async () => {
          throw new Error('unreadable pdf');
        },
        normalize: async () => OPENRESUME_DATA,
      },
    });

    expect(result.outcome).toBe('compared');
    expect(result.ai!.outcome).toBe('failed');
    expect(result.openResume!.outcome).toBe('failed');
    expect(result.comparison).toBeNull();
    expect(result.warnings.map((w) => w.code)).toContain('both-parsers-failed');
  });
});

describe('AI diagnostics survive, openresume gets none invented', () => {
  it('carries item 22’s telemetry through unchanged', async () => {
    const ai = (await compare()).ai!;

    expect(ai.ai!.usage.status).toBe('observed');
    expect(ai.ai!.usage.totalTokens).toBe(2700);
    expect(ai.ai!.cost.status).toBe('available');
    expect(ai.ai!.cost.totalUsd).toBeGreaterThan(0);
    // Including the standing finding about the AgentRun row.
    expect(ai.ai!.usage.agentRunRecorded).toEqual({ input: 0, output: 0 });
    // And item 21's stages.
    expect(ai.stages.map((s) => s.id)).toContain('extract');
    expect(ai.stages.map((s) => s.id)).toContain('agent');
  });

  it('gives openresume no token usage and no dollar figure', async () => {
    const openResume = (await compare()).openResume!;

    expect(openResume.ai).toBeNull();
    expect(openResume.aiNote).toContain('No provider AI call in this parser');
    // Explicitly not "free": it still spends local CPU.
    expect(openResume.aiNote).toContain('not the same as being free');
    expect(JSON.stringify(openResume)).not.toMatch(/\$0\.00|"totalUsd":0\b/);
  });

  it('reports only the stages openresume actually exposes', async () => {
    const openResume = (await compare()).openResume!;

    expect(openResume.stages.map((s) => s.id)).toEqual([
      'openresume:parse',
      'openresume:normalize',
    ]);
    // No invented subdivision of a parser that exposes none.
    expect(openResume.stages.length).toBeLessThan(3);
  });
});

describe('the comparison projection', () => {
  it('matches records after deterministic normalization only', () => {
    expect(normalizeKey('  Senior   Engineer ')).toBe('senior engineer');
    expect(normalizeKey('CloudScale  ')).toBe('cloudscale');
    expect(normalizeKey(null)).toBe('');
    // No fuzzy matching anywhere. Against the code, not the sentence that
    // promises it.
    expect(codeOf(read(COMPARISON))).not.toMatch(/levenshtein|fuzzy|similarity|jaro|distance\(/i);
  });

  it('counts overlap, AI-only and openresume-only correctly', async () => {
    const entities = (await compare()).comparison!.entities;
    const by = (type: string) => entities.find((entry) => entry.type === type)!;

    // Same company and role, different case and trailing space → overlap.
    expect(by('experiences')).toMatchObject({
      aiCount: 2,
      openResumeCount: 1,
      overlap: 1,
      aiOnly: 1,
      openResumeOnly: 0,
    });
    // Same URL, one with a trailing slash → overlap.
    expect(by('links')).toMatchObject({ overlap: 1, aiOnly: 0, openResumeOnly: 0 });
    // Shared degree plus one each side.
    expect(by('educations')).toMatchObject({ overlap: 1, aiOnly: 0, openResumeOnly: 1 });
    // AI-only sections.
    expect(by('skills')).toMatchObject({ aiCount: 3, openResumeCount: 0, overlap: 0, aiOnly: 3 });
    expect(by('certifications')).toMatchObject({ aiOnly: 1, openResumeOnly: 0 });
  });

  it('keeps the arithmetic exact for every section', async () => {
    for (const entry of (await compare()).comparison!.entities) {
      expect(entry.overlap + entry.aiOnly, entry.type).toBe(entry.aiDistinct);
      expect(entry.overlap + entry.openResumeOnly, entry.type).toBe(entry.openResumeDistinct);
      expect(entry.aiDistinct).toBeLessThanOrEqual(entry.aiCount);
      expect(entry.openResumeDistinct).toBeLessThanOrEqual(entry.openResumeCount);
    }
  });

  it('shows duplicates rather than absorbing them', () => {
    const withDuplicates = {
      ...OPENRESUME_DATA,
      skills: ['TypeScript', 'typescript', ' TypeScript '],
    };
    const comparison = buildComparison(AI_DATA, withDuplicates, {
      sourceSha256: 'x',
      sourceBytes: 1,
      bothSucceeded: true,
      totalMs: 1,
      executionNote: '',
    });
    const skills = comparison.entities.find((entry) => entry.type === 'skills')!;

    // Three raw, one distinct: the raw count is not quietly discarded.
    expect(skills.openResumeCount).toBe(3);
    expect(skills.openResumeDistinct).toBe(1);
    expect(buildComparisonWarnings(null, null, comparison.entities).map((w) => w.code)).toContain(
      'duplicate-records'
    );
  });

  it('names the key each section matched on', async () => {
    const entities = (await compare()).comparison!.entities;

    expect(entities.map((entry) => entry.matchRule)).toEqual([
      'company + role',
      'institution + degree',
      'name',
      'the skill text itself',
      'group name',
      'url, without a trailing slash',
      'name',
    ]);
    expect(entities.map((entry) => entry.type)).toEqual(SECTIONS.map((section) => section.type));
  });

  it('classifies scalar fields correctly', async () => {
    const fields = (await compare()).comparison!.fields;
    const by = (field: string) => fields.find((entry) => entry.field === field)!;

    expect(by('firstName').state).toBe('same');
    expect(by('email').state).toBe('same'); // differs only in case
    expect(by('location').state).toBe('different');
    expect(by('headline').state).toBe('ai-only');
    expect(by('phone').state).toBe('ai-only');
    expect(by('summary').state).toBe('ai-only');
  });

  it('covers missing-from-both and openresume-only', () => {
    const comparison = buildComparison(
      { profile: {}, contactInfo: {}, meta: {} },
      { profile: { headline: 'Engineer' }, contactInfo: {}, meta: {} },
      { sourceSha256: 'x', sourceBytes: 1, bothSucceeded: true, totalMs: 1, executionNote: '' }
    );
    const by = (field: string) => comparison.fields.find((entry) => entry.field === field)!;

    expect(by('headline').state).toBe('openresume-only');
    expect(by('firstName').state).toBe('missing-from-both');
  });

  it('calls confidence uncomparable rather than comparing two different scales', async () => {
    const confidence = (await compare()).comparison!.fields.find(
      (entry) => entry.field === 'confidence'
    )!;

    expect(confidence.state).toBe('not-comparable');
    // Both values are still shown.
    expect(confidence.ai).toBe('0.99');
    expect(confidence.openResume).toBe('0.74');
    expect(confidence.rule).toContain('unrelated scales');
  });

  it('names the fields that have no counterpart instead of dropping them', async () => {
    const uncomparable = (await compare()).comparison!.uncomparable;

    expect(uncomparable.map((entry) => entry.field)).toEqual([
      'meta.model',
      'meta.processingTimeMs',
      'token usage and cost',
      'experiences[].bullets',
    ]);
    expect(uncomparable.find((e) => e.field === 'token usage and cost')!.reason).toContain(
      'different claims'
    );
  });

  it('invents no score and declares no winner', async () => {
    const result = await compare();

    expect(JSON.stringify(result)).not.toMatch(/"(score|winner|better|worse|quality|rank)"/i);
    expect(codeOf(read(COMPARISON))).not.toMatch(/score|winner/i);
    expect(codeOf(read(COMPARE_RUNNER))).not.toMatch(/score|winner/i);
  });

  it('reports the mapping it used', async () => {
    const note = (await compare()).comparison!.projectionNote;

    expect(note).toContain('field-for-field identical');
    expect(note).toContain('No fuzzy or semantic matching');
    // And the claim holds: the two schemas really do declare the same sections.
    const openresume = read(OPENRESUME_SERVICE);
    const ai = read('services/import/resume-ai.service.ts');
    for (const section of ['experiences', 'educations', 'projects', 'skills', 'certifications']) {
      expect(openresume).toContain(`  ${section}:`);
      expect(ai).toContain(`  ${section}:`);
    }
  });
});

describe('warnings', () => {
  it('say the openresume side is an untested baseline, as the TODO requires', async () => {
    const warning = (await compare()).warnings.find(
      (entry) => entry.code === 'openresume-untested-baseline'
    )!;

    expect(warning.severity).toBe('info');
    expect(warning.message).toContain('first consumer');
  });

  it('disclose that its positions are synthesized', async () => {
    const warning = (await compare()).warnings.find(
      (entry) => entry.code === 'openresume-positions-synthesized'
    )!;

    expect(warning.severity).toBe('info');
    // True of the shipped reader, not an opinion.
    const reader = read('lib/resume-parser/read-pdf.ts');
    expect(reader).toContain('Convert raw text into TextItems with synthetic position data');
  });

  it('flag a section only one parser found', async () => {
    const codes = (await compare()).warnings.map((entry) => entry.code);

    expect(codes).toContain('section-ai-only');
    const skills = (await compare()).warnings.find(
      (entry) => entry.code === 'section-ai-only' && entry.evidence?.includes('skills')
    )!;
    expect(skills.evidence).toBe('3 vs 0 · skills');
  });

  it('flag a large count divergence without judging it', async () => {
    const comparison = buildComparison(
      { experiences: Array.from({ length: 9 }, (_, i) => ({ company: `c${i}`, role: 'r' })) },
      { experiences: [{ company: 'c0', role: 'r' }] },
      { sourceSha256: 'x', sourceBytes: 1, bothSucceeded: true, totalMs: 1, executionNote: '' }
    );
    const warning = buildComparisonWarnings(null, null, comparison.entities).find(
      (entry) => entry.code === 'entity-count-divergence'
    )!;

    expect(warning.evidence).toBe('9 vs 1 · experiences');
    expect(warning.message).not.toMatch(/better|worse|wrong|bad/i);
  });

  it('are deterministic', async () => {
    const first = await compare();
    const second = await compare();

    expect(first.warnings).toEqual(second.warnings);
  });
});

describe('the API boundary', () => {
  it('requires admin auth and the local-only gate before anything', () => {
    const route = read(COMPARE_ROUTE);
    const handler = route.slice(route.indexOf('export async function POST'));

    expect(route).toMatch(/await requireAdmin\(\)/);
    expect(route).toContain('assertCanRunDeveloperSuites()');
    expect(handler.indexOf('requireAdmin')).toBeLessThan(handler.indexOf('runResumeComparison'));
    expect(handler.indexOf('assertCanRunDeveloperSuites')).toBeLessThan(
      handler.indexOf('formData')
    );
    expect(route).toContain("from '@/_admin-panel/modules/developer/guard'");
    expect(route).toContain("runtime = 'nodejs'");
  });

  it('lets the client choose an input, never an implementation', () => {
    const route = read(COMPARE_ROUTE);

    expect(route).toContain("form.get('fixtureId')");
    expect(route).toContain("form.get('file')");
    for (const forbidden of [
      "form.get('parser'",
      "form.get('module'",
      "form.get('path'",
      "form.get('impl'",
      "form.get('model'",
      "form.get('command'",
      'body.parser',
      'body.path',
    ]) {
      expect(route, `${forbidden} must not be read`).not.toContain(forbidden);
    }
    // The only `form.get` calls in the file are the two inputs.
    expect(route.match(/form\.get\(/g)).toHaveLength(2);
  });

  it('refuses the gate before reading the document', async () => {
    const result = await runResumeComparison(
      { source: 'upload', bytes: pdfBytes(), filename: 'cv.pdf' },
      options({ canRun: false })
    );

    expect(result.outcome).toBe('gate-closed');
    expect(result.ai).toBeNull();
    expect(result.openResume).toBeNull();
  });

  it('adds exactly one endpoint, alongside the single-run one', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
      );
    const labRoutes = walk(path.join(process.cwd(), 'app', 'api', 'admin', 'platform'))
      .filter((file) => file.includes(`labs${path.sep}`))
      .map((file) =>
        file
          .slice(file.indexOf(`labs${path.sep}`))
          .split(path.sep)
          .join('/')
      )
      .sort();

    expect(labRoutes).toEqual([
      'labs/resume-import-ai/compare/route.ts',
      'labs/resume-import-ai/run/route.ts',
    ]);
  });
});

describe('reachability is unchanged', () => {
  it('keeps the lab’s use of openresume out of the scanner’s view', async () => {
    // The scanner describes shipped behaviour, and `_admin-panel` is not in
    // the roots it walks. An admin-only diagnostic import is therefore not a
    // product importer, and the orphan stays an orphan.
    const { SOURCE_ROOTS } = await import('@/_admin-panel/platform/scan/source-facts');

    expect(SOURCE_ROOTS).not.toContain('_admin-panel');
    for (const root of SOURCE_ROOTS) {
      expect(root.startsWith('_admin-panel')).toBe(false);
    }
  });

  it('adds no product importer of the dead modules', () => {
    // Nothing under the product roots may import either module. The lab lives
    // in `_admin-panel`, so this stays true after item 23.
    const roots = ['app', 'components', 'lib', 'services', 'types'];
    const walk = (dir: string): string[] => {
      try {
        return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory()
            ? walk(path.join(dir, entry.name))
            : /\.tsx?$/.test(entry.name)
              ? [path.join(dir, entry.name)]
              : []
        );
      } catch {
        return [];
      }
    };

    const importers: string[] = [];
    for (const root of roots) {
      for (const file of walk(path.join(process.cwd(), root))) {
        const source = readFileSync(file, 'utf8');
        if (/from '[^']*resume-openresume\.service'/.test(source)) {
          importers.push(file);
        }
      }
    }

    // `lib/resume-parser` is imported by the openresume service itself, which
    // is the dead end the scan already records. Nothing imports the service.
    expect(importers).toEqual([]);
  });
});

describe('the Turbopack limitation is contained and disclosed', () => {
  it('keeps the legacy parser out of the lab’s shared barrel', () => {
    const barrel = read('_admin-panel/platform/labs/resume-import-ai/index.ts');

    // Value exports of either module would put `lib/resume-parser` in the
    // graph of the lab page and the item-21 run route, and Turbopack fails
    // to compile it. Type exports are fine: they carry no runtime import.
    expect(barrel).not.toMatch(/^export \{[^}]*\} from '\.\/compare-runner';/m);
    expect(barrel).not.toMatch(/^export \{[^}]*\} from '\.\/openresume';/m);
    expect(barrel).toContain("export type { ResumeComparisonOptions } from './compare-runner';");
    expect(barrel).toContain("export type { OpenResumeOptions } from './openresume';");
  });

  it('reaches the comparison only from the comparison route', () => {
    const walk = (dir: string): string[] => {
      try {
        return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory()
            ? walk(path.join(dir, entry.name))
            : /\.tsx?$/.test(entry.name)
              ? [path.join(dir, entry.name)]
              : []
        );
      } catch {
        return [];
      }
    };

    const importers: string[] = [];
    for (const root of ['app', '_admin-panel', 'components', 'lib', 'services']) {
      for (const file of walk(path.join(process.cwd(), root))) {
        const source = readFileSync(file, 'utf8');
        // A value import of either module, not a `import type`.
        if (/^import \{[^}]*\} from '[^']*(compare-runner|\/openresume)'/m.test(source)) {
          importers.push(
            file
              .slice(process.cwd().length + 1)
              .split(path.sep)
              .join('/')
          );
        }
      }
    }

    expect(importers.sort()).toEqual([
      '_admin-panel/platform/labs/resume-import-ai/compare-runner.ts',
      'app/api/admin/platform/labs/resume-import-ai/compare/route.ts',
    ]);
  });

  it('says what happened, and names the workflow that works', () => {
    const source = read(COMPONENT);

    expect(source).toContain('Turbopack cannot resolve its script path');
    expect(source).toContain('Everything else on this page works');
    // The message points at a script that exists, not at a flag to remember.
    expect(source).toContain('npm run dev:webpack');
  });

  it('ships a webpack dev script without replacing the default one (item 23a)', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

    // The documented fallback: `next dev` with no --turbo, running the whole
    // app rather than one route.
    expect(pkg.scripts['dev:webpack']).toBe('next dev');
    // And the repository's default dev command is untouched.
    expect(pkg.scripts.dev).toBe('next dev --turbo');
    // Build and production are not involved in the workaround at all.
    expect(pkg.scripts['build:ci']).toBe('prisma generate && next build');
    expect(pkg.scripts.start).toBe('next start');
  });

  it('documents why the fallback exists, where an engineer will look', () => {
    const readme = read('_admin-panel/README.md');

    expect(readme).toContain('npm run dev:webpack');
    // The three things a reader needs: which default, what breaks, what does not.
    expect(readme).toContain('Turbopack');
    expect(readme).toContain("Can't resolve './ROOT/scripts/parse-pdf.cjs'");
    expect(readme).toContain('`next build` and production are');
    expect(readme).toContain('unaffected');
    // Not presented as a product requirement.
    expect(readme).toContain('limitation of dead code, not a product requirement');

    const rules = read('.cursor/rules/admin-panel.mdc');
    expect(rules).toContain('npm run dev:webpack');
  });

  it('adds no dependency to make the parser work', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    // The fix is a script and a document. Nothing was installed for it.
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      expect(name).not.toMatch(/turbopack|webpack-cli|pdf-parse-fork/);
    }
  });

  it('leaves the legacy parser and its child-process script untouched', () => {
    // Item 23a is a workflow fix. Product code was not edited to suit the
    // bundler, which is why the limitation is still real and still disclosed.
    const reader = read('lib/resume-parser/read-pdf.ts');
    expect(reader).not.toMatch(/turbopackIgnore|webpackIgnore|@vercel\/no-bundle/);
    expect(reader).toContain("spawn('node', [scriptPath]");

    const script = read('scripts/parse-pdf.cjs');
    expect(script).toContain("require('pdf-parse')");
  });

  it('adds no Turbopack alias that could mask a real missing module', () => {
    const config = read('next.config.ts');

    expect(config).not.toMatch(/resolveAlias|parse-pdf\.cjs/);
    // `serverExternalPackages` is unchanged: it lists node_modules packages,
    // and the problem module is app-local.
    expect(config).toContain("'pdf-parse',");
  });

  it('is a real property of the dead parser, not a lab defect', () => {
    // The spawn Turbopack cannot statically resolve. Unchanged product code.
    const reader = read('lib/resume-parser/read-pdf.ts');

    expect(reader).toContain(
      "const scriptPath = path.join(process.cwd(), 'scripts', 'parse-pdf.cjs');"
    );
    expect(reader).toContain("spawn('node', [scriptPath]");
  });
});

describe('the page', () => {
  const view = {
    fixtures: [{ id: 'alex-morgan', label: 'Alex Morgan', description: 'Sample.', bytes: 105443 }],
    canRun: true,
    gateReason: 'Local only.',
    aiAvailable: true,
    maxBytes: MAX_UPLOAD_BYTES,
    acceptedType: ACCEPTED_TYPE,
  };

  it('offers the comparison and says what openresume is', () => {
    const html = renderToStaticMarkup(<ResumeLab view={view} />);
    const text = textOf(html);

    expect(text).toContain('Compare AI vs OpenResume');
    // The TODO asks for the baseline caveat to be said in the UI.
    expect(text).toContain('OpenResume is dead code');
    expect(text).toContain('untested baseline');
    expect(text).toContain('calls no model');
  });

  it('keeps the single-run controls working', () => {
    const html = renderToStaticMarkup(<ResumeLab view={view} />);
    const text = textOf(html);

    expect(text).toContain('Run the fixture');
    expect(text).toContain('Run the upload');
    expect(html).toContain('<select');
    expect(html).toContain('type="file"');
    // And the item-21/22 framing is intact.
    expect(text).toContain('Diagnostic only');
    expect(text).toContain('Nothing is saved to Follio');
  });

  it('hides the comparison behind the same gate', () => {
    const text = textOf(renderToStaticMarkup(<ResumeLab view={{ ...view, canRun: false }} />));

    expect(text).not.toContain('Compare AI vs OpenResume');
    expect(text).toContain('Running the lab is unavailable here');
  });

  it('renders each side from its own result', () => {
    const source = read(COMPONENT);

    expect(source).toContain('function ParserCard(');
    expect(source).toContain('function EntityTable(');
    expect(source).toContain('function FieldTable(');
    expect(source).toContain('function Comparison(');
    // No arithmetic in the view.
    expect(source).not.toMatch(/overlap \+|aiOnly \+|\.filter\(.*includes/);
    // And no winner.
    expect(source).toContain('No winner and no score');
  });

  it('shows the openresume side without a dollar figure', () => {
    const source = read(COMPONENT);
    const card = source.slice(
      source.indexOf('function ParserCard('),
      source.indexOf('function stateClass(')
    );

    expect(card).toContain('{run.aiNote}');
    expect(executableOf(card)).not.toMatch(/\$0\.00/);
  });
});

describe('a ParserRun is self-describing', () => {
  it('says which implementation produced it', async () => {
    const run: ParserRun = (await compare()).openResume!;

    expect(run.side).toBe('openResume');
    expect(run.implementation).toContain('resume-openresume.service.ts');
    expect(run.parseMethod).toBe('open-resume');
    expect(run.note).toContain('untested baseline');
  });

  it('runs the real openresume boundary when no seam is given', async () => {
    // Seams only replace the two shipped calls; with none supplied the
    // module reaches for the real ones. Proven by the failure it produces on
    // bytes that are not a PDF, which comes from the real parser.
    const run = await runOpenResume(Buffer.from('%PDF-1.7 not really'));

    expect(run.outcome).toBe('failed');
    expect(run.error).not.toBeNull();
    expect(run.ai).toBeNull();
  });
});
