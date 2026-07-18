/**
 * Portfolio-owned content resolution.
 *
 * Portfolios store their own structural data (`TemplatePortfolio.content`) so
 * edits in the resume builder never leak into the public portfolio. This module
 * is the single place that decides which profile payload templates render.
 *
 * Contract:
 * - Short fields (names, titles, labels) are plain text.
 * - Long-form fields may be Medium-style rich HTML (paragraph / heading / quote
 *   + alignment + emphasis), sanitized via `toPortfolioStoredText`.
 * - Resume TipTap HTML (lists, links, etc.) is stripped down to plain text at
 *   the ownership boundary unless it is already portfolio-shaped rich HTML.
 */

import { isPortfolioTextEmpty, toPortfolioStoredText } from '@/lib/portfolio/rich-html';
import { stripHtmlTags } from '@/lib/html-utils';

import { applyPortfolioOverrides } from './overrides';

import type { TemplateCopy, TemplatePortfolio, TemplateProfileData } from './types';

/**
 * Convert resume/editor HTML (or plain text) into a single-line portfolio string.
 * Used for short fields and AI / transform pipelines that expect plain text.
 */
export function toPortfolioPlainText(value: string | null | undefined): string {
  if (!value) return '';
  return stripHtmlTags(value).replace(/\s+/g, ' ').trim();
}

/**
 * Normalize owned structural text: preserve portfolio rich HTML, strip foreign HTML.
 * Pass `preferPlain: true` when seeding from a live resume profile so TipTap
 * resume markup never becomes the portfolio starting point.
 */
export function sanitizeOwnedProfileText(
  profile: TemplateProfileData,
  options?: { preferPlain?: boolean }
): TemplateProfileData {
  const content = cloneProfileData(profile);
  const normalize = options?.preferPlain ? toPortfolioPlainText : toPortfolioStoredText;

  content.summary = content.summary ? normalize(content.summary) || null : null;

  content.workExperiences = content.workExperiences.map((exp) => ({
    ...exp,
    bullets: exp.bullets
      .map(normalize)
      .filter((b) => (options?.preferPlain ? Boolean(b) : !isPortfolioTextEmpty(b))),
  }));

  content.projects = content.projects.map((project) => ({
    ...project,
    description: project.description ? normalize(project.description) || null : null,
  }));

  content.awards = content.awards.map((award) => ({
    ...award,
    description: award.description ? normalize(award.description) || null : null,
  }));

  return content;
}

/** Sanitize long-form copy fields; keep labels/headings plain. */
export function sanitizePortfolioCopy(copy: TemplateCopy): TemplateCopy {
  const intros = copy.sectionIntros
    ? Object.fromEntries(
        Object.entries(copy.sectionIntros).map(([key, value]) => [
          key,
          typeof value === 'string' ? toPortfolioStoredText(value) : value,
        ])
      )
    : undefined;

  return {
    ...copy,
    heroHeadline: toPortfolioPlainText(copy.heroHeadline),
    heroSubtext: toPortfolioStoredText(copy.heroSubtext),
    aboutTitle: toPortfolioPlainText(copy.aboutTitle),
    aboutText: toPortfolioStoredText(copy.aboutText),
    contactTitle: toPortfolioPlainText(copy.contactTitle),
    contactSubtext: toPortfolioPlainText(copy.contactSubtext),
    primaryCtaLabel: toPortfolioPlainText(copy.primaryCtaLabel),
    seoTitle: toPortfolioPlainText(copy.seoTitle),
    seoDescription: toPortfolioPlainText(copy.seoDescription),
    sectionIntros: intros as TemplateCopy['sectionIntros'],
    experienceNarrative: copy.experienceNarrative
      ? toPortfolioStoredText(copy.experienceNarrative) || null
      : copy.experienceNarrative,
    githubNarrative: copy.githubNarrative
      ? toPortfolioStoredText(copy.githubNarrative) || null
      : copy.githubNarrative,
    writingNarrative: copy.writingNarrative
      ? toPortfolioStoredText(copy.writingNarrative) || null
      : copy.writingNarrative,
    pullQuote: copy.pullQuote ? toPortfolioStoredText(copy.pullQuote) || null : copy.pullQuote,
    projectNarratives: copy.projectNarratives
      ? Object.fromEntries(
          Object.entries(copy.projectNarratives).map(([title, narrative]) => [
            title,
            toPortfolioStoredText(narrative),
          ])
        )
      : copy.projectNarratives,
  };
}

/**
 * Resolve the profile data a template should render.
 *
 * Prefers portfolio-owned `plan.content` (snapshot + AI transform). Falls back
 * to the live profile only for legacy plans that predate owned content.
 * Media overrides are always applied last.
 */
export function resolvePortfolioProfile(
  plan: TemplatePortfolio,
  liveProfile: TemplateProfileData
): TemplateProfileData {
  const base = sanitizeOwnedProfileText(plan.content ?? liveProfile);
  return applyPortfolioOverrides(base, plan.overrides);
}

/**
 * Ensure a plan has portfolio-owned content and sanitized copy.
 *
 * Used when loading the editor for legacy portfolios: seed `content` from the
 * live profile so the first save captures ownership without requiring a full
 * AI regeneration.
 */
export function ensurePlanContent(
  plan: TemplatePortfolio,
  liveProfile: TemplateProfileData
): TemplatePortfolio {
  const copy = sanitizePortfolioCopy(plan.copy);
  if (plan.content) {
    return { ...plan, copy, content: sanitizeOwnedProfileText(plan.content) };
  }
  return {
    ...plan,
    copy,
    content: sanitizeOwnedProfileText(liveProfile, { preferPlain: true }),
  };
}

/**
 * Deep-clone profile data so portfolio mutations never touch the source resume.
 */
export function cloneProfileData(profile: TemplateProfileData): TemplateProfileData {
  return JSON.parse(JSON.stringify(profile)) as TemplateProfileData;
}
