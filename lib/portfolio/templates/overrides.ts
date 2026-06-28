/**
 * Portfolio Overrides & Draft State
 *
 * Two concerns live here, both supporting the portfolio editor:
 *
 * 1. `applyPortfolioOverrides` — merges a portfolio's media overrides
 *    (avatar, project images) onto the normalized profile data right before
 *    rendering. This keeps image choices inside the portfolio plan instead of
 *    mutating the canonical profile (which also powers the resume).
 *
 * 2. Draft helpers — the editor saves a work-in-progress copy of the whole
 *    TemplatePortfolio into `GeneratedPortfolio.userOverrides` so the public
 *    `plan` only changes when the user clicks "Publish". This avoids a schema
 *    migration: `userOverrides` is unused for template-based portfolios.
 */

import {
  DEFAULT_PORTRAIT_STYLE,
  isPortraitStyleId,
  type PortraitStyleId,
} from './minimal-studio/portrait-styles';
import {
  DEFAULT_ABOUT_STYLE,
  DEFAULT_SKILLS_STYLE,
  DEFAULT_WORK_STYLE,
  isAboutStyleId,
  isSkillsStyleId,
  isWorkStyleId,
} from './minimal-studio/section-styles';

import type {
  AboutStyle,
  PortraitLayout,
  PortraitStyle,
  SkillsStyle,
  TemplatePortfolio,
  TemplatePortfolioOverrides,
  TemplateProfileData,
  WorkStyle,
} from './types';

/** Map deprecated size/align pairs to the nearest portrait preset. */
function migrateLegacyPortraitLayout(layout: PortraitLayout): PortraitStyleId {
  if (layout.size === 'large') {
    return layout.align === 'left' ? 'style-3' : 'style-2';
  }
  if (layout.size === 'medium') {
    return layout.align === 'right' ? 'style-5' : 'style-4';
  }
  return layout.align === 'right' ? 'style-5' : 'style-1';
}

/**
 * Resolve the hero portrait preset from portfolio overrides.
 * Migrates legacy `portraitLayout` drafts automatically.
 */
export function resolvePortraitStyle(
  overrides: TemplatePortfolioOverrides | null | undefined
): PortraitStyle {
  if (isPortraitStyleId(overrides?.portraitStyle)) {
    return overrides.portraitStyle;
  }
  if (overrides?.portraitLayout) {
    return migrateLegacyPortraitLayout(overrides.portraitLayout);
  }
  return DEFAULT_PORTRAIT_STYLE;
}

/**
 * Resolve the projects/work layout preset from portfolio overrides,
 * falling back to the template default.
 */
export function resolveWorkStyle(
  overrides: TemplatePortfolioOverrides | null | undefined
): WorkStyle {
  return isWorkStyleId(overrides?.workStyle) ? overrides.workStyle : DEFAULT_WORK_STYLE;
}

/**
 * Resolve the about layout preset from portfolio overrides,
 * falling back to the template default.
 */
export function resolveAboutStyle(
  overrides: TemplatePortfolioOverrides | null | undefined
): AboutStyle {
  return isAboutStyleId(overrides?.aboutStyle) ? overrides.aboutStyle : DEFAULT_ABOUT_STYLE;
}

/**
 * Resolve the skills layout preset from portfolio overrides,
 * falling back to the template default.
 */
export function resolveSkillsStyle(
  overrides: TemplatePortfolioOverrides | null | undefined
): SkillsStyle {
  return isSkillsStyleId(overrides?.skillsStyle) ? overrides.skillsStyle : DEFAULT_SKILLS_STYLE;
}

/** @deprecated Use `resolvePortraitStyle`. */
export const DEFAULT_PORTRAIT_LAYOUT: PortraitLayout = {
  size: 'small',
  align: 'left',
};

/** @deprecated Use `resolvePortraitStyle`. */
export function resolvePortraitLayout(
  overrides: TemplatePortfolioOverrides | null | undefined
): PortraitLayout {
  const layout = overrides?.portraitLayout;
  const size = layout?.size;
  const align = layout?.align;
  return {
    size: size === 'medium' || size === 'large' ? size : 'small',
    align: align === 'right' ? 'right' : 'left',
  };
}

/**
 * Apply media overrides onto normalized profile data.
 *
 * Returns a new profile object (does not mutate the input). When no overrides
 * are present the original reference is returned untouched.
 */
export function applyPortfolioOverrides(
  profile: TemplateProfileData,
  overrides: TemplatePortfolioOverrides | null | undefined
): TemplateProfileData {
  if (!overrides) return profile;

  const hasAvatarOverride = Object.prototype.hasOwnProperty.call(overrides, 'avatarUrl');
  const projectImages = overrides.projectImages;
  const hasProjectOverrides = Boolean(projectImages && Object.keys(projectImages).length > 0);

  if (!hasAvatarOverride && !hasProjectOverrides) return profile;

  const next: TemplateProfileData = { ...profile };

  if (hasAvatarOverride) {
    next.avatarUrl = overrides.avatarUrl ?? null;
  }

  if (hasProjectOverrides && projectImages) {
    next.projects = profile.projects.map((project) => {
      if (!Object.prototype.hasOwnProperty.call(projectImages, project.id)) {
        return project;
      }
      return { ...project, imageUrl: projectImages[project.id] ?? null };
    });
  }

  return next;
}

/**
 * Resolve the effective avatar URL for the portfolio given the profile default
 * and any override. `null` means "explicitly no avatar".
 */
export function resolveEffectiveAvatar(
  profileAvatarUrl: string | null,
  overrides: TemplatePortfolioOverrides | null | undefined
): string | null {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, 'avatarUrl')) {
    return overrides.avatarUrl ?? null;
  }
  return profileAvatarUrl ?? null;
}

/**
 * Resolve the effective image URL for a single project given its own image and
 * any override. `null` means "explicitly no image".
 */
export function resolveEffectiveProjectImage(
  projectId: string,
  projectImageUrl: string | null,
  overrides: TemplatePortfolioOverrides | null | undefined
): string | null {
  const map = overrides?.projectImages;
  if (map && Object.prototype.hasOwnProperty.call(map, projectId)) {
    return map[projectId] ?? null;
  }
  return projectImageUrl ?? null;
}

// ============================================================================
// DRAFT STATE (stored in GeneratedPortfolio.userOverrides for template plans)
// ============================================================================

/**
 * Shape of the `userOverrides` JSON column when it holds an editor draft for a
 * template-based portfolio.
 */
export interface PortfolioUserState {
  /** Work-in-progress portfolio not yet published to the live `plan`. */
  draftPlan?: TemplatePortfolio | null;
}

/**
 * Extract a draft TemplatePortfolio from the raw `userOverrides` JSON value.
 * Returns null when there is no usable draft.
 */
export function getDraftPlan(userOverrides: unknown): TemplatePortfolio | null {
  if (!userOverrides || typeof userOverrides !== 'object') return null;
  const draft = (userOverrides as PortfolioUserState).draftPlan;
  if (!draft || typeof draft !== 'object') return null;
  if (typeof (draft as TemplatePortfolio).templateId !== 'string') return null;
  return draft as TemplatePortfolio;
}

/**
 * Compare a draft against the published plan to decide whether there are
 * unpublished changes. Uses a stable JSON comparison.
 */
export function hasUnpublishedChanges(
  publishedPlan: TemplatePortfolio,
  draftPlan: TemplatePortfolio | null
): boolean {
  if (!draftPlan) return false;
  return JSON.stringify(publishedPlan) !== JSON.stringify(draftPlan);
}
