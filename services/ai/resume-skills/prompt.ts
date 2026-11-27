/**
 * The prompt for reading a resume's skills, line by line. Code already
 * finds every skill the resume names; the model's job is the skills the
 * work shows without naming, and names the shared skill list lacks.
 */

import { categoryNames } from '@/services/ai/skills/catalog';
import { SKILL_PROFILE_LIMITS, type SkillLine } from '@/services/ai/skills/types';

const SOURCE_TITLES: Record<SkillLine['source'], string> = {
  summary: 'HEADLINE AND SUMMARY',
  experience: 'EXPERIENCE',
  projects: 'PROJECTS',
  certifications: 'CERTIFICATIONS',
  skills: 'SKILLS LIST',
  education: 'EDUCATION',
};

export function buildResumeSkillsSystemPrompt(): string {
  return `You read a resume and list the professional skills it gives evidence for. Each line has a ref like E1.2. A recruiter will match this list against job postings.

List a skill when a line names it, or when the work a line describes clearly needs it. "Tuned slow Postgres queries with indexes" shows PostgreSQL, SQL, and query optimization. "Built the iOS app in Swift" shows Swift and iOS development. Do not stretch: "worked with the data team" shows no skill.

Never list soft skills or traits (communication, leadership, teamwork, problem solving), job titles, company names, or years of experience.

For each skill:
- label: its common name, e.g. "PostgreSQL", "Database management systems", "A/B testing".
- kind: "tool" for a named technology, language, platform, or product; "practice" for a skill or method; "domain" for an industry or business area.
- aliases: up to ${SKILL_PROFILE_LIMITS.maxAliases} other names a job posting might use for exactly the same skill, e.g. "DBMS" and "Database management" for Database management systems. Never a different skill.
- broader: up to ${SKILL_PROFILE_LIMITS.maxBroader} broader skills it belongs to, chosen from this list when one fits: ${categoryNames().join(', ')}.
- refs: the refs of the lines that name or show it.

Return JSON:
{ "skills": [ { "label": string, "kind": "tool" | "practice" | "domain", "aliases": string[], "broader": string[], "refs": string[] } ] }

At most ${SKILL_PROFILE_LIMITS.maxSkills} skills.`;
}

export function buildResumeSkillsUserPrompt(lines: readonly SkillLine[]): string {
  const sections: string[] = [];
  for (const source of Object.keys(SOURCE_TITLES) as Array<SkillLine['source']>) {
    const own = lines.filter((line) => line.source === source);
    if (own.length === 0) continue;
    sections.push(
      [SOURCE_TITLES[source], ...own.map((line) => `[${line.ref}] ${line.text}`)].join('\n')
    );
  }
  return sections.join('\n\n');
}
