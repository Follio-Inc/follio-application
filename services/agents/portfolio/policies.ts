/**
 * Portfolio section writing policies.
 *
 * Shared playbook for how each section should be transformed from
 * resume/source data into portfolio-owned text. Used by the portfolio
 * generation agent (and any future editors that ask AI to rewrite a section).
 */

export type PortfolioSectionPolicyId =
  | 'hero'
  | 'about'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'awards'
  | 'certifications'
  | 'writing'
  | 'github'
  | 'contact';

export interface PortfolioSectionPolicy {
  id: PortfolioSectionPolicyId;
  title: string;
  /** What good output looks like for this section. */
  goal: string;
  /** Hard rules the model must follow. */
  rules: string[];
  /** How to handle thin / missing source text. */
  thinDataStrategy: string;
}

export const PORTFOLIO_SECTION_POLICIES: Record<PortfolioSectionPolicyId, PortfolioSectionPolicy> =
  {
    hero: {
      id: 'hero',
      title: 'Hero',
      goal: 'Punchy identity headline (first person) + one-line context subheadline.',
      rules: [
        'Headline: 3–8 words, first person, identity — not a job title.',
        'Subheadline: one sentence with current role/company or positioning.',
        'Never invent employers, titles, or metrics.',
      ],
      thinDataStrategy: 'If sparse, use a short honest headline from available role/skills only.',
    },
    about: {
      id: 'about',
      title: 'About',
      goal: '2–4 sentence third-person narrative of who they are and what they care about.',
      rules: [
        'Write in third person.',
        'Tell an arc — do not list skills or companies.',
        'No resume clichés or buzzwords.',
        'Ground every claim in provided data.',
      ],
      thinDataStrategy: 'Keep to 1–2 factual sentences; do not pad.',
    },
    experience: {
      id: 'experience',
      title: 'Experience',
      goal: 'One portfolio-style summary sentence per role (two max if impact needs it).',
      rules: [
        'Never output bullet lists.',
        'Prefer outcomes over duties.',
        'Drop filler ("Responsible for", "Leveraged", "Spearheaded").',
        'Do not invent metrics — only rephrase numbers present in source bullets.',
        'Keep company, role, and dates unchanged.',
      ],
      thinDataStrategy:
        'If bullets are empty, write a minimal factual line: role + domain at company. Do not invent impact.',
    },
    education: {
      id: 'education',
      title: 'Education',
      goal: 'Keep education compact and factual; light polish only.',
      rules: [
        'Preserve institution, degree, field, and dates.',
        'At most one short clarifying sentence if description exists.',
        'Do not invent honors, GPA, or coursework.',
      ],
      thinDataStrategy: 'Leave description empty if nothing meaningful exists.',
    },
    skills: {
      id: 'skills',
      title: 'Skills',
      goal: 'Clean, deduped skill list — optionally grouped. No invented skills.',
      rules: [
        'Only use skills present in the source data.',
        'Deduplicate near-duplicates (e.g. JS / JavaScript → keep one).',
        'Do not invent proficiency levels.',
      ],
      thinDataStrategy: 'If few skills, keep them as-is; do not pad with generics.',
    },
    projects: {
      id: 'projects',
      title: 'Projects',
      goal: '1–2 sentence blurb: what it is and why it matters. Lead with purpose or impact.',
      rules: [
        'If description is strong, polish voice — do not overwrite meaning.',
        'If description is thin/empty, synthesize from title, tech stack, highlights, README excerpt, and GitHub stats — still no invented metrics beyond given stats.',
        'Weave stars/forks naturally only when present.',
        'Plain text only.',
      ],
      thinDataStrategy:
        'Empty description → build from title + tech + pinned/stars if available. Never fabricate a product story.',
    },
    awards: {
      id: 'awards',
      title: 'Awards',
      goal: 'One short sentence or empty.',
      rules: ['Do not invent awards or issuers.', 'Keep title/issuer/date intact.'],
      thinDataStrategy: 'Empty description is fine.',
    },
    certifications: {
      id: 'certifications',
      title: 'Certifications',
      goal: 'Leave structural fields intact; no creative rewrite needed.',
      rules: ['Do not invent credentials or dates.'],
      thinDataStrategy: 'No copy generation required.',
    },
    writing: {
      id: 'writing',
      title: 'Writing (Medium, Substack, blogs)',
      goal: 'Optional writing narrative + which posts to feature, based on attached posts only.',
      rules: [
        'Only use posts present in attached writing sources.',
        'Do not invent article titles or topics.',
        'If no writing is attached, skip this section entirely.',
      ],
      thinDataStrategy: 'Titles-only feeds → short narrative from topics; no fake excerpts.',
    },
    github: {
      id: 'github',
      title: 'GitHub / open source',
      goal: 'Optional narrative of what their open source presence reveals.',
      rules: [
        'Use aggregate profile + project GitHub fields only.',
        'Do not invent stars, orgs, or contribution claims.',
      ],
      thinDataStrategy:
        'If only per-repo stats exist (no aggregate profile), speak from those repos only.',
    },
    contact: {
      id: 'contact',
      title: 'Contact CTA',
      goal: 'Natural CTA line (e.g. Get in touch / Let’s connect).',
      rules: ['Keep it short and human.', 'Do not invent availability claims.'],
      thinDataStrategy: 'Default to a simple “Get in touch”.',
    },
  };

export function getSectionPolicy(id: PortfolioSectionPolicyId): PortfolioSectionPolicy {
  return PORTFOLIO_SECTION_POLICIES[id];
}

export function listSectionPolicies(): PortfolioSectionPolicy[] {
  return Object.values(PORTFOLIO_SECTION_POLICIES);
}

/** Compact text block for prompts / tool results. */
export function formatPolicyForPrompt(policy: PortfolioSectionPolicy): string {
  return [
    `## ${policy.title} (${policy.id})`,
    `Goal: ${policy.goal}`,
    `Rules:\n${policy.rules.map((r) => `- ${r}`).join('\n')}`,
    `Thin data: ${policy.thinDataStrategy}`,
  ].join('\n');
}
