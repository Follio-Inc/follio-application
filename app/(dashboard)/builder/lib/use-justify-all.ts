'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { isHtmlFullyJustified, justifyHtmlContent } from '@/lib/html-utils';

import { useBuilderStore } from '../components/builder-store-provider';

import type { FullProfile } from '@/types';

// ──────────────────────────────────────────────
// Profile-level justify detection
// ──────────────────────────────────────────────

interface CustomSectionContent {
  content?: string;
  items?: Array<{ description?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * Check whether ALL rich-text HTML in the profile uses justified alignment.
 * Skips header fields (name, headline, etc.) — only checks body content
 * that is editable via RichTextEditor (summary, bullets, descriptions).
 */
function isProfileContentFullyJustified(profile: FullProfile): boolean {
  // Summary
  if (!isHtmlFullyJustified(profile.summary)) return false;

  // Work experiences
  for (const exp of profile.workExperiences ?? []) {
    if (!isHtmlFullyJustified(exp.bulletsHtml)) return false;
  }

  // Education
  for (const edu of profile.educations ?? []) {
    if (!isHtmlFullyJustified(edu.description)) return false;
  }

  // Projects
  for (const proj of profile.projects ?? []) {
    if (!isHtmlFullyJustified(proj.description)) return false;
  }

  // Awards
  for (const award of profile.awards ?? []) {
    if (!isHtmlFullyJustified(award.description)) return false;
  }

  // Custom sections (publications, volunteering, custom, etc.)
  for (const section of profile.sections ?? []) {
    if (!section.customContent) continue;
    const cc = section.customContent as CustomSectionContent;
    if (!isHtmlFullyJustified(cc.content)) return false;
    for (const item of cc.items ?? []) {
      if (!isHtmlFullyJustified(item.description)) return false;
    }
  }

  return true;
}

// ──────────────────────────────────────────────
// Build store updates with all content justified
// ──────────────────────────────────────────────

function buildJustifyUpdates(profile: FullProfile): Partial<FullProfile> {
  const updates: Partial<FullProfile> = {};

  // Summary
  if (!isHtmlFullyJustified(profile.summary)) {
    updates.summary = justifyHtmlContent(profile.summary);
  }

  // Work experiences
  if ((profile.workExperiences ?? []).some((e) => !isHtmlFullyJustified(e.bulletsHtml))) {
    updates.workExperiences = profile.workExperiences.map((e) => ({
      ...e,
      bulletsHtml: justifyHtmlContent(e.bulletsHtml),
    }));
  }

  // Education
  if ((profile.educations ?? []).some((e) => !isHtmlFullyJustified(e.description))) {
    updates.educations = profile.educations.map((e) => ({
      ...e,
      description: justifyHtmlContent(e.description),
    }));
  }

  // Projects
  if ((profile.projects ?? []).some((p) => !isHtmlFullyJustified(p.description))) {
    updates.projects = profile.projects.map((p) => ({
      ...p,
      description: justifyHtmlContent(p.description),
    }));
  }

  // Awards
  if ((profile.awards ?? []).some((a) => !isHtmlFullyJustified(a.description))) {
    updates.awards = profile.awards.map((a) => ({
      ...a,
      description: justifyHtmlContent(a.description),
    }));
  }

  // Custom sections
  const needsSectionsUpdate = (profile.sections ?? []).some((s) => {
    if (!s.customContent) return false;
    const cc = s.customContent as CustomSectionContent;
    if (!isHtmlFullyJustified(cc.content)) return true;
    return (cc.items ?? []).some((i) => !isHtmlFullyJustified(i.description));
  });

  if (needsSectionsUpdate) {
    updates.sections = profile.sections.map((s) => {
      if (!s.customContent) return s;
      const cc = s.customContent as CustomSectionContent;
      return {
        ...s,
        customContent: {
          ...cc,
          content: justifyHtmlContent(cc.content),
          items: (cc.items ?? []).map((i) => ({
            ...i,
            description: justifyHtmlContent(i.description),
          })),
        },
      };
    });
  }

  return updates;
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────

/**
 * Shared hook for the "Justify All" feature in the builder.
 *
 * Returns:
 * - `allJustified` — whether every rich-text field in the profile is justified.
 * - `justifyAll`   — callback that sets all content to `text-align: justify`,
 *                     updates the store immediately, and persists via API.
 */
export function useJustifyAll() {
  const draftProfile = useBuilderStore((s) => s.draftProfile);
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Keep a ref so the callback's closure always sees the latest profile
  // without needing to recreate the function on every edit.
  const profileRef = useRef(draftProfile);
  profileRef.current = draftProfile;

  const allJustified = useMemo(() => isProfileContentFullyJustified(draftProfile), [draftProfile]);

  const justifyAll = useCallback(() => {
    const profile = profileRef.current;
    if (isProfileContentFullyJustified(profile)) return;

    // Build content updates (only the fields that actually need changes)
    const contentUpdates = buildJustifyUpdates(profile);

    // Also ensure the CSS override flag stays in sync
    const designUpdate = {
      resumeDesign: { ...(profile.resumeDesign ?? {}), justifyAll: true },
    };

    // Commit to both draft and saved state so the preview + editors update immediately
    commitInlineChange({
      ...contentUpdates,
      ...designUpdate,
    } as Partial<FullProfile>);

    // Debounced API persistence
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch('/api/profile/justify-all', { method: 'POST' });
      } catch (err) {
        console.error('Failed to persist justify-all:', err);
      }
    }, 400);
  }, [commitInlineChange]);

  // Clean up debounce timer
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return { allJustified, justifyAll } as const;
}
