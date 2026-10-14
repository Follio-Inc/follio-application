/**
 * Resume lab: AI tokens, cost, entities, warnings, raw payloads
 * (PLATFORM_TODO item 22).
 *
 * The item has no `_Done when_` clause, so its title is the requirement, and
 * the hard part of the title is the first word. `AgentRun.totalTokensUsed` is
 * `{0, 0}` for every resume import — the product's included — because the
 * shipped workflow discards the AI client's metadata. This file's job is to
 * prove the lab never lets that zero pass as a measurement: usage is
 * `observed`, `estimated` or `unavailable`, cost follows usage rather than
 * defaulting to $0, and the three never collapse.
 *
 * Item 21's seams keep the suite off the provider; the usage probe is
 * substituted the same way, so telemetry can be present, absent or
 * contradictory on demand.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_TYPE,
  MAX_UPLOAD_BYTES,
  MODEL_PRICING,
  PAYLOAD_PREVIEW_CHARS,
  PRICING_SOURCE,
  RESUME_PIPELINE_STAGES,
  buildEntities,
  buildWarnings,
  costForRun,
  createUsageProbe,
  priceFor,
  runResumeLab,
} from '@/_admin-panel/platform/labs/resume-import-ai';
import type {
  ObservedAiCall,
  ResumeLabAiCall,
  ResumeLabRunOptions,
  ResumeLabRunResult,
  UsageProbe,
} from '@/_admin-panel/platform/labs/resume-import-ai';
import { ResumeLab } from '@/_admin-panel/platform/ui';

const RUNNER = '_admin-panel/platform/labs/resume-import-ai/runner.ts';
const TELEMETRY = '_admin-panel/platform/labs/resume-import-ai/telemetry.ts';
const DIAGNOSTICS = '_admin-panel/platform/labs/resume-import-ai/diagnostics.ts';
const PRICING = '_admin-panel/platform/labs/resume-import-ai/pricing.ts';
const COMPONENT = '_admin-panel/platform/ui/resume-lab.tsx';
const RUN_ROUTE = 'app/api/admin/platform/labs/resume-import-ai/run/route.ts';
const LAB_PAGE = 'app/admin/(dashboard)/platform/labs/resume-import-ai/page.tsx';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

/**
 * The file with comments stripped.
 *
 * Every module here explains in prose which function it deliberately never
 * calls, so a plain substring search finds the explanation and passes for the
 * wrong reason. String literals are kept, because import specifiers and the
 * operator-facing copy are both things these tests need to see.
 */
function executableOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
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

function pdfBytes(body = 'x'.repeat(200)): Buffer {
  return Buffer.from(`%PDF-1.7\n${body}`, 'utf8');
}

const EXTRACTED = `Alex Morgan — Software Engineer. ${'Experience and skills. '.repeat(40)}`;

/** The two calls a healthy resume import really makes. */
const REAL_CALLS: ObservedAiCall[] = [
  {
    stage: 'resumeParse',
    model: 'gpt-4o-mini',
    inputTokens: 1800,
    outputTokens: 900,
    durationMs: 19000,
  },
  { stage: 'follioVoice', model: 'gpt-4o', inputTokens: 400, outputTokens: 60, durationMs: 800 },
];

/** A probe that reports exactly what a test hands it, observing nothing. */
function fixedProbe(calls: ObservedAiCall[]): UsageProbe {
  return { calls, observe: async (body) => body() };
}

function agentResult(overrides: Record<string, unknown> = {}) {
  return {
    output: {
      data: {
        profile: { firstName: 'Alex', lastName: 'Morgan', headline: 'Engineer', summary: 'Hi.' },
        contactInfo: { email: 'alex@example.test', phone: '+1 555 0100' },
        experiences: [
          { company: 'Acme', role: 'Engineer', bullets: ['Shipped a thing', 'Shipped another'] },
          { company: 'Globex', role: 'Dev', bullets: ['Fixed a thing'] },
        ],
        educations: [{ institution: 'University' }],
        projects: [{ name: 'Follio', technologies: ['TypeScript', 'Next.js'] }],
        skills: ['TypeScript', 'React', 'SQL'],
        skillGroups: [{ name: 'Languages', skills: ['TypeScript', 'SQL'] }],
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
      // What the shipped runtime really records for this workflow.
      totalTokensUsed: { input: 0, output: 0 },
      startedAt: 'now',
    },
    ...overrides,
  };
}

function seams(overrides: Partial<ResumeLabRunOptions> = {}): ResumeLabRunOptions {
  return {
    canRun: true,
    aiAvailable: true,
    userId: 'admin_test',
    readPages: async () => ({ pages: 2, via: 'test' }),
    extractText: async () => EXTRACTED,
    runAgent: async () => agentResult(),
    observeUsage: fixedProbe(REAL_CALLS),
    ...overrides,
  };
}

async function run(overrides: Partial<ResumeLabRunOptions> = {}): Promise<ResumeLabRunResult> {
  return runResumeLab(
    { source: 'upload', bytes: pdfBytes(), filename: 'cv.pdf', declaredType: ACCEPTED_TYPE },
    seams(overrides)
  );
}

describe('the telemetry architecture, as it actually is', () => {
  it('reads provider usage in the AI client and throws it away in both stages', () => {
    // The finding item 22 rests on. If any of these three stops being true,
    // the lab's whole account of token usage needs rewriting.
    const client = read('lib/ai-client.ts');
    expect(client).toContain('input: response.usage?.prompt_tokens ?? 0');
    expect(client).toContain('output: response.usage?.completion_tokens ?? 0');

    // `parseResumeTextWithAI` takes the meta and returns only the data.
    const service = read('services/import/resume-ai.service.ts');
    expect(service).toContain('const { data, meta } = await executeAICall<ParsedResumeAI>(');
    expect(service).toContain('return validateAndCleanResponse(data);');

    // The Follio rewrite does not even destructure it.
    const rewrite = read('services/agents/resume-parse/rewrite-for-follio.ts');
    expect(rewrite).toContain('const { data: raw } = await executeAICall<FollioVoiceDraft>(');

    // So the workflow branch of the runtime has nothing to accumulate. The
    // single `addTokens` call sits in the tool-agent branch, which this
    // pipeline never enters.
    const runtime = read('lib/agents/runtime.ts');
    const workflow = runtime.slice(
      runtime.indexOf('async function runWorkflowAgent'),
      runtime.indexOf('async function runToolAgent')
    );
    expect(workflow.length).toBeGreaterThan(200);
    expect(workflow).not.toContain('addTokens(');
    expect(runtime.match(/^\s*addTokens\(/gm)).toHaveLength(1);
    const toolAgent = runtime.slice(runtime.indexOf('async function runToolAgent'));
    expect(toolAgent).toContain('addTokens(run.totalTokensUsed, meta.tokensUsed);');
  });

  it('observes only this pipeline’s stages, and only the five fields it needs', () => {
    expect(Object.keys(RESUME_PIPELINE_STAGES).sort()).toEqual(['follioVoice', 'resumeParse']);

    const source = read(TELEMETRY);
    // The probe restores what it replaced, whatever happens.
    expect(source).toContain('console.log = original;');
    expect(source).toContain('} finally {');
    // And forwards everything, so the lab watches output rather than eating it.
    expect(source).toContain('original(...args);');
    // Nothing is persisted and nothing is logged by the probe itself. Matched
    // against imports and call sites: the doc comment names `lib/logger.ts`
    // to explain whose output it reads.
    expect(source).not.toMatch(/from '[^']*logger/);
    expect(executableOf(source)).not.toMatch(/writeFileSync|appendFileSync|logger\./);
  });

  it('parses the logger’s own JSON in both of its output shapes', async () => {
    const probe = createUsageProbe();
    await probe.observe(async () => {
      // Development: the message line, then the context as pretty JSON.
      console.log(
        '\u001b[90m2026-10-14T00:00:00.000Z\u001b[0m \u001b[32m[INFO]\u001b[0m [resumeParse] Chat completion finished'
      );
      console.log(
        '  Context:',
        JSON.stringify({
          source: 'ai-client',
          durationMs: 11,
          tokensInput: 7,
          tokensOutput: 3,
          model: 'gpt-4o-mini',
        })
      );
      // Production: one JSON line carrying both.
      console.log(
        JSON.stringify({
          level: 'info',
          message: '[follioVoice] Chat completion finished',
          context: {
            source: 'ai-client',
            durationMs: 5,
            tokensInput: 2,
            tokensOutput: 1,
            model: 'gpt-4o',
          },
        })
      );
    });

    expect(probe.calls).toEqual([
      {
        stage: 'resumeParse',
        model: 'gpt-4o-mini',
        inputTokens: 7,
        outputTokens: 3,
        durationMs: 11,
      },
      { stage: 'follioVoice', model: 'gpt-4o', inputTokens: 2, outputTokens: 1, durationMs: 5 },
    ]);
  });

  it('ignores output that is not an ai-client completion for this pipeline', async () => {
    const probe = createUsageProbe();
    await probe.observe(async () => {
      console.log('just a line');
      console.log('[narrativeGeneration] Chat completion finished');
      console.log(
        '  Context:',
        JSON.stringify({
          source: 'ai-client',
          tokensInput: 999,
          tokensOutput: 999,
          model: 'gpt-4o',
        })
      );
      console.log('[resumeParse] Starting chat completion');
      console.log('  Context:', JSON.stringify({ source: 'ai-client', model: 'gpt-4o-mini' }));
    });

    // A different feature's stage, and a start line with no usage: neither counts.
    expect(probe.calls).toEqual([]);
  });

  it('restores console even when the body throws', async () => {
    const probe = createUsageProbe();
    const original = console.log;

    await expect(
      probe.observe(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(console.log).toBe(original);
  });
});

describe('token usage: observed, estimated, unavailable', () => {
  it('surfaces provider-observed usage when the run produced it', async () => {
    const result = await run();
    const usage = result.ai!.usage;

    expect(usage.status).toBe('observed');
    expect(usage.inputTokens).toBe(2200);
    expect(usage.outputTokens).toBe(960);
    expect(usage.totalTokens).toBe(3160);
    expect(usage.source).toContain('Reported by the provider');
    expect(usage.calls.map((call) => call.stage)).toEqual(['resumeParse', 'follioVoice']);
  });

  it('keeps the arithmetic consistent at every level', async () => {
    const usage = (await run()).ai!.usage;

    for (const call of usage.calls) {
      expect(call.totalTokens).toBe(call.inputTokens + call.outputTokens);
    }
    expect(usage.inputTokens).toBe(usage.calls.reduce((sum, c) => sum + c.inputTokens, 0));
    expect(usage.outputTokens).toBe(usage.calls.reduce((sum, c) => sum + c.outputTokens, 0));
    expect(usage.totalTokens).toBe(usage.inputTokens! + usage.outputTokens!);
  });

  it('reports unavailable — not zero — when nothing was observed', async () => {
    const result = await run({ observeUsage: fixedProbe([]) });
    const usage = result.ai!.usage;

    expect(usage.status).toBe('unavailable');
    expect(usage.inputTokens).toBeNull();
    expect(usage.outputTokens).toBeNull();
    expect(usage.totalTokens).toBeNull();
    // The distinction the item exists for.
    expect(usage.inputTokens).not.toBe(0);
    expect(usage.calls).toEqual([]);
  });

  it('never promotes the AgentRun zero into the usage figures', async () => {
    const result = await run();
    const usage = result.ai!.usage;

    // The row really does say 0/0 for this workflow...
    expect(usage.agentRunRecorded).toEqual({ input: 0, output: 0 });
    // ...and the observed usage is nothing like it.
    expect(usage.totalTokens).toBe(3160);
    expect(usage.agentRunNote).toContain('missing telemetry, not a measurement');
  });

  it('keeps the three statuses from collapsing', () => {
    // `estimated` exists so a future derived number cannot be filed as an
    // observation. The lab does not produce one, and says why rather than
    // leaving a reader to wonder.
    const types = read('_admin-panel/platform/labs/resume-import-ai/types.ts');
    expect(types).toContain("'observed' | 'estimated' | 'unavailable'");
    expect(types).toContain('The lab never produces this');
    expect(read(DIAGNOSTICS)).not.toMatch(/status: 'estimated'/);
    // And nothing tokenizes text to manufacture a count.
    expect(read(DIAGNOSTICS)).not.toMatch(/tiktoken|encode\(|\/ 4\b|chars? \/ 4/);
  });
});

describe('cost', () => {
  it('prices the run from the models that actually ran', async () => {
    const cost = (await run()).ai!.cost;

    // 1800 in + 900 out on gpt-4o-mini, 400 in + 60 out on gpt-4o.
    const mini = MODEL_PRICING['gpt-4o-mini'];
    const full = MODEL_PRICING['gpt-4o'];
    const expectedInput = (1800 / 1e6) * mini.inputPerMillion + (400 / 1e6) * full.inputPerMillion;
    const expectedOutput = (900 / 1e6) * mini.outputPerMillion + (60 / 1e6) * full.outputPerMillion;

    expect(cost.status).toBe('available');
    expect(cost.inputUsd).toBeCloseTo(expectedInput, 6);
    expect(cost.outputUsd).toBeCloseTo(expectedOutput, 6);
    expect(cost.totalUsd).toBeCloseTo(expectedInput + expectedOutput, 6);
    expect(cost.basis).toBe('observed');
    expect(cost.models.sort()).toEqual(['gpt-4o', 'gpt-4o-mini']);
    expect(cost.pricingSource).toBe(PRICING_SOURCE);
  });

  it('is unavailable, not $0, when usage is unavailable', async () => {
    const cost = (await run({ observeUsage: fixedProbe([]) })).ai!.cost;

    expect(cost.status).toBe('usage-unavailable');
    expect(cost.totalUsd).toBeNull();
    expect(cost.inputUsd).toBeNull();
    expect(cost.outputUsd).toBeNull();
    expect(cost.basis).toBeNull();
    expect(cost.note).toContain('not the same as zero');
  });

  it('says pricing-unavailable rather than guessing an unknown model', async () => {
    const result = await run({
      observeUsage: fixedProbe([
        {
          stage: 'resumeParse',
          model: 'gpt-6-unreleased',
          inputTokens: 10,
          outputTokens: 5,
          durationMs: 1,
        },
      ]),
    });
    const cost = result.ai!.cost;

    expect(priceFor('gpt-6-unreleased')).toBeNull();
    expect(cost.status).toBe('pricing-unavailable');
    expect(cost.totalUsd).toBeNull();
    expect(cost.unpricedModels).toEqual(['gpt-6-unreleased']);
  });

  it('reports partial rather than a total that leaves a call out', () => {
    const calls: ResumeLabAiCall[] = [
      {
        stage: 'resumeParse',
        label: 'a',
        model: 'gpt-4o-mini',
        inputTokens: 1_000_000,
        outputTokens: 0,
        totalTokens: 1_000_000,
        durationMs: 1,
        maxOutputTokens: null,
        cost: {
          status: 'available',
          inputUsd: 0.15,
          outputUsd: 0,
          totalUsd: 0.15,
          basis: 'observed',
          pricingSource: PRICING_SOURCE,
          models: ['gpt-4o-mini'],
          unpricedModels: [],
          note: '',
        },
      },
      {
        stage: 'follioVoice',
        label: 'b',
        model: 'mystery-model',
        inputTokens: 100,
        outputTokens: 10,
        totalTokens: 110,
        durationMs: 1,
        maxOutputTokens: null,
        cost: {
          status: 'pricing-unavailable',
          inputUsd: null,
          outputUsd: null,
          totalUsd: null,
          basis: 'observed',
          pricingSource: null,
          models: ['mystery-model'],
          unpricedModels: ['mystery-model'],
          note: '',
        },
      },
    ];

    const cost = costForRun(calls, 'observed');
    expect(cost.status).toBe('partial');
    expect(cost.totalUsd).toBeCloseTo(0.15, 6);
    expect(cost.unpricedModels).toEqual(['mystery-model']);
    expect(cost.note).toContain('the real total is higher');
  });

  it('is the repository’s only pricing source, and says where it came from', () => {
    const pricing = read(PRICING);

    expect(pricing).toContain('2026-10-14');
    expect(pricing).toContain('OpenAI');
    // The repo's own note about gpt-4o-mini still agrees with the table.
    expect(read('services/import/resume-ai.service.ts')).toContain(
      '~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens'
    );
    expect(MODEL_PRICING['gpt-4o-mini']).toEqual({ inputPerMillion: 0.15, outputPerMillion: 0.6 });
    expect(MODEL_PRICING['gpt-4o']).toEqual({ inputPerMillion: 2.5, outputPerMillion: 10.0 });
    // Cheaper real rates exist and are not modelled; the file admits it.
    expect(pricing).toContain('cached');
  });
});

describe('entities', () => {
  it('counts the shipped schema’s sections, and totals them exactly', async () => {
    const entities = (await run()).entities!;
    const count = (type: string) => entities.byType.find((e) => e.type === type)!.count;

    expect(count('experiences')).toBe(2);
    expect(count('educations')).toBe(1);
    expect(count('projects')).toBe(1);
    expect(count('skills')).toBe(3);
    expect(count('skillGroups')).toBe(1);
    expect(count('links')).toBe(1);
    expect(count('certifications')).toBe(0);
    expect(count('profileFields')).toBe(4);
    expect(count('contactFields')).toBe(2);

    expect(entities.total).toBe(entities.byType.reduce((sum, e) => sum + e.count, 0));
    expect(entities.total).toBe(15);
  });

  it('keeps nested items out of the total, and says so', async () => {
    const entities = (await run()).entities!;
    const nested = (type: string) => entities.nested.find((e) => e.type === type)!.count;

    expect(nested('experienceBullets')).toBe(3);
    expect(nested('projectTechnologies')).toBe(2);
    expect(nested('groupedSkills')).toBe(2);

    const nestedTotal = entities.nested.reduce((sum, e) => sum + e.count, 0);
    expect(entities.total).not.toBe(entities.total + nestedTotal);
    expect(entities.total).toBe(entities.byType.reduce((sum, e) => sum + e.count, 0));
    expect(entities.rule).toContain('excluded from total');
  });

  it('covers every array section of NormalizedResumeData', () => {
    // If the shipped schema grows a section, this fails rather than the lab
    // quietly under-counting.
    const service = read('services/import/resume-ai.service.ts');
    const shape = service.slice(
      service.indexOf('export interface NormalizedResumeData'),
      service.indexOf('export interface ImportResult')
    );
    const sections = [...shape.matchAll(/^\s{2}(\w+)\??:\s*(?:Array<|string\[\])/gm)].map(
      (match) => match[1]
    );

    const counted = buildEntities({}).byType.map((entry) => entry.type);
    for (const section of sections) {
      expect(counted, `${section} must be counted`).toContain(section);
    }
  });

  it('asks no model anything', () => {
    const source = read(DIAGNOSTICS);
    expect(source).not.toMatch(/executeAICall|executeChatCompletion|runResumeParseAgent|openai/i);
  });
});

describe('warnings', () => {
  it('are deterministic: the same run yields the same codes', async () => {
    const first = await run();
    const second = await run();

    expect(first.warnings.map((w) => w.code)).toEqual(second.warnings.map((w) => w.code));
  });

  it('flag the AgentRun zero as information, not alarm', async () => {
    const warning = (await run()).warnings.find(
      (w) => w.code === 'agent-run-usage-not-propagated'
    )!;

    expect(warning.severity).toBe('info');
    expect(warning.message).toContain('describes the record, not the run');
    expect(warning.evidence).toContain('3160');
  });

  it('flag missing telemetry when an AI stage ran and reported nothing', async () => {
    const warnings = (await run({ observeUsage: fixedProbe([]) })).warnings;
    const telemetry = warnings.find((w) => w.code === 'telemetry-unavailable')!;

    expect(telemetry.severity).toBe('warning');
    expect(telemetry.message).toContain('not zero');
  });

  it('do not fire falsely on a healthy run', async () => {
    const warnings = await run().then((result) => result.warnings);
    const severe = warnings.filter((w) => w.severity !== 'info');

    expect(severe.map((w) => w.code)).toEqual([]);
    // The one note that does fire is the honest standing finding.
    expect(warnings.map((w) => w.code)).toEqual(['agent-run-usage-not-propagated']);
  });

  it('catch an empty parse of substantial text', () => {
    const warnings = buildWarnings({
      sizes: {
        inputBytes: 1000,
        pages: 2,
        extractedChars: 5000,
        extractedBytes: 5000,
        parserInputChars: 5000,
        parsedJsonChars: 2,
      },
      retention: null,
      entities: buildEntities({}),
      ai: null,
      confidence: null,
      reportedModel: null,
      maxUploadBytes: MAX_UPLOAD_BYTES,
    });

    const empty = warnings.find((w) => w.code === 'empty-parse')!;
    expect(empty.severity).toBe('error');
    expect(empty.evidence).toContain('5000');
    expect(warnings.map((w) => w.code)).toContain('no-experiences');
    expect(warnings.map((w) => w.code)).toContain('no-skills');
  });

  it('catch dropped characters, thin extraction and low confidence', () => {
    const warnings = buildWarnings({
      sizes: {
        inputBytes: 10,
        pages: 1,
        extractedChars: 200,
        extractedBytes: 200,
        parserInputChars: 150,
        parsedJsonChars: 10,
      },
      retention: {
        extractedChars: 200,
        keptChars: 150,
        droppedChars: 50,
        keptPercent: 75,
        note: '',
      },
      entities: null,
      ai: null,
      confidence: 0.2,
      reportedModel: null,
      maxUploadBytes: MAX_UPLOAD_BYTES,
    });
    const codes = warnings.map((w) => w.code);

    expect(codes).toContain('characters-dropped');
    expect(codes).toContain('thin-extraction');
    expect(codes).toContain('low-confidence');
    expect(warnings.find((w) => w.code === 'characters-dropped')!.evidence).toBe('75% kept');
  });

  it('catch a completion that hit its configured cap', async () => {
    const result = await run({
      observeUsage: fixedProbe([
        {
          stage: 'resumeParse',
          model: 'gpt-4o-mini',
          inputTokens: 100,
          outputTokens: 4096,
          durationMs: 1,
        },
      ]),
    });
    const capped = result.warnings.find((w) => w.code === 'output-near-max-tokens')!;

    // 4096 is `MAX_TOKENS.resumeParse` in `lib/ai-client.ts`, read from the
    // shipped config rather than written down here.
    expect(read('lib/ai-client.ts')).toContain('resumeParse: 4096');
    expect(capped.evidence).toBe('4096 / 4096');
    expect(result.ai!.usage.calls[0].maxOutputTokens).toBe(4096);
  });

  it('catch the service’s model constant disagreeing with the provider', async () => {
    const result = await run({
      observeUsage: fixedProbe([
        { stage: 'resumeParse', model: 'gpt-4o', inputTokens: 10, outputTokens: 5, durationMs: 1 },
      ]),
    });
    const mismatch = result.warnings.find((w) => w.code === 'model-constant-mismatch')!;

    // The parse result claims gpt-4o-mini because the service stamps a
    // constant of its own; the provider answered as gpt-4o.
    expect(mismatch.evidence).toBe('gpt-4o-mini vs gpt-4o');
    expect(read('services/import/resume-ai.service.ts')).toContain(
      "const OPENAI_MODEL = 'gpt-4o-mini'"
    );
  });

  it('warn when a stage reports twice, instead of silently inflating the total', async () => {
    const twice: ObservedAiCall[] = [REAL_CALLS[0], REAL_CALLS[0]];
    const result = await run({ observeUsage: fixedProbe(twice) });

    const duplicate = result.warnings.find((w) => w.code === 'duplicate-stage-telemetry')!;
    expect(duplicate.severity).toBe('warning');
    expect(duplicate.evidence).toBe('2 completions');
  });

  it('are never generated by a model', () => {
    const source = read(DIAGNOSTICS);
    const warningsSection = source.slice(source.indexOf('export function buildWarnings'));

    expect(warningsSection).not.toMatch(/await |executeAICall|fetch\(/);
  });
});

describe('raw payloads', () => {
  it('carry the run’s own text, matching what the pipeline handled', async () => {
    const result = await run();
    const byId = new Map(result.payloads.map((payload) => [payload.id, payload]));

    const extracted = byId.get('extracted-text')!;
    expect(extracted.preview).toBe(EXTRACTED);
    expect(extracted.chars).toBe(EXTRACTED.length);
    expect(extracted.chars).toBe(result.sizes.extractedChars);

    const parserInput = byId.get('parser-input')!;
    expect(parserInput.chars).toBe(result.sizes.parserInputChars);
    expect(parserInput.note).toContain('unchanged');

    const parsed = byId.get('parsed-resume')!;
    expect(parsed.kind).toBe('json');
    expect(parsed.chars).toBe(result.sizes.parsedJsonChars);
    expect(JSON.parse(parsed.preview)).toMatchObject({ profile: { firstName: 'Alex' } });

    const steps = byId.get('agent-steps')!;
    expect(JSON.parse(steps.preview)).toHaveLength(4);

    const telemetry = byId.get('ai-telemetry')!;
    expect(JSON.parse(telemetry.preview)).toEqual(REAL_CALLS);
  });

  it('cap the preview while keeping the true size', async () => {
    const huge = 'A'.repeat(PAYLOAD_PREVIEW_CHARS * 3);
    const result = await run({ extractText: async () => huge });
    const extracted = result.payloads.find((p) => p.id === 'extracted-text')!;

    expect(extracted.truncated).toBe(true);
    expect(extracted.preview).toHaveLength(PAYLOAD_PREVIEW_CHARS);
    // The metadata still describes all of it.
    expect(extracted.chars).toBe(huge.length);
    expect(extracted.bytes).toBe(Buffer.byteLength(huge, 'utf8'));
    expect(extracted.chars).toBe(result.sizes.extractedChars);
  });

  it('do not truncate what fits, and say so by omission', async () => {
    const extracted = (await run()).payloads.find((p) => p.id === 'extracted-text')!;

    expect(extracted.truncated).toBe(false);
    expect(extracted.preview).toHaveLength(extracted.chars);
  });

  it('contain no upload bytes and no secrets', async () => {
    const secret = 'sk-test-not-a-real-key-0123456789';
    process.env.RESUME_LAB_PROBE_SECRET = secret;
    try {
      const result = await run();
      const serialized = JSON.stringify(result.payloads);

      // The PDF's own bytes never become a payload; its text does.
      expect(serialized).not.toContain('%PDF');
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toMatch(/OPENAI_API_KEY|Authorization|Bearer |clerk/i);
      expect(result.payloads.every((p) => p.kind === 'text' || p.kind === 'json')).toBe(true);
    } finally {
      delete process.env.RESUME_LAB_PROBE_SECRET;
    }
  });

  it('name what the pipeline cannot show rather than re-running a stage', async () => {
    const missing = (await run()).missingPayloads;

    expect(missing.map((entry) => entry.id)).toEqual([
      'raw-parse-output',
      'pre-rewrite-normalized',
      'provider-exchange',
    ]);
    expect(missing[0].reason).toContain('a different call');
    expect(missing[2].reason).toContain('credentials');
    // And the claim is true: the agent really does return only the normalized
    // object, and the rewrite step really does overwrite the same memory key.
    const agent = read('services/agents/resume-parse/resume-parse.agent.ts');
    expect(agent).toContain("memory.set('normalized', voiced);");
    expect(agent).toContain("const data = memory.get<NormalizedResumeData>('normalized');");
  });

  it('are never written anywhere', () => {
    for (const file of [RUNNER, DIAGNOSTICS, TELEMETRY, PRICING, COMPONENT, RUN_ROUTE, LAB_PAGE]) {
      // Executable text only: these files discuss logging and persistence in
      // their own comments, to explain that they do neither.
      const source = executableOf(read(file));
      expect(source, `${file} must not write`).not.toMatch(
        /writeFileSync|appendFileSync|mkdirSync|renameSync/
      );
      expect(source, `${file} must not reach Prisma`).not.toMatch(/@\/lib\/db|prisma\./i);
      expect(source, `${file} must not log payloads`).not.toMatch(
        /logger\.|console\.(log|info|warn|error)\(/
      );
    }
  });
});

describe('one model call, and no product write', () => {
  it('invokes the shipped agent exactly once per run', async () => {
    let agentCalls = 0;
    let extractCalls = 0;

    const result = await run({
      extractText: async () => {
        extractCalls += 1;
        return EXTRACTED;
      },
      runAgent: async () => {
        agentCalls += 1;
        return agentResult();
      },
    });

    expect(agentCalls).toBe(1);
    expect(extractCalls).toBe(1);
    // All of item 22 came out of that single execution.
    expect(result.ai!.usage.status).toBe('observed');
    expect(result.entities!.total).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.payloads.length).toBe(5);
  });

  it('opens no provider client of its own', () => {
    for (const file of [RUNNER, DIAGNOSTICS, TELEMETRY, PRICING]) {
      const source = read(file);
      expect(source, `${file} must not call a provider`).not.toMatch(
        /from 'openai'|new OpenAI|executeAICall\(|executeChatCompletion\(|fetch\(/
      );
    }
    // The one product import diagnostics makes is a config read, not a call.
    expect(read(DIAGNOSTICS)).toContain(
      "import { getStageConfig, type PipelineStage } from '@/lib/ai-client';"
    );
  });

  it('still never reaches the save path (item 21, not weakened)', () => {
    // Re-asserted here so item 22's new files are inside the same guarantee.
    for (const file of [RUNNER, DIAGNOSTICS, TELEMETRY, PRICING, COMPONENT, RUN_ROUTE, LAB_PAGE]) {
      const source = read(file);
      const executable = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/`(?:[^`\\]|\\.)*`/g, '``');

      expect(executable, `${file} must not reach the save path`).not.toContain(
        'saveAIResumeToProfile'
      );
      expect(executable, `${file} must not pass saveToProfile`).not.toMatch(/saveToProfile/);
    }
  });

  it('keeps the run route behind admin auth and the local-only gate', () => {
    const route = read(RUN_ROUTE);
    const handler = route.slice(route.indexOf('export async function POST'));

    expect(route).toMatch(/await requireAdmin\(\)/);
    expect(route).toContain('assertCanRunDeveloperSuites()');
    expect(handler.indexOf('assertCanRunDeveloperSuites')).toBeLessThan(
      handler.indexOf('runResumeLab')
    );
  });
});

describe('item 21 is intact', () => {
  it('leaves timing, sizes and retention exactly as they were', async () => {
    const result = await run();

    expect(result.timing.stages.map((s) => s.id).slice(0, 4)).toEqual([
      'input',
      'pages',
      'extract',
      'agent',
    ]);
    expect(result.sizes.extractedChars).toBe(EXTRACTED.length);
    expect(result.sizes.parserInputChars).toBe(EXTRACTED.length);
    expect(result.retention!.keptChars + result.retention!.droppedChars).toBe(
      result.retention!.extractedChars
    );
    expect(result.retention!.droppedChars).toBe(0);
    // And the item-21 AgentRun reading is still its own field.
    expect(result.tokens).toMatchObject({ input: 0, output: 0, total: 0 });
  });

  it('reports usage spent before a mid-run failure', async () => {
    const result = await run({
      runAgent: async () => {
        throw new Error('model refused');
      },
      observeUsage: fixedProbe([REAL_CALLS[0]]),
    });

    expect(result.outcome).toBe('agent-failed');
    // Those tokens were really spent; the failure does not make them free.
    expect(result.ai!.usage.status).toBe('observed');
    expect(result.ai!.usage.totalTokens).toBe(2700);
    expect(result.ai!.cost.totalUsd).toBeGreaterThan(0);
  });

  it('adds no diagnostics to a run that never started', async () => {
    const result = await runResumeLab(
      { source: 'upload', bytes: Buffer.alloc(0), filename: 'cv.pdf' },
      seams()
    );

    expect(result.outcome).toBe('no-input');
    expect(result.ai).toBeNull();
    expect(result.entities).toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.payloads).toEqual([]);
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

  it('keeps the item-21 sections and no longer promises item 22', () => {
    const text = textOf(renderToStaticMarkup(<ResumeLab view={view} />));

    expect(text).toContain('Diagnostic only');
    expect(text).toContain('Nothing is saved to Follio');
    expect(text).not.toContain('item 22');
  });

  it('renders usage, cost, entities, warnings and payloads from the result', () => {
    // The component is rendered through its own result type, so what the UI
    // shows is what a run produced.
    const source = read(COMPONENT);

    expect(source).toContain('function AiUsage(');
    expect(source).toContain('function Entities(');
    expect(source).toContain('function Warnings(');
    expect(source).toContain('function Payloads(');
    // No arithmetic in the view: every figure is read, not computed.
    expect(source).not.toMatch(/inputTokens \+ |\* price|\/ 1_000_000|1e6/);
  });

  it('never prints a dollar amount for an unknown cost', () => {
    const source = read(COMPONENT);

    // `usd(null)` is the only path for a missing figure, and it is a word.
    expect(source).toContain("if (value === null) return 'unknown';");
    expect(executableOf(source)).not.toMatch(/\$0\.00|toFixed\(2\)/);
    // Four decimals, because a real resume parse costs fractions of a cent.
    expect(source).toContain('toFixed(4)');
  });

  it('shows the AgentRun zero as its own labelled line', () => {
    const source = read(COMPONENT);

    expect(source).toContain('AgentRun recorded:');
    expect(source).toContain('usage.agentRunNote');
    // The status word is rendered, so observed/unavailable is never implicit.
    expect(source).toContain('{usage.status}');
  });

  it('says payloads are not persisted', () => {
    const source = read(COMPONENT);

    expect(source).toContain('never written to disk, never logged, never stored');
    expect(source).not.toMatch(/dangerouslySetInnerHTML/);
  });
});
