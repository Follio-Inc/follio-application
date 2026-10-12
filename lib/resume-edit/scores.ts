/**
 * Scores for the AI edit panel: the resume before this request, and the
 * resume with every ready suggestion kept. Both are built with the same
 * apply and undo plans the server runs, so a projected score is what keeping
 * would actually produce.
 */

import { evaluateResume, resumeText, type ResumeEvaluation } from '@/services/ai/evaluate';
import type { JobRequirement } from '@/services/ai/job-requirements/types';
import { buildEditFacts, type EditSourceProfile } from '@/services/ai/resume-edit/facts';
import type { StoredSkillProfile } from '@/services/ai/skills/types';

import { editableDocument, planApply, planRevert, type EditableDocument } from './document';
import type { ResumeEditChange } from './types';

export interface ScoredResume {
  evaluation: ResumeEvaluation;
  /** Plain text of the resume, as the recruiter read sees it. */
  text: string;
}

/** `source` with the headline, summary, and bullets of `doc`. */
export function withDocument(source: EditSourceProfile, doc: EditableDocument): EditSourceProfile {
  const byId = new Map(doc.experiences.map((item) => [item.id, item]));
  return {
    ...source,
    headline: doc.headline,
    summary: doc.summary,
    workExperiences: source.workExperiences.map((item) => {
      const next = byId.get(item.id);
      return next ? { ...item, bullets: next.bullets, bulletsHtml: next.bulletsHtml } : item;
    }),
  };
}

export function scoreResume(
  source: EditSourceProfile,
  jobDescription: string | null,
  requirements: readonly JobRequirement[] | null = null,
  storedSkills: StoredSkillProfile | null = null
): ScoredResume {
  const facts = buildEditFacts(source);
  return {
    evaluation: evaluateResume(facts, jobDescription, requirements, storedSkills),
    text: resumeText(facts),
  };
}

/**
 * The resume before this session's kept changes, and with its ready
 * suggestions kept. `ready` maps a change id to the text it would write.
 */
export function sessionSources(
  source: EditSourceProfile,
  changes: ResumeEditChange[],
  ready: ReadonlyMap<string, string>,
  now: Date = new Date()
): { before: EditSourceProfile; after: EditSourceProfile } {
  const doc = editableDocument(source);
  const hasApplied = changes.some((change) => change.status === 'applied');
  const before = hasApplied ? withDocument(source, planRevert(doc, changes, null).doc) : source;
  const after =
    ready.size > 0
      ? withDocument(source, planApply(doc, changes, new Map(ready), now).doc)
      : source;
  return { before, after };
}

/** Signed change between two scores, or null when either side has none. */
export function scoreDelta(before: number | null, after: number | null): number | null {
  return before === null || after === null ? null : after - before;
}
