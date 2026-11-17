/**
 * Local Resume Agent harness — files in, JSON out.
 *
 * Runs the same analysis, scoring and grounding the Resume Agent runs, against
 * fixture files instead of a database. No Prisma, no Clerk, no HTTP, and by
 * default no OpenAI.
 *
 * Nothing here is imported by the app. Every function it calls is the real
 * production one; this file only loads fixtures and prints what came back.
 *
 *   npx tsx local-tests/resume-agent/run.ts
 *   npx tsx local-tests/resume-agent/run.ts --json
 *   npx tsx local-tests/resume-agent/run.ts --out results.json
 *   npx tsx local-tests/resume-agent/run.ts --live        (needs OPENAI_API_KEY)
 *
 * Only requirement extraction needs a model. With `--live` it calls the real
 * extractor; without it, `sample-requirements.json` stands in, so the whole
 * run is offline and deterministic.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { toResumeLinesView } from '@/lib/ai-connector/resume-edits';
import { hasPlaceholder } from '@/lib/resume-edit/types';
import { evaluateResume } from '@/services/ai/evaluate';
import { buildEditFacts, type EditSourceProfile } from '@/services/ai/resume-edit/facts';
import { groundAssistantEdits } from '@/services/ai/resume-edit/assistant';

import type { RequirementMatch } from '@/services/ai/evaluate';
import type { JobRequirement } from '@/services/ai/job-requirements/types';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Fixture shapes. Validated so a typo in a fixture is a clear message rather
// than an undefined three frames deep inside the scorer.
// ---------------------------------------------------------------------------

const resumeSchema = z.object({
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  workExperiences: z
    .array(
      z.object({
        id: z.string().min(1),
        company: z.string(),
        role: z.string(),
        startDate: z.string().nullable(),
        endDate: z.string().nullable(),
        isCurrent: z.boolean(),
        bullets: z.array(z.string()),
        bulletsHtml: z.string().nullable(),
        isVisible: z.boolean(),
      })
    )
    .min(1, 'Add at least one experience entry.'),
  skills: z.array(z.object({ name: z.string() })),
  educations: z.array(
    z.object({
      institution: z.string(),
      degree: z.string().nullable(),
      fieldOfStudy: z.string().nullable(),
    })
  ),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string() })),
  projects: z.array(
    z.object({
      title: z.string(),
      description: z.string().nullable(),
      techStack: z.array(z.string()),
    })
  ),
});

const requirementsSchema = z.object({
  requirements: z.array(
    z.object({
      term: z.string().min(1),
      kind: z.enum(['tool', 'practice', 'domain', 'credential']),
      importance: z.enum(['required', 'preferred']),
      aliases: z.array(z.string()),
      broader: z.array(z.string()).optional(),
    })
  ),
});

const editsSchema = z.object({
  request: z.string().min(1),
  changes: z
    .array(
      z.object({
        ref: z.string().min(1),
        text: z.string().min(1).optional(),
        remove: z.boolean().optional(),
        reason: z.string().optional(),
        /** Fixture-only note; never passed to grounding. */
        expect: z.string().optional(),
      })
    )
    .min(1),
});

// ---------------------------------------------------------------------------

function loadJson<T>(file: string, schema: z.ZodType<T>): T {
  const path = resolve(HERE, file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${file} is not readable JSON: ${error instanceof Error ? error.message : error}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    fail(`${file} does not match the expected shape:\n${issues}`);
  }
  return parsed.data;
}

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** Fixture dates are ISO strings; the production type wants Date | string | null. */
function toProfile(input: z.infer<typeof resumeSchema>): EditSourceProfile {
  return {
    ...input,
    workExperiences: input.workExperiences.map((item) => ({
      ...item,
      startDate: item.startDate ? new Date(item.startDate) : null,
      endDate: item.endDate ? new Date(item.endDate) : null,
    })),
  };
}

function matchLine(match: RequirementMatch): string {
  const mark = match.match === 'missing' ? '✖' : match.evidence === 'shown' ? '✔' : '•';
  const via = match.via ? ` (via ${match.via})` : '';
  const where = match.where.length > 0 ? ` [${match.where.join(', ')}]` : '';
  return `  ${mark} ${match.term.padEnd(14)} ${match.match}/${match.evidence}${via}${where}`;
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const live = args.has('--live');
  const jsonOnly = args.has('--json');
  const outIndex = process.argv.indexOf('--out');
  const outPath = outIndex > -1 ? process.argv[outIndex + 1] : null;

  const resume = toProfile(loadJson('sample-resume.json', resumeSchema));
  const jobDescription = readFileSync(resolve(HERE, 'sample-job-description.txt'), 'utf8').trim();
  const edits = loadJson('sample-edits.json', editsSchema);

  if (!jobDescription) fail('sample-job-description.txt is empty.');

  // 1. Facts — the same view every agent tool reads the resume through.
  const facts = buildEditFacts(resume);

  // 2. The refs the agent would be offered. A role written as paragraphs or
  //    nested lists comes back read-only and exposes no bullet refs at all,
  //    which is the usual reason a propose run has nothing to work with.
  const lines = toResumeLinesView(facts);
  const editableRoles = facts.experiences.filter((item) => item.editable);
  const bulletRefs = editableRoles.flatMap((item) => item.bullets.map((bullet) => bullet.ref));

  // 3. Requirements: the only step that needs a model.
  let requirements: JobRequirement[];
  let requirementSource: string;
  if (live) {
    if (!process.env.OPENAI_API_KEY) {
      fail('--live needs OPENAI_API_KEY. Drop the flag to use sample-requirements.json.');
    }
    const { readJobRequirements } = await import('@/services/ai/job-requirements');
    const read = await readJobRequirements(jobDescription);
    if (read === null) fail('The extractor could not read this posting.');
    requirements = read;
    requirementSource = 'readJobRequirements (live model call)';
  } else {
    requirements = loadJson('sample-requirements.json', requirementsSchema).requirements;
    requirementSource = 'sample-requirements.json (offline fixture)';
  }

  // 4. Scoring — code, not a model.
  const evaluation = evaluateResume(facts, jobDescription, requirements);
  const matches = evaluation.skills?.matches ?? [];

  // 5. Grounding — the real anti-invention checks, on the real proposed edits.
  const grounded = groundAssistantEdits(facts, {
    changes: edits.changes.map(({ ref, text, remove, reason }) => ({ ref, text, remove, reason })),
    instructions: edits.request,
    jobDescription,
  });

  // `groundRewrite` sets `id` to the ref it resolved; `target` is the line it
  // points at and carries no ref of its own.
  const keptByRef = new Map(grounded.changes.map((change) => [change.id, change]));
  const verdicts = edits.changes.map((change) => {
    const kept = keptByRef.get(change.ref);
    return {
      ref: change.ref,
      expected: change.expect ?? null,
      outcome: kept ? (hasPlaceholder(kept.after) ? 'kept (needs a number)' : 'kept') : 'not saved',
      before: kept?.before ?? null,
      after: kept?.after ?? null,
      proposed: change.text ?? null,
    };
  });

  const result = {
    resume: {
      summaryPresent: Boolean(facts.summary.trim()),
      roles: facts.experiences.length,
      editableRoles: editableRoles.length,
      editableBulletRefs: bulletRefs,
      skills: facts.skills,
    },
    requirements: { source: requirementSource, count: requirements.length, requirements },
    scores: {
      requirementMatch: evaluation.skills?.score ?? null,
      keywordCoverage: evaluation.job?.coverage ?? null,
      writing: evaluation.writing,
    },
    strengths: matches
      .filter((match) => match.match !== 'missing' && match.evidence !== 'missing')
      .map((match) => ({
        term: match.term,
        importance: match.importance,
        match: match.match,
        evidence: match.evidence,
        where: match.where,
        via: match.via,
      })),
    missingRequirements: matches
      .filter((match) => match.match === 'missing')
      .map((match) => ({ term: match.term, kind: match.kind, importance: match.importance })),
    grounding: {
      proposed: edits.changes.length,
      kept: grounded.changes.length,
      dropped: grounded.dropped,
      ignored: grounded.ignored,
      needsInput: grounded.changes.filter((change) => hasPlaceholder(change.after)).length,
      verdicts,
    },
    writingChecks: evaluation.checks.map((check) => ({
      id: check.id,
      score: check.score,
      summary: check.summary,
    })),
    linesViewRefs: {
      headline: lines.headline.ref,
      summary: lines.summary.ref,
      roles: lines.roles.map((role) => ({
        ref: role.ref,
        role: role.role,
        editable: 'bullets' in role,
      })),
    },
  };

  if (outPath) {
    writeFileSync(resolve(process.cwd(), outPath), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    if (!jsonOnly) console.log(`Wrote ${outPath}`);
  }

  if (jsonOnly) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // ---- readable summary -----------------------------------------------
  const r = result;
  console.log('\nResume Agent — local run');
  console.log('='.repeat(62));
  console.log(`Requirements from : ${r.requirements.source}`);
  console.log(
    `Resume            : ${r.resume.roles} roles (${r.resume.editableRoles} editable), ` +
      `${r.resume.editableBulletRefs.length} editable bullets`
  );
  if (r.resume.editableRoles < r.resume.roles) {
    console.log(
      '  ! Some roles are written as paragraphs or nested lists. The agent can read\n' +
        '    them but cannot rewrite their bullets.'
    );
  }

  console.log('\nScores');
  console.log(`  requirement match : ${r.scores.requirementMatch ?? '—'}`);
  console.log(`  keyword coverage  : ${r.scores.keywordCoverage ?? '—'}`);
  console.log(`  writing           : ${r.scores.writing ?? '—'}`);

  console.log(`\nRequirement match (${matches.length} terms, scored by code)`);
  for (const match of matches) console.log(matchLine(match));

  console.log('\nGrounding');
  console.log(
    `  proposed ${r.grounding.proposed} · kept ${r.grounding.kept} · ` +
      `dropped ${r.grounding.dropped} · ignored ${r.grounding.ignored}` +
      (r.grounding.needsInput > 0 ? ` · ${r.grounding.needsInput} need a number` : '')
  );
  for (const verdict of verdicts) {
    console.log(`\n  ${verdict.ref}  → ${verdict.outcome}`);
    if (verdict.expected) console.log(`     expected: ${verdict.expected}`);
    if (verdict.after && verdict.after !== verdict.proposed) {
      console.log(`     proposed: ${verdict.proposed}`);
      console.log(`     saved as: ${verdict.after}`);
    } else if (verdict.after) {
      console.log(`     saved as: ${verdict.after}`);
    }
  }

  console.log('\nNothing was written. This harness has no database and no apply path.\n');
}

main().catch((error: unknown) => {
  console.error('\n✖ Run failed:', error instanceof Error ? error.message : error, '\n');
  process.exit(1);
});
