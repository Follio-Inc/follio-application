/**
 * Section & Entry Visibility Filter
 *
 * Single source of truth for how visibility translates into which profile
 * fields/arrays are shown or hidden.  Handles TWO levels:
 *
 *   1. Section-level — the eye icon in the builder sidebar toggles
 *      `ProfileSection.isVisible`.  Hiding a section empties the
 *      corresponding arrays / nullifies scalar fields.
 *
 *   2. Entry-level — every individual record (WorkExperience, Project,
 *      Education, Skill, Link, Award, Certification, Photo) and every
 *      custom-content item carries its own `isVisible` flag.  Hidden
 *      entries are stripped from the arrays so no downstream consumer
 *      ever needs to check `isVisible` itself.
 *
 * Used by:
 * - profile.service.ts  (server-side public profile)
 * - clean-resume-view.tsx (builder preview + public resume page)
 * - resume-view.tsx       (legacy resume view)
 *
 * ── Design rules ──────────────────────────────────────────────────────────
 * 1. If no sections exist yet (new/legacy profile), everything is visible.
 * 2. A section is visible iff its `isVisible` flag is `true`.
 * 3. Hiding a section type empties/nullifies the corresponding profile
 *    fields so consumers never need to check visibility themselves.
 * 4. Individual entries with `isVisible === false` are removed from every
 *    array.  Default is visible (`isVisible` undefined/null → visible).
 * 5. `avatarUrl` is always kept — the consuming view can gate it on the
 *    returned `_photosVisible` flag + `resumeShowPhoto` if needed.
 * 6. `contactInfo` filtering respects `emailPublic`/`phonePublic` flags
 *    regardless of whether they've already been applied.
 * 7. When `resumeContext` is true, projects with `showOnResume === false`
 *    are also filtered out.
 * ───────────────────────────────────────────────────────────────────────────
 */

import type { PublicProfile } from '@/types';

/** Minimal section shape needed by the filter (avoids Prisma import in client code). */
interface SectionLike {
  type: string;
  isVisible: boolean;
  customContent?: unknown;
  [key: string]: unknown;
}

/** The profile returned by `applyVisibilityFilter` carries one extra flag. */
export interface FilteredProfile extends PublicProfile {
  /** Whether the PHOTOS section is visible (used by resume header for the avatar). */
  _photosVisible: boolean;
}

/** Options for the visibility filter. */
export interface VisibilityFilterOptions {
  /**
   * When true, also removes projects whose `showOnResume` flag is false.
   * Use this for resume views; omit or set false for portfolio/general use.
   */
  resumeContext?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Remove entries whose `isVisible` is explicitly `false`. */
function filterVisible<T>(items: T[] | undefined | null): T[] {
  return (items || []).filter((item) => (item as Record<string, unknown>).isVisible !== false);
}

/** Filter skills inside skill groups and drop groups that become empty. */
function filterSkillGroups(
  groups: PublicProfile['skillGroups'] | undefined | null
): PublicProfile['skillGroups'] {
  return (groups || [])
    .map((group) => ({ ...group, skills: filterVisible(group.skills) }))
    .filter((group) => group.skills.length > 0);
}

/**
 * For each section, filter the `customContent.items` array by `isVisible`.
 * Returns a new sections array (never mutates the original).
 */
function filterSectionItems(sections: SectionLike[]): SectionLike[] {
  return sections.map((section) => {
    const content = section.customContent as Record<string, unknown> | null;
    if (!content || !Array.isArray(content.items)) return section;
    return {
      ...section,
      customContent: {
        ...content,
        items: (content.items as Record<string, unknown>[]).filter(
          (item) => item.isVisible !== false
        ),
      },
    };
  });
}

// ── Main filter ─────────────────────────────────────────────────────────

/**
 * Apply section-level AND entry-level visibility filtering to a profile.
 *
 * @param raw      Full or public profile — may be pre-filtered (from
 *                 `profile.service.ts`) or unfiltered (from the builder API).
 * @param options  Optional configuration (e.g. `resumeContext`).
 * @returns        A new object with hidden sections' data nullified/emptied
 *                 and hidden individual entries removed from all arrays.
 */
export function applyVisibilityFilter(
  raw: PublicProfile,
  options?: VisibilityFilterOptions
): FilteredProfile {
  const sections = (raw.sections || []) as SectionLike[];
  const hasConfiguredSections = sections.length > 0;

  // If no sections are configured yet, still apply entry-level filtering.
  if (!hasConfiguredSections) {
    let projects = filterVisible(raw.projects);
    if (options?.resumeContext) {
      projects = projects.filter((p) => (p as Record<string, unknown>).showOnResume !== false);
    }

    return {
      ...raw,
      workExperiences: filterVisible(raw.workExperiences),
      educations: filterVisible(raw.educations),
      skills: filterVisible(raw.skills),
      skillGroups: filterSkillGroups(raw.skillGroups),
      projects,
      links: filterVisible(raw.links),
      awards: filterVisible(raw.awards),
      certifications: filterVisible(raw.certifications),
      photos: filterVisible(raw.photos),
      _photosVisible: true,
    } as FilteredProfile;
  }

  const visibleTypes = new Set(sections.filter((s) => s.isVisible).map((s) => s.type));

  const isVisible = (type: string) => visibleTypes.has(type);

  const showBasicInfo = isVisible('BASIC_INFO');
  // Contact is merged into BASIC_INFO (Header). For backward compat with
  // existing profiles that still have a CONTACT section row, honor either.
  const showContact = showBasicInfo || isVisible('CONTACT');
  const showPhotos = isVisible('PHOTOS');
  // For SUMMARY: default to visible if the section doesn't exist yet (backwards compat)
  const hasSummarySection = sections.some((s) => s.type === 'SUMMARY');
  const showSummary = hasSummarySection ? isVisible('SUMMARY') : true;

  // ── Contact info ────────────────────────────────────────────────────
  let filteredContactInfo = raw.contactInfo;
  if (!showContact) {
    filteredContactInfo = null;
  } else if (filteredContactInfo) {
    const ci = filteredContactInfo as unknown as Record<string, unknown>;
    filteredContactInfo = {
      email: ci.emailPublic !== false ? filteredContactInfo.email : null,
      phone: ci.phonePublic !== false ? filteredContactInfo.phone : null,
      website: filteredContactInfo.website ?? null,
      headerFieldsOrder: Array.isArray(ci.headerFieldsOrder) ? ci.headerFieldsOrder : null,
    } as PublicProfile['contactInfo'];
  }

  // ── Projects (entry-level + optional showOnResume gating) ───────────
  let filteredProjects = isVisible('PROJECTS') ? filterVisible(raw.projects) : [];
  if (options?.resumeContext) {
    filteredProjects = filteredProjects.filter(
      (p) => (p as Record<string, unknown>).showOnResume !== false
    );
  }

  // ── Visible sections with item-level filtering ──────────────────────
  const visibleSections = filterSectionItems(sections.filter((s) => s.isVisible));

  return {
    ...raw,

    // BASIC_INFO (Header) → name, headline
    firstName: showBasicInfo ? raw.firstName : null,
    lastName: showBasicInfo ? raw.lastName : null,
    headline: showBasicInfo ? raw.headline : null,
    summary: showSummary ? raw.summary : null,

    // BASIC_INFO (Header) also gates location, contactInfo.
    // locationPublic provides per-field control (defaults to visible).
    location:
      showContact &&
      (raw.contactInfo as unknown as Record<string, unknown> | null)?.locationPublic !== false
        ? raw.location
        : null,
    contactInfo: filteredContactInfo,

    // Avatar URL always available; consuming views gate on _photosVisible.
    avatarUrl: raw.avatarUrl,

    // Visible sections with filtered custom-content items
    sections: visibleSections as PublicProfile['sections'],

    // Array-backed sections: section-level gating + entry-level filtering
    workExperiences: isVisible('EXPERIENCE') ? filterVisible(raw.workExperiences) : [],
    educations: isVisible('EDUCATION') ? filterVisible(raw.educations) : [],
    skills: isVisible('SKILLS') ? filterVisible(raw.skills) : [],
    skillGroups: isVisible('SKILLS') ? filterSkillGroups(raw.skillGroups) : [],
    projects: filteredProjects,
    links: isVisible('LINKS') ? filterVisible(raw.links) : [],
    awards: isVisible('AWARDS') ? filterVisible(raw.awards) : [],
    certifications: isVisible('CERTIFICATIONS') ? filterVisible(raw.certifications) : [],
    photos: isVisible('PHOTOS') ? filterVisible(raw.photos) : [],

    // Extra flag for header photo logic
    _photosVisible: showPhotos,
  } as FilteredProfile;
}
