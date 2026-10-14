/**
 * Resume lab: the shipped pipeline, measured (PLATFORM_TODO item 21).
 *
 * The item's done condition is three things — a fixture run showing bytes,
 * pages, extracted chars, chars kept vs dropped and per-stage ms; an
 * `AgentRun` whose token totals the lab reads; and a test proving the lab
 * never imports `saveAIResumeToProfile` and never passes a truthy
 * `saveToProfile`. The last one is the reason this file exists at all.
 *
 * The seams replace the two shipped calls so the suite never spends a token or
 * reads a PDF, but they do **not** mock away the fact that the runner calls
 * them: the defaults are asserted against the source, so a runner that quietly
 * grew its own parser would fail here.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { COVERAGE_MAP } from '@/_admin-panel/platform/coverage-map';
import { buildLabsView, IMPLEMENTED_LABS, LABS_ROOT } from '@/_admin-panel/platform/labs';
import {
  ACCEPTED_TYPE,
  buildResumeLabView,
  listResumeLabFixtures,
  MAX_UPLOAD_BYTES,
  runResumeLab,
} from '@/_admin-panel/platform/labs/resume-import-ai';
import type {
  ResumeLabRunOptions,
  ResumeLabRunResult,
  ResumeLabView,
} from '@/_admin-panel/platform/labs/resume-import-ai';
import { ResumeLab } from '@/_admin-panel/platform/ui';

const RUNNER = '_admin-panel/platform/labs/resume-import-ai/runner.ts';
const TYPES = '_admin-panel/platform/labs/resume-import-ai/types.ts';
const COMPONENT = '_admin-panel/platform/ui/resume-lab.tsx';
const RUN_ROUTE = 'app/api/admin/platform/labs/resume-import-ai/run/route.ts';
const LAB_PAGE = 'app/admin/(dashboard)/platform/labs/resume-import-ai/page.tsx';
const SHIPPED_SERVICE = 'services/import/resume-ai.service.ts';
const SHIPPED_AGENT = 'services/agents/resume-parse/resume-parse.agent.ts';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

/**
 * The file with its comments and string literals removed.
 *
 * Several assertions below are about what the lab never calls, and every one
 * of these files says in prose — and in operator-facing copy — which function
 * it deliberately avoids. A plain substring search finds the explanation and
 * passes for the wrong reason, so the prose goes first and the executable text
 * is what gets searched.
 */
function code(relativePath: string): string {
  const source = read(relativePath);
  let out = '';
  let index = 0;

  while (index < source.length) {
    const pair = source.slice(index, index + 2);
    if (pair === '//') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (pair === '/*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }

    const char = source[index];
    if (char === "'" || char === '"' || char === '`') {
      index += 1;
      while (index < source.length && source[index] !== char) {
        index += source[index] === '\\' ? 2 : 1;
      }
      index += 1;
      out += ' "" ';
      continue;
    }

    out += char;
    index += 1;
  }

  return out;
}

/** Every module the file imports, static or dynamic. */
function importSpecifiers(relativePath: string): string[] {
  return [...read(relativePath).matchAll(/(?:\bfrom|\bimport\(|\brequire\()\s*'([^']+)'/g)].map(
    (match) => match[1]
  );
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;|&#8217;/g, '’')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, ' ');
}

/** A PDF as far as the magic-byte check is concerned. */
function pdfBytes(body = 'x'.repeat(200)): Buffer {
  return Buffer.from(`%PDF-1.7\n${body}`, 'utf8');
}

const EXTRACTED = `Alex Morgan — Software Engineer. ${'Experience and skills. '.repeat(20)}`;

/** An AgentRun-shaped result, in the shape the shipped runtime returns. */
function agentResult(overrides: Record<string, unknown> = {}) {
  return {
    output: {
      data: {
        profile: { firstName: 'Alex', lastName: 'Morgan', headline: 'Engineer', summary: 'Hi.' },
        contactInfo: { email: 'alex@example.test' },
        experiences: [
          { company: 'Acme', role: 'Engineer' },
          { company: 'Globex', role: 'Dev' },
        ],
        educations: [{ institution: 'University' }],
        projects: [],
        skills: ['TypeScript', 'React'],
        links: [{ type: 'github', url: 'https://example.test' }],
        certifications: [],
        meta: { confidence: 0.9, parseMethod: 'ai', model: 'gpt-4o-mini', processingTimeMs: 12 },
      },
      saved: false,
    },
    run: {
      id: 'run-1',
      agentId: 'resume-parse',
      version: 'agent-v2',
      status: 'succeeded',
      stepMetas: [
        { stepId: 'parse-resume-ai', kind: 'llm', durationMs: 900, timestamp: 'now' },
        { stepId: 'normalize-resume', kind: 'workflow', durationMs: 1, timestamp: 'now' },
        { stepId: 'rewrite-for-follio', kind: 'llm', durationMs: 50, timestamp: 'now' },
        { stepId: 'optional-save', kind: 'workflow', durationMs: 0, timestamp: 'now' },
      ],
      totalTokensUsed: { input: 1200, output: 300 },
      startedAt: 'now',
    },
    ...overrides,
  };
}

/** Seams that keep the suite off the disk and off the network. */
function seams(overrides: Partial<ResumeLabRunOptions> = {}): ResumeLabRunOptions {
  return {
    canRun: true,
    aiAvailable: true,
    userId: 'admin_test',
    readPages: async () => ({ pages: 2, via: 'test' }),
    extractText: async () => EXTRACTED,
    runAgent: async () => agentResult(),
    ...overrides,
  };
}

async function runUpload(
  bytes: Buffer,
  overrides: Partial<ResumeLabRunOptions> = {}
): Promise<ResumeLabRunResult> {
  return runResumeLab(
    { source: 'upload', bytes, filename: 'cv.pdf', declaredType: ACCEPTED_TYPE },
    seams(overrides)
  );
}

describe('it runs the shipped pipeline, not a copy of it', () => {
  const source = read(RUNNER);

  it('calls the two functions the product route calls', () => {
    expect(source).toContain("await import('@/services/import/resume-ai.service')");
    expect(source).toContain('extractTextFromPDF(bytes)');
    expect(source).toContain("await import('@/services/agents/resume-parse')");
    expect(source).toContain('runResumeParseAgent(');
    // The same two calls, in the same order, that `importResumeWithAI` makes.
    const shipped = read(SHIPPED_SERVICE);
    expect(shipped).toContain('const text = await extractTextFromPDF(buffer);');
    expect(shipped).toContain('await runResumeParseAgent(');
  });

  it('touches none of the dead or orphaned parsers', () => {
    const imported = importSpecifiers(RUNNER);

    for (const forbidden of [
      'lib/resume-parser',
      'resume-parser-ai.service',
      'resume-openresume.service',
      'resume-parser.service',
    ]) {
      expect(
        imported.filter((specifier) => specifier.includes(forbidden)),
        `${forbidden} must not be imported`
      ).toEqual([]);
    }
    // The only product modules it reaches for are the two the route uses.
    expect([...new Set(imported.filter((specifier) => specifier.startsWith('@/')))].sort()).toEqual(
      ['@/services/agents/resume-parse', '@/services/import/resume-ai.service']
    );
    expect(code(RUNNER)).not.toContain('extractTextFromPDFEnhanced');
  });

  it('never imports the save path and never passes a truthy saveToProfile', () => {
    // Item 21's literal done condition. Prose and operator-facing copy name
    // both of these to explain their absence, so the check is against the
    // executable text with comments and string literals removed.
    for (const file of [RUNNER, TYPES, COMPONENT, RUN_ROUTE, LAB_PAGE]) {
      const executable = code(file);

      expect(executable, `${file} must not reach the save path`).not.toContain(
        'saveAIResumeToProfile'
      );
      // Not `saveToProfile: false` either — absent, so no caller can flip it.
      expect(executable, `${file} must not mention saveToProfile`).not.toMatch(/saveToProfile/);
    }
    // The flag really is absent from the call the runner makes, and the
    // agent's save step is gated on it being truthy.
    expect(source).toContain('{ text: input.text, userId: input.userId }');
    expect(read(SHIPPED_AGENT)).toContain('if (!input.saveToProfile) {');
  });

  it('strips prose before searching, so those checks can fail', () => {
    // The stripper is load-bearing for the two assertions above: if it ever
    // stopped removing comments they would pass on a file that really did
    // call the save path. These two facts hold only because it works.
    expect(read(RUNNER)).toContain('saveAIResumeToProfile');
    expect(code(RUNNER)).not.toContain('saveAIResumeToProfile');
    expect(code(RUNNER)).toContain('export async function runResumeLab');
  });

  it('writes nothing of its own', () => {
    for (const file of [RUNNER, TYPES, COMPONENT, RUN_ROUTE, LAB_PAGE]) {
      const text = read(file);
      expect(text, `${file} must not write`).not.toMatch(
        /writeFileSync|appendFileSync|mkdirSync|renameSync|rmSync|unlink/
      );
      expect(text, `${file} must not reach Prisma`).not.toMatch(/@\/lib\/db|prisma\./i);
    }
    // The runner reads: a fixture off disk, and nothing else.
    expect(source).toContain('readFileSync(resolved)');
  });
});

describe('fixtures', () => {
  const fixtures = listResumeLabFixtures();

  it('offers the committed pool, and only that', () => {
    expect(fixtures.length).toBeGreaterThan(0);
    for (const fixture of fixtures) {
      expect(fixture.id.length).toBeGreaterThan(0);
      expect(fixture.bytes, `${fixture.id} has no file`).toBeGreaterThan(0);
    }
    // Pool only: `listResumeFixtures()` also returns whatever an operator
    // dropped in the gitignored uploads directory, and resolving an arbitrary
    // id against that would duplicate the upload mode badly.
    expect(read(RUNNER)).toContain("fixture.source === 'pool'");
  });

  it('is a real PDF on disk, synthetic and committed', () => {
    const fixture = path.join(
      process.cwd(),
      '_admin-panel/modules/developer/live-qa/fixtures/resumes/alex-morgan.pdf'
    );

    expect(existsSync(fixture)).toBe(true);
    expect(statSync(fixture).size).toBeGreaterThan(1000);
    expect(readFileSync(fixture).subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('refuses an id the pool does not have', async () => {
    const result = await runResumeLab({ source: 'fixture', fixtureId: 'not-a-fixture' }, seams());

    expect(result.outcome).toBe('unknown-fixture');
    expect(result.parsed).toBeNull();
  });

  it('runs a real fixture through the same runner as an upload', async () => {
    const result = await runResumeLab(
      { source: 'fixture', fixtureId: listResumeLabFixtures()[0].id },
      seams()
    );

    expect(result.outcome).toBe('parsed');
    expect(result.source).toBe('fixture');
    // The bytes came off disk, so this is the committed file's real size.
    expect(result.sizes.inputBytes).toBe(listResumeLabFixtures()[0].bytes);
  });
});

describe('the input rules are the product route’s', () => {
  it('applies the same 5 MB, PDF-only limits', () => {
    expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
    expect(ACCEPTED_TYPE).toBe('application/pdf');
    // The same numbers the product route uses.
    const route = read('app/api/import/resume/route.ts');
    expect(route).toContain('5 * 1024 * 1024');
    expect(route).toContain("file.type !== 'application/pdf'");
  });

  it('refuses an empty upload', async () => {
    const result = await runUpload(Buffer.alloc(0));

    expect(result.outcome).toBe('no-input');
  });

  it('refuses an oversized upload', async () => {
    const result = await runUpload(Buffer.concat([pdfBytes(), Buffer.alloc(MAX_UPLOAD_BYTES + 1)]));

    expect(result.outcome).toBe('too-large');
    expect(result.detail).toContain('5 MB');
  });

  it('refuses something that is not a PDF, whatever it claims to be', async () => {
    const result = await runResumeLab(
      {
        source: 'upload',
        bytes: Buffer.from('MZ not a pdf at all', 'utf8'),
        filename: 'cv.pdf',
        // The declared type is a lie; the magic bytes are checked instead.
        declaredType: 'application/pdf',
      },
      seams()
    );

    expect(result.outcome).toBe('not-a-pdf');
    expect(result.detail).toContain('%PDF');
  });

  it('takes no path from a caller, only bytes or a pool id', () => {
    const runner = read(RUNNER);
    const route = read(RUN_ROUTE);

    // A filename is a label. It is never joined to anything.
    expect(runner).toContain("const label = (input.filename ?? 'upload').split(/[\\\\/]/).pop()");
    expect(runner).not.toMatch(/path\.join\([^)]*filename/);
    expect(route).not.toMatch(/body\.path|form\.get\('path'\)|readFileSync/);
  });

  it('keeps the uploaded bytes out of the response', async () => {
    const result = await runUpload(pdfBytes('secret resume content'));

    expect(JSON.stringify(result)).not.toContain('secret resume content');
    expect(Object.keys(result)).not.toContain('bytes');
  });
});

describe('what a run measures', () => {
  it('reports bytes, pages, chars and per-stage ms', async () => {
    const bytes = pdfBytes();
    const result = await runUpload(bytes);

    expect(result.outcome).toBe('parsed');
    expect(result.sizes.inputBytes).toBe(bytes.length);
    expect(result.sizes.pages).toBe(2);
    expect(result.sizes.extractedChars).toBe(EXTRACTED.length);
    expect(result.sizes.extractedBytes).toBe(Buffer.byteLength(EXTRACTED, 'utf8'));
    expect(result.sizes.parserInputChars).toBe(EXTRACTED.length);
    expect(result.sizes.parsedJsonChars).toBe(result.parsed!.json.length);

    const ids = result.timing.stages.map((stage) => stage.id);
    expect(ids.slice(0, 4)).toEqual(['input', 'pages', 'extract', 'agent']);
    for (const stage of result.timing.stages) {
      expect(stage.ms, stage.id).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(stage.ms), stage.id).toBe(true);
    }
    expect(result.timing.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('reports the agent’s own step timings rather than re-measuring them', async () => {
    const result = await runUpload(pdfBytes());
    const nested = result.timing.stages.filter((stage) => stage.id.startsWith('agent:'));

    expect(nested.map((stage) => stage.id)).toEqual([
      'agent:parse-resume-ai',
      'agent:normalize-resume',
      'agent:rewrite-for-follio',
      'agent:optional-save',
    ]);
    // The numbers are the agent's, passed through.
    expect(nested.map((stage) => stage.ms)).toEqual([900, 1, 50, 0]);
    for (const stage of nested) expect(stage.detail).toContain('Reported by the agent');
  });

  it('measures kept and dropped at the boundary', async () => {
    const result = await runUpload(pdfBytes());
    const retention = result.retention!;

    expect(retention.extractedChars).toBe(EXTRACTED.length);
    expect(retention.keptChars).toBe(EXTRACTED.length);
    // The shipped pipeline hands the text over unchanged, so nothing drops.
    expect(retention.droppedChars).toBe(0);
    expect(retention.keptPercent).toBe(100);
    expect(retention.keptChars + retention.droppedChars).toBe(retention.extractedChars);
    expect(retention.note).toContain('unchanged');
  });

  it('would notice if the pipeline started dropping text', () => {
    // The claim above is only worth making because it is checked: the shipped
    // parse step concatenates the whole text onto its prompt, with no slice.
    const shipped = read(SHIPPED_SERVICE);

    expect(shipped).toContain('userPrompt: RESUME_PARSING_PROMPT + text');
    expect(shipped).not.toMatch(/text\.slice\(|text\.substring\(|truncate/);
    // And the lab compares the two ends rather than assuming they match.
    expect(read(RUNNER)).toContain('retentionFor(text.length, parserInput.length)');
  });

  it('reads the AgentRun’s token totals', async () => {
    const result = await runUpload(pdfBytes());

    expect(result.tokens).toMatchObject({ input: 1200, output: 300, total: 1500 });
    expect(result.agentRunId).toBe('run-1');
  });

  it('says why the totals are zero when they are', async () => {
    const result = await runUpload(pdfBytes(), {
      runAgent: async () =>
        agentResult({
          run: { ...agentResult().run, totalTokensUsed: { input: 0, output: 0 } },
        }),
    });

    // Which is what every real resume import records today: the shipped
    // runtime accumulates usage for tool-agent turns, and this is a workflow
    // agent whose steps report duration only.
    expect(result.tokens!.total).toBe(0);
    expect(result.tokens!.note).toContain('workflow agent');
  });

  it('returns the parse result structurally', async () => {
    const result = await runUpload(pdfBytes());
    const parsed = result.parsed!;

    expect(parsed.counts).toEqual({
      experiences: 2,
      educations: 1,
      projects: 0,
      skills: 2,
      links: 1,
      certifications: 0,
    });
    expect(parsed.model).toBe('gpt-4o-mini');
    expect(parsed.confidence).toBe(0.9);
    expect(parsed.headline).toBe('Engineer');
    expect(JSON.parse(parsed.json)).toMatchObject({ profile: { firstName: 'Alex' } });
  });
});

describe('failures are kept apart', () => {
  it('distinguishes a closed gate', async () => {
    const result = await runUpload(pdfBytes(), { canRun: false });

    expect(result.outcome).toBe('gate-closed');
  });

  it('distinguishes a missing AI provider, before doing any work', async () => {
    const result = await runUpload(pdfBytes(), {
      aiAvailable: false,
      extractText: async () => {
        throw new Error('extraction must not be attempted');
      },
    });

    expect(result.outcome).toBe('ai-unavailable');
    // The product route refuses at the same point, for the same reason.
    expect(read('app/api/import/resume/route.ts')).toContain('isAIParserAvailable()');
  });

  it('distinguishes an extraction failure from a parse failure', async () => {
    const extraction = await runUpload(pdfBytes(), {
      extractText: async () => {
        throw new Error('Failed to extract text from PDF.');
      },
    });
    expect(extraction.outcome).toBe('extraction-failed');
    expect(extraction.error).toContain('Failed to extract text');
    expect(extraction.parsed).toBeNull();

    const parse = await runUpload(pdfBytes(), {
      runAgent: async () => {
        throw new Error('model refused');
      },
    });
    expect(parse.outcome).toBe('agent-failed');
    expect(parse.error).toBe('model refused');
    // Extraction still happened, so its numbers are still real.
    expect(parse.sizes.extractedChars).toBe(EXTRACTED.length);
    expect(parse.retention).not.toBeNull();
  });

  it('refuses text too short for the shipped service', async () => {
    const result = await runUpload(pdfBytes(), { extractText: async () => 'too short' });

    expect(result.outcome).toBe('text-too-short');
    expect(result.detail).toContain('50');
    // The same threshold the service applies.
    expect(read(SHIPPED_SERVICE)).toContain('if (text.length < 50)');
  });

  it('never returns a stack or a key', async () => {
    const result = await runUpload(pdfBytes(), {
      runAgent: async () => {
        const error = new Error('provider said no\n    at someFrame (secret.ts:1:1)');
        throw error;
      },
    });

    expect(result.error).toBe('provider said no');
    expect(JSON.stringify(result)).not.toContain('someFrame');
    expect(JSON.stringify(result)).not.toMatch(/sk-|OPENAI_API_KEY/);
  });
});

describe('the API boundary', () => {
  const route = read(RUN_ROUTE);

  it('requires admin auth and the local-only gate before anything', () => {
    const handler = route.slice(route.indexOf('export async function POST'));

    expect(route).toMatch(/await requireAdmin\(\)/);
    expect(route).toContain('assertCanRunDeveloperSuites()');
    expect(handler.indexOf('requireAdmin')).toBeLessThan(handler.indexOf('runResumeLab'));
    expect(handler.indexOf('assertCanRunDeveloperSuites')).toBeLessThan(
      handler.indexOf('runResumeLab')
    );
    expect(handler.indexOf('assertCanRunDeveloperSuites')).toBeLessThan(
      handler.indexOf('formData')
    );
    expect(route).toContain("from '@/_admin-panel/modules/developer/guard'");
    expect(route).toContain("runtime = 'nodejs'");
  });

  it('reads only a fixture id or a file from the body', () => {
    expect(route).toContain("form.get('fixtureId')");
    expect(route).toContain("form.get('file')");
    for (const forbidden of ["form.get('path'", 'body.path', 'body.command', 'body.options']) {
      expect(route, `${forbidden} must not be read`).not.toContain(forbidden);
    }
  });

  it('is the only endpoint the lab has', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
      );
    const labRoutes = walk(path.join(process.cwd(), 'app', 'api', 'admin', 'platform')).filter(
      (file) => file.includes(`labs${path.sep}`)
    );

    expect(labRoutes).toHaveLength(1);
    expect(labRoutes[0].endsWith(path.join('resume-import-ai', 'run', 'route.ts'))).toBe(true);
  });

  it('renders the page behind admin auth, as a thin shim', () => {
    const page = read(LAB_PAGE);

    expect(page).toMatch(/await requireAdmin\(\)/);
    expect(page).toContain('buildResumeLabView()');
    expect(page).toContain('ResumeLab');
    expect(page).not.toMatch(/className=|\.map\(/);
  });
});

describe('the page', () => {
  const view: ResumeLabView = {
    fixtures: [{ id: 'alex-morgan', label: 'Alex Morgan', description: 'Sample.', bytes: 105443 }],
    canRun: true,
    gateReason: 'Local only.',
    aiAvailable: true,
    maxBytes: MAX_UPLOAD_BYTES,
    acceptedType: ACCEPTED_TYPE,
  };

  it('offers a fixture and an upload, and says what it is', () => {
    const html = renderToStaticMarkup(<ResumeLab view={view} />);
    const text = textOf(html);

    expect(text).toContain('Diagnostic only');
    expect(text).toContain('Nothing is saved to Follio');
    expect(text).toContain('extractTextFromPDF');
    expect(text).toContain('runResumeParseAgent');
    expect(html).toContain('<select');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="application/pdf,.pdf"');
    expect(text).toContain('alex-morgan');
  });

  it('warns that a run costs tokens and leaves one telemetry row', () => {
    const text = textOf(renderToStaticMarkup(<ResumeLab view={view} />));

    expect(text).toContain('costs tokens');
    expect(text).toContain('AgentRun');
    expect(text).toContain('never written to disk or the database');
  });

  it('hides the controls when the gate is closed', () => {
    const html = renderToStaticMarkup(<ResumeLab view={{ ...view, canRun: false }} />);

    expect(html).not.toContain('<select');
    expect(html).not.toContain('type="file"');
    expect(textOf(html)).toContain('Running the lab is unavailable here');
  });

  it('says so when no AI provider is configured', () => {
    const text = textOf(renderToStaticMarkup(<ResumeLab view={{ ...view, aiAvailable: false }} />));

    expect(text).toContain('No AI provider is configured');
  });

  it('does not look like the product importer', () => {
    const source = read(COMPONENT);

    // No save, no import-completed copy, no profile preview.
    expect(source).not.toMatch(/Save to profile|Import complete|saveToProfile/i);
    expect(source).not.toMatch(/dangerouslySetInnerHTML/);
  });
});

describe('the registry and the Labs home', () => {
  it('marks resume-import-ai available, pointing at the real route', () => {
    const entry = IMPLEMENTED_LABS.find((lab) => lab.id === 'resume-import-ai');

    expect(entry).toBeDefined();
    expect(entry!.route).toBe(`${LABS_ROOT}/resume-import-ai`);
    expect(existsSync(path.join(process.cwd(), LAB_PAGE))).toBe(true);
  });

  it('flips the Labs home with no special case', () => {
    const view = buildLabsView();
    const feature = view.categories
      .flatMap((entry) => entry.features)
      .find((item) => item.labId === 'resume-import-ai')!;

    expect(feature.status).toBe('available');
    expect(feature.route).toBe(`${LABS_ROOT}/resume-import-ai`);
    expect(view.problems).toEqual([]);
    // Counts follow the data, not a literal.
    const declared = COVERAGE_MAP.filter((entry) => entry.lab !== undefined);
    expect(view.summary.available).toBe(IMPLEMENTED_LABS.length);
    expect(view.summary.planned).toBe(declared.length - IMPLEMENTED_LABS.length);
    // And the home still has no idea what a lab does.
    expect(read('_admin-panel/platform/labs/view.ts')).not.toContain('resume');
  });

  it('builds the lab view from the real pool and the real gate', () => {
    const built = buildResumeLabView();

    expect(built.fixtures.length).toBeGreaterThan(0);
    expect(built.maxBytes).toBe(MAX_UPLOAD_BYTES);
    expect(typeof built.canRun).toBe('boolean');
    expect(typeof built.aiAvailable).toBe('boolean');
  });
});

describe('nothing else moved', () => {
  it('leaves the product import path untouched', () => {
    const route = read('app/api/import/resume/route.ts');

    // Still the product's own flow, including the save the lab refuses.
    expect(route).toContain('saveAIResumeToProfile');
    expect(route).toContain('importResumeWithAI');
    expect(read(SHIPPED_SERVICE)).toContain('export async function importResumeWithAI');
    // And the product knows nothing about the lab.
    for (const file of [
      'app/api/import/resume/route.ts',
      SHIPPED_SERVICE,
      SHIPPED_AGENT,
      'app/admin/(dashboard)/developer/page.tsx',
      'app/admin/(dashboard)/platform/tests/page.tsx',
      'app/admin/(dashboard)/platform/drift/page.tsx',
    ]) {
      expect(read(file), `${file} must not know about the lab`).not.toMatch(
        /platform\/labs|ResumeLab|resume-lab/
      );
    }
  });
});
