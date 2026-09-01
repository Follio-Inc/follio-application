/**
 * Build a compact searchable corpus from a profile for JD matching.
 */

import type { ResumeCorpus } from './types';

export type ProfileForMatch = {
  id: string;
  handle: string;
  resumeTitle: string;
  headline: string | null;
  summary: string | null;
  skills: Array<{ name: string; isVisible?: boolean | null }>;
  workExperiences: Array<{
    company: string;
    role: string;
    bullets?: string[] | null;
    bulletsHtml?: string | null;
    isVisible?: boolean | null;
  }>;
  projects: Array<{
    title: string;
    description?: string | null;
    techStack?: string[] | null;
    highlights?: string[] | null;
    isVisible?: boolean | null;
    showOnResume?: boolean | null;
  }>;
  educations: Array<{
    institution: string;
    degree?: string | null;
    fieldOfStudy?: string | null;
    isVisible?: boolean | null;
  }>;
  certifications: Array<{
    name: string;
    issuer?: string | null;
    isVisible?: boolean | null;
  }>;
};

function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildResumeCorpus(profile: ProfileForMatch): ResumeCorpus {
  const skills = profile.skills
    .filter((s) => s.isVisible !== false)
    .map((s) => s.name.trim())
    .filter(Boolean);

  const visibleWork = profile.workExperiences.filter((w) => w.isVisible !== false);
  const roles = visibleWork.map((w) => w.role).filter(Boolean);
  const companies = visibleWork.map((w) => w.company).filter(Boolean);

  const parts: string[] = [];
  if (profile.headline) parts.push(profile.headline);
  if (profile.summary) parts.push(profile.summary);
  parts.push(...skills);

  for (const w of visibleWork) {
    parts.push(w.role, w.company);
    if (w.bullets?.length) parts.push(...w.bullets);
    const htmlText = stripHtml(w.bulletsHtml);
    if (htmlText) parts.push(htmlText);
  }

  for (const p of profile.projects.filter(
    (proj) => proj.isVisible !== false && proj.showOnResume !== false
  )) {
    parts.push(p.title);
    if (p.description) parts.push(p.description);
    if (p.techStack?.length) parts.push(...p.techStack);
    if (p.highlights?.length) parts.push(...p.highlights);
  }

  for (const e of profile.educations.filter((ed) => ed.isVisible !== false)) {
    parts.push(e.institution);
    if (e.degree) parts.push(e.degree);
    if (e.fieldOfStudy) parts.push(e.fieldOfStudy);
  }

  for (const c of profile.certifications.filter((cert) => cert.isVisible !== false)) {
    parts.push(c.name);
    if (c.issuer) parts.push(c.issuer);
  }

  return {
    id: profile.id,
    handle: profile.handle,
    resumeTitle: profile.resumeTitle,
    headline: profile.headline,
    summary: profile.summary,
    skills,
    roles,
    companies,
    bodyText: parts.join('\n'),
  };
}
