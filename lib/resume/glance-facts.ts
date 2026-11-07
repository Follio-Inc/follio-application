/**
 * The fact packet for the highlights prompt.
 * Visible experience text only. No HTML. No inferred metrics.
 */

import { plainText } from '@/lib/follio-identity/text';
import { formatDateRange } from '@/lib/utils';
import { applyVisibilityFilter } from '@/lib/visibility';
import type { PublicProfile } from '@/types';

export type GlanceRoleFacts = {
  title: string;
  dates: string;
  bullets: string[];
};

export type GlanceCompanyFacts = {
  company: string;
  roles: GlanceRoleFacts[];
};

export type GlanceFacts = {
  companies: GlanceCompanyFacts[];
};

function text(value: string | null | undefined): string | null {
  return plainText(value?.replace(/&nbsp;|&#160;|\u00a0/g, ' '));
}

/** Fold "Acme, Inc." and "Acme" into one employer. */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(incorporated|inc|llc|ltd|corp|co|company)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One line per bullet, the way the resume shows it. Editor HTML splits on list items and paragraphs. */
export function bulletLines(item: {
  bullets?: string[] | null;
  bulletsHtml?: string | null;
}): string[] {
  const fromBullets = (item.bullets ?? [])
    .map((line) => text(line))
    .filter((line): line is string => Boolean(line));
  if (fromBullets.length > 0) return fromBullets;
  if (!item.bulletsHtml) return [];
  return item.bulletsHtml
    .split(/<\/li>|<\/p>|<br\s*\/?>/i)
    .map((line) => text(line))
    .filter((line): line is string => Boolean(line));
}

type WorkItem = PublicProfile['workExperiences'][number];

function groupCompanies(experiences: WorkItem[]): GlanceCompanyFacts[] {
  const groups: GlanceCompanyFacts[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of experiences) {
    const company = text(item.company);
    const title = text(item.role);
    if (!company || !title) continue;
    const key = companyKey(company) || company.toLowerCase();
    let group = groups[indexByKey.get(key) ?? -1];
    if (!group) {
      group = { company, roles: [] };
      indexByKey.set(key, groups.length);
      groups.push(group);
    }
    group.roles.push({
      title,
      dates: formatDateRange(item.startDate, item.endDate, item.isCurrent),
      bullets: bulletLines(item),
    });
  }

  return groups;
}

export function factsAreEmpty(facts: GlanceFacts): boolean {
  return !facts.companies.some((company) => company.roles.some((role) => role.bullets.length > 0));
}

export function buildGlanceFacts(profile: PublicProfile): GlanceFacts {
  const visible = applyVisibilityFilter(profile, { resumeContext: true });
  const experiences = (visible.workExperiences ?? []).filter((item) => item.isVisible !== false);
  return { companies: groupCompanies(experiences) };
}
