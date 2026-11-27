/**
 * How a professional resume writer applies each quick fix, step by step.
 *
 * The prompt sends only the playbooks a request asked for, in a fixed order:
 * tailor first (it decides what matters), outcomes (restructure), numbers
 * (evidence), verbs (openings), and tighten last (the others add words).
 * Connected assistants get the same playbooks, so every writer follows one method.
 */

import {
  EDIT_PLACEHOLDER,
  RESUME_EDIT_LIMITS,
  type EditPresetId,
  type ResumeEditBrief,
} from '@/lib/resume-edit/types';
import { LONG_LINE_WORDS } from '@/services/ai/evaluate/lines';

export type PlaybookId = EditPresetId | 'tailor';

export interface WritingPlaybook {
  id: PlaybookId;
  name: string;
  goal: string;
  steps: string[];
  doneWhen: string;
}

const B = EDIT_PLACEHOLDER;

export const WRITING_PLAYBOOKS: readonly WritingPlaybook[] = [
  {
    id: 'tailor',
    name: 'Tailor to the job',
    goal: 'Make what this job cares about easy to find, in the posting’s words where they are true.',
    steps: [
      'Use JOB PLAN: the job keywords the resume already shows, and the ones it does not.',
      'A keyword the resume shows but buries (vague wording, another spelling, low in a role): rewrite that line so the keyword reads plainly, in the posting’s spelling.',
      'A keyword the resume does not show is a gap. Never add it, and never hint at it.',
      'Headline and summary: name the target role in the posting’s words without raising seniority, and lead with the two or three strongest matches.',
      'A bullet with nothing for this job: tighten it, or remove it if the role keeps enough bullets.',
    ],
    doneWhen:
      'Every job keyword the resume truly shows appears in a bullet, not only in Skills. Nothing missing was added.',
  },
  {
    id: 'outcomes',
    name: 'Lead with outcomes',
    goal: 'The reader sees what changed before reading how.',
    steps: [
      'Split the line into action, method, and result.',
      'If it states a result, rebuild it as result first, then how: "Cut setup time 40% by rebuilding onboarding", not "Rebuilt onboarding, which cut setup time 40%".',
      'Open with a result verb: Cut, Grew, Raised, Saved, Reduced, Doubled.',
      'If the line states no result, leave it. Never invent one.',
      'Do this for the strongest two or three bullets in a role. Leave the rest varied.',
    ],
    doneWhen: 'The first bullet of each role states a result.',
  },
  {
    id: 'quantify',
    name: 'Add numbers',
    goal: 'Show size and effect, so a reader can tell a small win from a big one.',
    steps: [
      'Skip lines that already have a number. Keep every number exactly as written.',
      'For the rest, choose the one number that would prove the line: scale (users, customers, team size, budget), money (revenue, cost), time (hours saved, faster delivery), quality (errors, uptime), or reach (teams, regions).',
      `Use a number the resume or the user states. Otherwise write ${B} where it goes, with its unit: "used by ${B} sales reps", "cut costs ${B}%".`,
      'One number per line, two at most, next to the result it measures.',
      'Skip lines where a number would be forced, such as "Partnered with design".',
    ],
    doneWhen: `The top two bullets of each role carry a number or a ${B} blank. Nothing is estimated.`,
  },
  {
    id: 'verbs',
    name: 'Stronger verbs',
    goal: 'Each bullet opens with a precise verb that says what this person did.',
    steps: [
      'Replace weak openers: Responsible for, Helped, Assisted, Worked on, Participated in, Involved in, Handled, Tasked with.',
      'Match the verb to the ownership the line shows. "Helped build" becomes "Built" only if the line shows they built it; otherwise "Co-built" or "Contributed X to Y". Never turn assisting into leading.',
      'Pick from the right family: lead (Led, Directed, Mentored), build (Built, Designed, Launched), improve (Cut, Accelerated, Streamlined), grow (Grew, Expanded, Won), analyze (Analyzed, Identified, Forecast), persuade (Negotiated, Secured).',
      'No two bullets in a role open with the same verb. Avoid the verbs under OPENERS IN USE.',
      'Past tense for past roles, present tense for ongoing work in a current role. Use Spearheaded, Leveraged, Orchestrated, or Utilized at most once.',
    ],
    doneWhen:
      'No weak opener is left, no role repeats an opener, and no verb claims more than the line shows.',
  },
  {
    id: 'concise',
    name: 'Tighten',
    goal: 'Same meaning in fewer words, one line where possible.',
    steps: [
      'Cut empty openers (Responsible for, Worked on, Helped to) and filler (successfully, various, in order to, a number of, utilized).',
      'Turn noun phrases into verbs: "performed an analysis of" becomes "analyzed".',
      'Cut filler first, then context, then method. Never cut the result, a number, a tool, or a name.',
      `One idea per line. Aim for under 20 words, never over ${LONG_LINE_WORDS}.`,
      `If a line cannot get shorter without losing meaning, leave it. Remove a bullet only when it repeats another, and keep at least ${RESUME_EDIT_LIMITS.minBulletsPerRole} per role.`,
    ],
    doneWhen: 'Each changed line is clearly shorter and says the same thing.',
  },
];

/** The playbooks this request asked for, in the order a writer applies them. */
export function selectPlaybooks(
  brief: Pick<ResumeEditBrief, 'jobDescription' | 'presets'>
): WritingPlaybook[] {
  return WRITING_PLAYBOOKS.filter((playbook) =>
    playbook.id === 'tailor'
      ? Boolean(brief.jobDescription?.trim())
      : brief.presets.includes(playbook.id)
  );
}

/** One playbook as prompt text: name, goal, steps, and when it is done. */
export function formatPlaybook(playbook: WritingPlaybook, position: number): string {
  return [
    `${position}. ${playbook.name}`,
    `Goal: ${playbook.goal}`,
    ...playbook.steps.map((step) => `- ${step}`),
    `Done when: ${playbook.doneWhen}`,
  ].join('\n');
}
