/**
 * Prompt for AI resume edits. One call per batch (the summary, or one job
 * entry), so each call is small and a slow section does not hold up the rest.
 *
 * The model works like a resume writer: lines arrive already graded (the
 * same grades the builder's scores show), the requested playbooks say how to
 * fix them and in what order, and the rules are the final check.
 */

import {
  EDIT_PLACEHOLDER,
  EDIT_PRESETS,
  RESUME_EDIT_LIMITS,
  type ResumeEditBrief,
} from '@/lib/resume-edit/types';
import { gradeRole, lineIssue, LONG_LINE_WORDS } from '@/services/ai/evaluate';

import { INSERT_SUFFIX, type EditBatch, type EditFacts, type FactExperience } from './facts';
import { planWriting, type WritingPlan } from './plan';
import { formatPlaybook } from './playbooks';

const MAX_OPENERS_SHOWN = 12;

export const RESUME_EDIT_SYSTEM_PROMPT = `You are a professional resume writer. You return small, specific line edits, as JSON.

Return exactly:
{"changes":[
  {"ref":"E1.2","text":"the full rewritten line","reason":"why, under 15 words"},
  {"ref":"E1.2${INSERT_SUFFIX}","text":"a new bullet that goes right after E1.2","reason":"..."},
  {"ref":"E1.4","remove":true,"reason":"..."}
]}

How you work
1. Read the whole RESUME first: the person's level, the job they want, and what each role is about.
2. Some editable lines carry notes on what they lack for this request, such as "no number" or "opens with “Responsible for”". A line without notes already passes the selected playbooks; change it only when the job or the user's instructions call for it.
3. Apply the PLAYBOOKS in the order given. Each is one pass; a later pass works on the result of the earlier ones, and all passes on one line end up as one change.
4. Check every change against the rules below before you return it. Drop any change that fails.

Rules
1. Only rewrite or remove refs listed under EDITABLE, and only add after refs listed under ADD AFTER. At most one change per ref. Fewer, better changes beat cosmetic ones. An empty list is a valid answer.
2. Facts come only from RESUME and from the user's own instructions. Never add a tool, skill, employer, title, certification, team size, metric, or outcome they do not state.
3. TARGET JOB and JOB PLAN say what to emphasize and which words to prefer. They are not evidence about the candidate. Use a job's wording only when the resume already shows the same thing. The resume says "React" and the job says "React.js": fine. The job says "Kubernetes" and the resume never does: do not add it.
4. When a line would be stronger with a number you do not have, write ${EDIT_PLACEHOLDER} where the number goes, for example "Cut checkout latency by ${EDIT_PLACEHOLDER}%". Never guess a number. Keep every number the line already has.
5. Bullets: one sentence, under ${LONG_LINE_WORDS} words, open with an action verb, past tense unless the role is current. No first person. Do not merge or reorder lines.
6. Add a bullet only for something this role's lines do not say yet, usually a fact from the user's instructions. "E1.0${INSERT_SUFFIX}" adds it first. At most ${RESUME_EDIT_LIMITS.maxNewBulletsPerRole} new bullets per role.
7. Remove a bullet only when it repeats another line or adds nothing for this request. Leave every role at least ${RESUME_EDIT_LIMITS.minBulletsPerRole} bullets.
8. Summary: 2 to 4 sentences of plain text. Headline: under 12 words. Never change dates, employers, or job titles, and never raise seniority or ownership.
9. reason: plain language. Name the playbook, job keyword, or instruction the change serves.`;

function presetLines(brief: ResumeEditBrief): string[] {
  return EDIT_PRESETS.filter((preset) => brief.presets.includes(preset.id)).map(
    (preset) => `- ${preset.label}: ${preset.hint.toLowerCase()}.`
  );
}

/** What each line of the role in this batch lacks for the selected quick fixes. */
function bulletNotes(experience: FactExperience, brief: ResumeEditBrief): Map<string, string> {
  const notes = new Map<string, string>();
  const checks = EDIT_PRESETS.filter((preset) => brief.presets.includes(preset.id));
  if (checks.length === 0) return notes;
  const graded = gradeRole(experience.bullets.map((bullet) => bullet.text));
  experience.bullets.forEach((bullet, index) => {
    const line = graded[index];
    if (!line) return;
    const issues = checks.flatMap((check) => lineIssue(check.id, line) ?? []);
    if (issues.length > 0) notes.set(bullet.ref, issues.join('; '));
  });
  return notes;
}

function experienceBlock(facts: EditFacts, batch: EditBatch, brief: ResumeEditBrief): string[] {
  const lines: string[] = ['Experience:'];
  for (const item of facts.experiences) {
    const heading = `${item.label} (${item.dates})${item.isCurrent ? ' [current role]' : ''}`;
    if (batch.experience && item.id === batch.experience.id) {
      const notes = bulletNotes(item, brief);
      lines.push(heading);
      for (const bullet of item.bullets) {
        lines.push(`  [${bullet.ref}] ${bullet.text}`);
        const note = notes.get(bullet.ref);
        if (note) lines.push(`      notes: ${note}`);
      }
    } else if (!batch.experience) {
      lines.push(heading);
      for (const bullet of item.bullets.slice(0, 3)) lines.push(`  - ${bullet.text}`);
    } else {
      lines.push(`${heading} (context only)`);
    }
  }
  return lines;
}

/** Opening verbs other roles already use, so this role can avoid repeating them. */
function openersInUse(facts: EditFacts, batch: EditBatch): string[] {
  const seen = new Map<string, string>();
  for (const item of facts.experiences) {
    if (item.id === batch.experience?.id) continue;
    for (const line of gradeRole(item.bullets.map((bullet) => bullet.text))) {
      if (!line.signals.actionOpener || seen.has(line.signals.opener)) continue;
      const word = line.text.trim().split(/\s+/)[0] ?? '';
      seen.set(line.signals.opener, word.replace(/[^A-Za-z'’-]/g, ''));
    }
  }
  return [...seen.values()].filter(Boolean).slice(0, MAX_OPENERS_SHOWN);
}

export function buildResumeEditUserPrompt(
  facts: EditFacts,
  batch: EditBatch,
  brief: ResumeEditBrief,
  plan: WritingPlan = planWriting(facts, brief)
): string {
  const ask: string[] = presetLines(brief);
  if (brief.instructions?.trim()) {
    ask.push(`- From the user: """${brief.instructions.trim()}"""`);
  }
  if (ask.length === 0) ask.push('- Tailor the lines to the target job.');

  const resume: string[] = [];
  if (!batch.experience) {
    if (facts.headline) resume.push(`Headline [H]: ${facts.headline}`);
    if (facts.summary) resume.push(`Summary [S]:\n${facts.summary}`);
  } else if (facts.headline) {
    resume.push(`Headline: ${facts.headline}`);
  }
  resume.push(...experienceBlock(facts, batch, brief));
  if (facts.skills.length > 0) resume.push(`Skills: ${facts.skills.join(', ')}`);
  if (facts.education.length > 0) resume.push(`Education: ${facts.education.join('; ')}`);
  if (facts.other.length > 0) resume.push(`Also: ${facts.other.join('; ')}`);

  const sections = [`WHAT TO CHANGE\n${ask.join('\n')}`];
  if (plan.playbooks.length > 0) {
    sections.push(
      `PLAYBOOKS (apply in this order)\n${plan.playbooks
        .map((playbook, index) => formatPlaybook(playbook, index + 1))
        .join('\n\n')}`
    );
  }

  const job = brief.jobDescription?.trim();
  sections.push(
    job
      ? `TARGET JOB (aim at it; it is not evidence about the candidate)\n"""\n${job}\n"""`
      : 'TARGET JOB\nNone. Improve the lines for the instructions above.'
  );
  if (plan.job) {
    const shown = plan.job.onResume.join(', ') || 'none';
    const missing = plan.job.missing.join(', ') || 'none';
    sections.push(
      [
        'JOB PLAN',
        `On the resume already. Make these easy to find, in the posting's spelling: ${shown}`,
        plan.job.listedOnly.length > 0
          ? `Only in the skills list. Name one in a line only when that line already describes work that used it: ${plan.job.listedOnly.join(', ')}`
          : null,
        `Not on the resume. Gaps; never add these: ${missing}`,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
  if (batch.experience && brief.presets.includes('verbs')) {
    const openers = openersInUse(facts, batch);
    if (openers.length > 0) sections.push(`OPENERS IN USE (other roles): ${openers.join(', ')}`);
  }

  sections.push(`RESUME\n${resume.join('\n')}`);
  sections.push(`EDITABLE: ${batch.refs.join(', ')}`);
  if (batch.experience) {
    const after = [`${batch.experience.ref}.0`, ...batch.refs].map((ref) => ref + INSERT_SUFFIX);
    sections.push(`ADD AFTER: ${after.join(', ')}`);
  }
  return sections.join('\n\n');
}
