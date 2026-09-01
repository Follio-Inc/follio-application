/**
 * Where a lens phrase appears on the (visible) resume.
 */

import { stripHtmlTags } from '@/lib/html-utils';

import { phraseAppearsIn } from './highlight';
import type { LensOccurrence, LensPhrase, LensProfile } from './types';
import type { SelectedPhrase } from './phrases';

function yearFrom(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return String(d.getUTCFullYear());
}

function textBlob(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .map((p) => stripHtmlTags(p))
    .join('\n');
}

function uniqueOccurrences(hits: LensOccurrence[]): LensOccurrence[] {
  const seen = new Set<string>();
  const out: LensOccurrence[] = [];
  for (const hit of hits) {
    const key = `${hit.kind}:${hit.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

export function indexPhraseOccurrences(
  profile: LensProfile,
  selected: SelectedPhrase[]
): LensPhrase[] {
  return selected.map((spec) => {
    const hits: LensOccurrence[] = [];
    const phrase = spec.phrase;

    const visibleSkills = profile.skills.filter((s) => s.isVisible !== false).map((s) => s.name);
    if (visibleSkills.some((name) => phraseAppearsIn(name, phrase))) {
      hits.push({ kind: 'skill', label: 'Skills' });
    }

    if (profile.headline && phraseAppearsIn(profile.headline, phrase)) {
      hits.push({ kind: 'headline', label: 'Headline' });
    }

    if (profile.summary && phraseAppearsIn(stripHtmlTags(profile.summary), phrase)) {
      hits.push({ kind: 'summary', label: 'Summary' });
    }

    for (const work of profile.workExperiences.filter((w) => w.isVisible !== false)) {
      const year = yearFrom(work.endDate) ?? yearFrom(work.startDate);
      const roleLabel = [work.role, work.company].filter(Boolean).join(' · ');
      const blob = textBlob(work.role, work.company, ...(work.bullets ?? []), work.bulletsHtml);

      if (!phraseAppearsIn(blob, phrase)) continue;

      if (phraseAppearsIn(work.role, phrase)) {
        hits.push({
          kind: 'role',
          label: roleLabel,
          company: work.company,
          year,
          isCurrent: Boolean(work.isCurrent),
        });
      } else {
        hits.push({
          kind: 'experience',
          label: roleLabel,
          company: work.company,
          year,
          isCurrent: Boolean(work.isCurrent),
        });
      }
    }

    for (const project of profile.projects.filter(
      (p) => p.isVisible !== false && p.showOnResume !== false
    )) {
      const blob = textBlob(
        project.title,
        project.description,
        ...(project.techStack ?? []),
        ...(project.highlights ?? [])
      );
      if (!phraseAppearsIn(blob, phrase)) continue;
      hits.push({ kind: 'project', label: project.title });
    }

    for (const edu of profile.educations.filter((e) => e.isVisible !== false)) {
      const blob = textBlob(edu.institution, edu.degree, edu.fieldOfStudy);
      if (!phraseAppearsIn(blob, phrase)) continue;
      const label = [edu.degree, edu.fieldOfStudy, edu.institution].filter(Boolean).join(' · ');
      hits.push({ kind: 'education', label: label || edu.institution });
    }

    for (const cert of profile.certifications.filter((c) => c.isVisible !== false)) {
      const blob = textBlob(cert.name, cert.issuer);
      if (!phraseAppearsIn(blob, phrase)) continue;
      hits.push({
        kind: 'certification',
        label: cert.issuer ? `${cert.name} · ${cert.issuer}` : cert.name,
      });
    }

    return {
      id: spec.id,
      phrase: spec.phrase,
      kind: spec.kind,
      occurrences: uniqueOccurrences(hits),
    };
  });
}

/**
 * One-line hover summary, e.g. "3 places · last at Stripe, 2024"
 */
export function formatPhraseHint(phrase: LensPhrase): string {
  const hits = phrase.occurrences;
  const count = hits.length;
  const places =
    count <= 1
      ? count === 1
        ? (hits[0]?.label ?? 'on this resume')
        : 'on this resume'
      : `${count} places`;

  const current = hits.find((h) => h.isCurrent && h.company);
  if (current?.company) {
    return count > 1
      ? `${places} · currently at ${current.company}`
      : `currently at ${current.company}`;
  }

  const dated = hits.find((h) => h.company && h.year);
  if (dated?.company) {
    const last = `last at ${dated.company}, ${dated.year}`;
    return count > 1 ? `${places} · ${last}` : last;
  }

  const company = hits.find((h) => h.company);
  if (company?.company) {
    return count > 1 ? `${places} · at ${company.company}` : `at ${company.company}`;
  }

  return places;
}
