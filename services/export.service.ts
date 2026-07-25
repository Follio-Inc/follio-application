/**
 * Export Service
 * Converts canonical profile data to various export formats.
 *
 * PDF generation renders the same HTML / CSS used by CleanResumeView so
 * the downloaded PDF is pixel-identical to the on-screen resume preview.
 * Puppeteer (headless Chrome) is used for the HTML → PDF conversion.
 */

import type { Browser } from 'puppeteer-core';

import {
  containsHtmlFormatting,
  isHtmlEmpty,
  sanitizeRichHtml,
  stripHtmlTags,
} from '@/lib/html-utils';
import { logger } from '@/lib/logger';
import { cleanPhoneDisplay } from '@/lib/phone';
import { formatAtelierYearRange } from '@/lib/resume/atelier';
import { isPhotoBeforeText, resolveHeaderComposition } from '@/lib/resume/header-layout';
import { resolveResumeColorTheme } from '@/lib/resume-color-theme';
import {
  buildResumeDesignStyleAttr,
  mergeResumeDesign,
  parseResumeDesign,
  resolveResumeFonts,
} from '@/lib/resume-design';
import { getResumeTemplateId, isResumeAtelierRailSectionType } from '@/lib/resume/templates';
import { getResumePageSize } from '@/lib/resume/page-layout';
import { resolveSkillCategoryLabel, skillGroupsHaveCategoryLabels } from '@/lib/skills/groups';
import { formatDate } from '@/lib/utils';
import type {
  CustomSectionContent,
  CustomSectionItem,
  FullProfile,
  InterestItem,
  JSONResume,
  LanguageItem,
  PdfLayout,
  ProfileSection,
  PublicationItem,
  ReferenceItem,
  ResumeFontFamily,
  VolunteeringItem,
} from '@/types';
import { HEADER_SECTION_TYPES } from '@/types';

export type { PdfLayout };

/** Normalize legacy `paged` query values to Letter. */
function normalizePdfLayout(layout: string | undefined): PdfLayout {
  if (layout === 'continuous' || layout === 'a4' || layout === 'letter') return layout;
  if (layout === 'paged') return 'letter';
  return 'letter';
}

const serviceLogger = logger.child({ source: 'export-service' });

/**
 * Escape HTML special characters to prevent XSS.
 * Must be applied to all user-provided data interpolated into HTML.
 */
function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Return an HTML-attribute-safe URL, or an empty string when the URL uses a
 * disallowed scheme.
 *
 * `escapeHtml` alone is insufficient for `href`/`src`: a value such as
 * `javascript:alert(1)` contains no characters that escaping would alter, yet
 * still executes when the link is clicked. This restricts URLs to the safe
 * schemes the app actually uses (http, https, mailto, tel) plus relative
 * references, then escapes the result for attribute interpolation.
 */
function safeUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  const isSafe = /^(?:https?|mailto|tel):/i.test(trimmed) || /^(?:\/|#|\.)/.test(trimmed);
  return isSafe ? escapeHtml(trimmed) : '';
}

/** A single contact item for resume header rendering. */
interface ContactItem {
  id: string;
  value: string;
  /** For HTML contexts: optional href (mailto:, tel:, or URL). */
  href?: string;
}

/**
 * Build the ordered list of contact items respecting the user's
 * drag-and-drop `headerFieldsOrder` from ContactInfo.
 *
 * Each ID in the order maps to:
 *  - `'location'` → profile.location
 *  - `'email'`    → contactInfo.email (when emailPublic)
 *  - `'phone'`    → contactInfo.phone (when phonePublic)
 *  - any other ID → a link from profile.links (by link.id)
 *
 * Items not in the stored order are appended at the end.
 * Website is always included if present (after ordered items).
 */
function getOrderedContactItems(profile: FullProfile): ContactItem[] {
  const ci = profile.contactInfo;
  const visibleLinks = profile.links.filter((l) => l.isVisible !== false);

  // Build a map: id → ContactItem
  const itemMap = new Map<string, ContactItem>();

  if (profile.location) {
    itemMap.set('location', { id: 'location', value: profile.location });
  }
  if (ci?.email && ci.emailPublic) {
    itemMap.set('email', {
      id: 'email',
      value: ci.email,
      href: `mailto:${ci.email}`,
    });
  }
  if (ci?.phone && ci.phonePublic) {
    itemMap.set('phone', {
      id: 'phone',
      value: cleanPhoneDisplay(ci.phone),
      href: `tel:${ci.phone}`,
    });
  }

  // Links — keyed by their database id
  for (const link of visibleLinks) {
    itemMap.set(link.id, {
      id: link.id,
      value: link.url,
      href: link.url,
    });
  }

  // Read stored order
  const storedOrder = Array.isArray(ci?.headerFieldsOrder)
    ? (ci!.headerFieldsOrder as string[])
    : null;

  if (storedOrder && storedOrder.length > 0) {
    const ordered: ContactItem[] = [];
    const seen = new Set<string>();
    for (const id of storedOrder) {
      const item = itemMap.get(id);
      if (item && !seen.has(id)) {
        ordered.push(item);
        seen.add(id);
      }
    }
    // Append any items that weren't in the stored order
    for (const [id, item] of itemMap) {
      if (!seen.has(id)) ordered.push(item);
    }
    // Website is a standalone field, always appended if present
    if (ci?.website) {
      ordered.push({ id: 'website', value: ci.website, href: ci.website });
    }
    return ordered;
  }

  // Fallback: default order (location → email → phone → website → links)
  const fallback: ContactItem[] = [];
  if (itemMap.has('location')) fallback.push(itemMap.get('location')!);
  if (itemMap.has('email')) fallback.push(itemMap.get('email')!);
  if (itemMap.has('phone')) fallback.push(itemMap.get('phone')!);
  if (ci?.website) {
    fallback.push({ id: 'website', value: ci.website, href: ci.website });
  }
  for (const link of visibleLinks) {
    fallback.push(itemMap.get(link.id)!);
  }
  return fallback;
}

/**
 * Get body sections (non-header) from profile, sorted by sortOrder.
 * Returns section types in the user-configured order.
 */
function getOrderedBodySections(profile: FullProfile): string[] {
  if (!profile.sections || profile.sections.length === 0) {
    // Fallback: use the legacy hardcoded order when no sections exist
    return ['SUMMARY', 'EXPERIENCE', 'EDUCATION', 'SKILLS', 'PROJECTS', 'CERTIFICATIONS', 'AWARDS'];
  }

  return [...profile.sections]
    .filter((s) => !HEADER_SECTION_TYPES.includes(s.type) && s.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.type);
}

/**
 * Convert profile to JSON Resume format
 * @see https://jsonresume.org/schema/
 */
export function toJSONResume(profile: FullProfile): JSONResume {
  try {
    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

    // Filter hidden items
    const visibleExperiences = profile.workExperiences.filter((e) => e.isVisible !== false);
    const visibleEducations = profile.educations.filter((e) => e.isVisible !== false);
    const visibleSkills = profile.skills.filter((s) => s.isVisible !== false);
    const visibleSkillGroups = profile.skillGroups
      .map((g) => ({
        ...g,
        skills: g.skills.filter((s) => s.isVisible !== false),
      }))
      .filter((g) => g.skills.length > 0);
    const visibleProjects = profile.projects.filter(
      (p) => p.isVisible !== false && p.showOnResume !== false
    );
    const visibleAwards = profile.awards.filter((a) => a.isVisible !== false);
    const visibleCerts = profile.certifications.filter((c) => c.isVisible !== false);
    const visibleLinks = profile.links.filter((l) => l.isVisible !== false);

    return {
      basics: {
        name: fullName,
        label: profile.headline || undefined,
        image: profile.avatarUrl || undefined,
        email: profile.contactInfo?.emailPublic
          ? profile.contactInfo.email || undefined
          : undefined,
        phone: profile.contactInfo?.phonePublic
          ? cleanPhoneDisplay(profile.contactInfo.phone || '') || undefined
          : undefined,
        url: profile.contactInfo?.website || undefined,
        summary: profile.summary || undefined,
        location: profile.location
          ? {
              city: profile.location,
            }
          : undefined,
        profiles: visibleLinks.map((link) => ({
          network: link.type,
          url: link.url,
          username: link.label || undefined,
        })),
      },
      work: visibleExperiences.map((exp) => ({
        name: exp.company,
        position: exp.role,
        url: exp.companyUrl || undefined,
        startDate: formatDate(exp.startDate, { year: 'numeric', month: '2-digit' }),
        endDate: exp.isCurrent
          ? undefined
          : formatDate(exp.endDate, { year: 'numeric', month: '2-digit' }) || undefined,
        summary:
          exp.bullets.length > 0 ? exp.bullets.map((b) => stripHtmlTags(b)).join('. ') : undefined,
        highlights: exp.bullets.map((b) => stripHtmlTags(b)),
      })),
      education: visibleEducations.map((edu) => ({
        institution: edu.institution,
        url: edu.institutionUrl || undefined,
        area: edu.fieldOfStudy || undefined,
        studyType: edu.degree || undefined,
        startDate: formatDate(edu.startDate, { year: 'numeric', month: '2-digit' }) || undefined,
        endDate: edu.isCurrent
          ? undefined
          : formatDate(edu.endDate, { year: 'numeric', month: '2-digit' }) || undefined,
        score: edu.gpa || undefined,
        courses: edu.activities,
      })),
      skills:
        visibleSkillGroups.length > 0
          ? visibleSkillGroups.map((group) => ({
              name: group.name,
              level: undefined,
              keywords: group.skills.map((s) => s.name),
            }))
          : visibleSkills.map((skill) => ({
              name: skill.name,
              level: skill.level || undefined,
              keywords: [],
            })),
      projects: visibleProjects.map((project) => ({
        name: project.title,
        description: project.description || undefined,
        highlights: project.highlights,
        keywords: project.techStack,
        startDate:
          formatDate(project.startDate, { year: 'numeric', month: '2-digit' }) || undefined,
        endDate: project.isCurrent
          ? undefined
          : formatDate(project.endDate, { year: 'numeric', month: '2-digit' }) || undefined,
        url: project.url || project.repoUrl || undefined,
      })),
      awards: visibleAwards.map((award) => ({
        title: award.title,
        date: formatDate(award.date, { year: 'numeric', month: '2-digit' }) || undefined,
        awarder: award.issuer || undefined,
        summary: award.description || undefined,
      })),
      certificates: visibleCerts.map((cert) => ({
        name: cert.name,
        date: formatDate(cert.issueDate, { year: 'numeric', month: '2-digit' }) || undefined,
        issuer: cert.issuer,
        url: cert.credentialUrl || undefined,
      })),
    };
  } catch (error) {
    serviceLogger.error('Failed to convert profile to JSON Resume format', error);
    throw error;
  }
}

/**
 * Convert profile to plain text format
 */
export function toPlainText(profile: FullProfile): string {
  try {
    const lines: string[] = [];
    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

    // Filter hidden items
    const visibleExperiences = profile.workExperiences.filter((e) => e.isVisible !== false);
    const visibleEducations = profile.educations.filter((e) => e.isVisible !== false);
    const visibleSkills = profile.skills.filter((s) => s.isVisible !== false);
    const visibleProjects = profile.projects.filter(
      (p) => p.isVisible !== false && p.showOnResume !== false
    );
    const visibleCerts = profile.certifications.filter((c) => c.isVisible !== false);

    // Header
    lines.push(fullName.toUpperCase());
    if (profile.headline) lines.push(profile.headline);

    // Contact – respects user-configured header field order
    const contactItems = getOrderedContactItems(profile);
    if (contactItems.length > 0) {
      lines.push(contactItems.map((c) => c.value).join(' | '));
    }
    lines.push('');

    // Render body sections in user-configured sortOrder
    const sectionOrder = getOrderedBodySections(profile);

    for (const sectionType of sectionOrder) {
      switch (sectionType) {
        case 'SUMMARY':
          if (profile.summary && !isHtmlEmpty(profile.summary)) {
            lines.push('SUMMARY');
            lines.push('-'.repeat(50));
            lines.push(profile.summary);
            lines.push('');
          }
          break;

        case 'EXPERIENCE':
          if (visibleExperiences.length > 0) {
            lines.push('EXPERIENCE');
            lines.push('-'.repeat(50));
            visibleExperiences.forEach((exp) => {
              const dateRange = exp.isCurrent
                ? `${formatDate(exp.startDate)} - Present`
                : `${formatDate(exp.startDate)} - ${formatDate(exp.endDate)}`;
              lines.push(`${exp.role} | ${exp.company}`);
              lines.push(`${dateRange}${exp.location ? ` | ${exp.location}` : ''}`);
              exp.bullets.forEach((bullet) => {
                lines.push(`• ${stripHtmlTags(bullet)}`);
              });
              lines.push('');
            });
          }
          break;

        case 'EDUCATION':
          if (visibleEducations.length > 0) {
            lines.push('EDUCATION');
            lines.push('-'.repeat(50));
            visibleEducations.forEach((edu) => {
              lines.push(`${edu.degree || ''} ${edu.fieldOfStudy || ''}`);
              lines.push(edu.institution);
              if (edu.startDate || edu.endDate) {
                const dateRange = edu.isCurrent
                  ? `${formatDate(edu.startDate)} - Present`
                  : `${formatDate(edu.startDate)} - ${formatDate(edu.endDate)}`;
                lines.push(dateRange);
              }
              if (edu.gpa) lines.push(`GPA: ${edu.gpa}`);
              lines.push('');
            });
          }
          break;

        case 'SKILLS': {
          const visibleSkillGroups = profile.skillGroups
            .map((g) => ({
              ...g,
              skills: g.skills.filter((s) => s.isVisible !== false),
            }))
            .filter((g) => g.skills.length > 0 || !isHtmlEmpty(g.skillsHtml));
          const groupNames = visibleSkillGroups.map((g) => g.name);
          const hasLabels = skillGroupsHaveCategoryLabels(visibleSkillGroups);

          if (visibleSkillGroups.length > 0) {
            lines.push('SKILLS');
            lines.push('-'.repeat(50));
            for (const group of visibleSkillGroups) {
              const label = resolveSkillCategoryLabel(group.name, groupNames);
              const fromHtml =
                group.skillsHtml && !isHtmlEmpty(group.skillsHtml)
                  ? stripHtmlTags(group.skillsHtml).replace(/\n+/g, ', ')
                  : '';
              const items = fromHtml || group.skills.map((s) => s.name).join(', ');
              if (!items.trim()) continue;
              lines.push(label ? `${label}: ${items}` : items);
            }
            lines.push('');
          } else if (visibleSkills.length > 0) {
            lines.push('SKILLS');
            lines.push('-'.repeat(50));
            lines.push(visibleSkills.map((s) => s.name).join(', '));
            lines.push('');
          }
          break;
        }

        case 'PROJECTS':
          if (visibleProjects.length > 0) {
            lines.push('PROJECTS');
            lines.push('-'.repeat(50));
            visibleProjects.forEach((project) => {
              lines.push(project.title);
              if (project.description) lines.push(project.description);
              if (project.techStack.length > 0) {
                lines.push(`Technologies: ${project.techStack.join(', ')}`);
              }
              if (project.url) lines.push(`URL: ${project.url}`);
              lines.push('');
            });
          }
          break;

        case 'CERTIFICATIONS':
          if (visibleCerts.length > 0) {
            lines.push('CERTIFICATIONS');
            lines.push('-'.repeat(50));
            visibleCerts.forEach((cert) => {
              lines.push(`${cert.name} - ${cert.issuer}`);
              if (cert.issueDate) lines.push(`Issued: ${formatDate(cert.issueDate)}`);
            });
            lines.push('');
          }
          break;

        case 'AWARDS':
          if ((profile.awards || []).filter((a) => a.isVisible !== false).length > 0) {
            const visibleAwards = profile.awards.filter((a) => a.isVisible !== false);
            lines.push('AWARDS');
            lines.push('-'.repeat(50));
            visibleAwards.forEach((award) => {
              lines.push(award.title);
              if (award.issuer) lines.push(award.issuer);
              if (award.date) lines.push(formatDate(award.date));
              if (award.description) lines.push(award.description);
            });
            lines.push('');
          }
          break;

        default:
          break;
      }
    }

    return lines.join('\n');
  } catch (error) {
    serviceLogger.error('Failed to convert profile to plain text', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════
// PDF HTML GENERATION
// Renders the same HTML structure and CSS classes as CleanResumeView
// so the exported PDF is visually identical to the on-screen preview.
// ═══════════════════════════════════════════════════════════════════

/** Google Fonts URLs — mirrors resume-font-loader.tsx (system fonts return null). */
const GOOGLE_FONT_URLS: Partial<Record<ResumeFontFamily, string>> = {
  garamond:
    'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap',
  inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  roboto:
    'https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400&display=swap',
  lato: 'https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,300;0,400;0,700;1,400&display=swap',
  merriweather:
    'https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&display=swap',
  'source-sans':
    'https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,300;0,400;0,600;0,700;1,400&display=swap',
  'open-sans':
    'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300;0,400;0,600;0,700;1,400&display=swap',
  raleway:
    'https://fonts.googleapis.com/css2?family=Raleway:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap',
  'instrument-sans':
    'https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
  'dm-sans':
    'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
  'great-vibes': 'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap',
};

/** Strip URL protocol and trailing slash for cleaner contact display. */
function displayUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

/** Format a date for the resume (short month + year). */
function formatResumeDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  return formatDate(date, { month: 'short', year: 'numeric' });
}

/** Build "start – end" range, respecting isCurrent. */
function formatDateRange(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  isCurrent?: boolean
): string {
  const start = formatResumeDate(startDate);
  const end = isCurrent ? 'Present' : formatResumeDate(endDate);
  if (!start && !end) return '';
  if (!start) return end;
  if (!end) return start;
  return `${start} – ${end}`;
}

/** Language proficiency label map. */
const PROFICIENCY_LABELS: Record<string, string> = {
  NATIVE: 'Native',
  FLUENT: 'Fluent',
  ADVANCED: 'Advanced',
  INTERMEDIATE: 'Intermediate',
  BASIC: 'Basic',
};

/**
 * Get body sections as actual ProfileSection objects sorted by sortOrder.
 * Returns sections that are non-header and visible.
 */
function getOrderedSectionObjects(profile: FullProfile): ProfileSection[] {
  if (!profile.sections || profile.sections.length === 0) {
    // Fallback: synthesise minimal sections in legacy order
    return [
      'SUMMARY',
      'EXPERIENCE',
      'EDUCATION',
      'SKILLS',
      'PROJECTS',
      'CERTIFICATIONS',
      'AWARDS',
    ].map((type, i) => ({
      id: `fallback-${type}`,
      profileId: profile.id,
      type,
      title: type.charAt(0) + type.slice(1).toLowerCase(),
      sortOrder: i,
      isVisible: true,
      customContent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as unknown as ProfileSection[];
  }

  return [...profile.sections]
    .filter((s) => !HEADER_SECTION_TYPES.includes(s.type) && s.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// ── Section divider HTML ──────────────────────────────────────────

function sectionDividerHtml(title: string): string {
  return `
    <div class="resume-section-header">
      <h2 class="resume-section-title">${escapeHtml(title)}</h2>
      <div class="resume-section-line"></div>
    </div>`;
}

// ── Section HTML renderers ────────────────────────────────────────

function summarySectionHtml(profile: FullProfile, title = 'SUMMARY'): string {
  if (!profile.summary || isHtmlEmpty(profile.summary)) return '';
  // Summary may contain rich HTML from the editor — sanitize before embedding.
  const content = containsHtmlFormatting(profile.summary)
    ? sanitizeRichHtml(profile.summary)
    : escapeHtml(profile.summary);
  return `
  <section class="resume-section">
    ${sectionDividerHtml(title)}
    <div class="resume-summary resume-rich-html">${content}</div>
  </section>`;
}

function atelierContactIconSvg(kind: 'phone' | 'email' | 'website' | 'link'): string {
  if (kind === 'phone') {
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z"/></svg>`;
  }
  if (kind === 'email') {
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
  }
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
}

function experienceSectionHtml(profile: FullProfile, atelier = false): string {
  const items = profile.workExperiences.filter((e) => e.isVisible !== false);
  if (items.length === 0) return '';

  const entries = items
    .map((exp) => {
      const dateRange = atelier
        ? formatAtelierYearRange(exp.startDate, exp.endDate, exp.isCurrent)
        : formatDateRange(exp.startDate, exp.endDate, exp.isCurrent);
      const companyLine = [exp.company, exp.location].filter(Boolean).join(', ');

      // Prefer bulletsHtml for perfect rendering (same as CleanResumeView).
      // All editor-authored HTML is sanitized before embedding in the PDF.
      let bulletsHtml = '';
      if (exp.bulletsHtml) {
        bulletsHtml = sanitizeRichHtml(exp.bulletsHtml);
      } else if (exp.bullets && exp.bullets.length > 0) {
        const lis = exp.bullets
          .map((b) =>
            containsHtmlFormatting(b)
              ? `<li>${sanitizeRichHtml(b)}</li>`
              : `<li>${escapeHtml(b)}</li>`
          )
          .join('');
        bulletsHtml = `<ul class="resume-bullets">${lis}</ul>`;
      }

      if (atelier) {
        return `
      <div class="resume-entry resume-atelier-exp">
        <div class="resume-atelier-exp-grid">
          <span class="resume-entry-date">${dateRange}</span>
          <div class="resume-atelier-exp-body">
            <h3 class="resume-entry-title">${escapeHtml(exp.company)}</h3>
            <p class="resume-entry-subtitle">${escapeHtml(exp.role)}</p>
            ${bulletsHtml}
          </div>
        </div>
      </div>`;
      }

      return `
      <div class="resume-entry">
        <div class="resume-entry-header">
          <div class="resume-entry-title-block">
            <h3 class="resume-entry-title">${escapeHtml(exp.role)}</h3>
            <p class="resume-entry-subtitle">${escapeHtml(companyLine)}</p>
          </div>
          ${dateRange ? `<span class="resume-entry-date">${dateRange}</span>` : ''}
        </div>
        ${bulletsHtml}
      </div>`;
    })
    .join('');

  return `
  <section class="resume-section">
    ${sectionDividerHtml(atelier ? 'WORK EXPERIENCE' : 'EXPERIENCE')}
    <div class="resume-entries">${entries}</div>
  </section>`;
}

function educationSectionHtml(profile: FullProfile, atelier = false): string {
  const items = profile.educations.filter((e) => e.isVisible !== false);
  if (items.length === 0) return '';

  const entries = items
    .map((edu) => {
      const degreeLine = [edu.degree, edu.fieldOfStudy].filter(Boolean).join(' in ');
      const dateRange = atelier
        ? formatAtelierYearRange(edu.startDate, edu.endDate, edu.isCurrent)
        : formatDateRange(edu.startDate, edu.endDate, edu.isCurrent);

      let detailsHtml = '';
      if (edu.gpa || edu.activities) {
        const parts: string[] = [];
        if (edu.gpa) parts.push(`<p>GPA: ${escapeHtml(edu.gpa)}</p>`);
        if (edu.activities) parts.push(`<p>${escapeHtml(String(edu.activities))}</p>`);
        detailsHtml = `<div class="resume-entry-details">${parts.join('')}</div>`;
      }

      if (atelier) {
        const meta = [dateRange, edu.location].filter(Boolean).join(' · ');
        return `
      <div class="resume-entry resume-atelier-edu">
        <h3 class="resume-entry-title">${escapeHtml(degreeLine || edu.institution)}</h3>
        ${degreeLine ? `<p class="resume-entry-subtitle">${escapeHtml(edu.institution)}</p>` : ''}
        ${meta ? `<p class="resume-atelier-edu-meta">${escapeHtml(meta)}</p>` : ''}
        ${detailsHtml}
      </div>`;
      }

      return `
      <div class="resume-entry">
        <div class="resume-entry-header">
          <div class="resume-entry-title-block">
            <h3 class="resume-entry-title">${escapeHtml(degreeLine || edu.institution)}</h3>
            ${degreeLine ? `<p class="resume-entry-subtitle">${escapeHtml(edu.institution)}</p>` : ''}
          </div>
          ${dateRange ? `<span class="resume-entry-date">${dateRange}</span>` : ''}
        </div>
        ${detailsHtml}
      </div>`;
    })
    .join('');

  return `
  <section class="resume-section">
    ${sectionDividerHtml('EDUCATION')}
    <div class="resume-entries">${entries}</div>
  </section>`;
}

function skillsSectionHtml(profile: FullProfile, options: { stacked?: boolean } = {}): string {
  const { stacked = false } = options;
  const visibleSkillGroups = profile.skillGroups
    .map((g) => ({ ...g, skills: g.skills.filter((s) => s.isVisible !== false) }))
    .filter((g) => g.skills.length > 0 || !isHtmlEmpty(g.skillsHtml));
  const visibleSkills = profile.skills.filter((s) => s.isVisible !== false);
  const groupNames = visibleSkillGroups.map((g) => g.name);
  const hasCategoryLabels = skillGroupsHaveCategoryLabels(visibleSkillGroups);
  const hasRichHtml = visibleSkillGroups.some((g) => g.skillsHtml && !isHtmlEmpty(g.skillsHtml));

  if (visibleSkillGroups.length > 0 && (hasCategoryLabels || hasRichHtml)) {
    const groups = visibleSkillGroups
      .map((g) => {
        const label = resolveSkillCategoryLabel(g.name, groupNames);
        const labelHtml = label
          ? `<span class="resume-skill-group-name">${escapeHtml(label)}: </span>`
          : '';
        if (g.skillsHtml && !isHtmlEmpty(g.skillsHtml)) {
          return `<div class="resume-skill-group">${labelHtml}<div class="resume-skill-group-items resume-rich-html resume-skill-group-rich">${sanitizeRichHtml(g.skillsHtml)}</div></div>`;
        }
        const items = g.skills.map((s) => escapeHtml(s.name)).join(', ');
        return `<div class="resume-skill-group">${labelHtml}<span class="resume-skill-group-items">${items}</span></div>`;
      })
      .join('');
    return `
  <section class="resume-section">
    ${sectionDividerHtml('SKILLS')}
    <div class="resume-skills-grouped">${groups}</div>
  </section>`;
  }

  const flatNames =
    visibleSkillGroups.length > 0
      ? visibleSkillGroups.flatMap((g) => g.skills.map((s) => s.name))
      : visibleSkills.map((s) => s.name);

  if (flatNames.length === 0) return '';

  if (stacked) {
    return `
  <section class="resume-section">
    ${sectionDividerHtml('SKILLS')}
    <ul class="resume-skills-stack">${flatNames
      .map((name) => `<li class="resume-skills-stack-item">${escapeHtml(name)}</li>`)
      .join('')}</ul>
  </section>`;
  }

  return `
  <section class="resume-section">
    ${sectionDividerHtml('SKILLS')}
    <p class="resume-skills-flat">${flatNames.map((name) => escapeHtml(name)).join(', ')}</p>
  </section>`;
}

function projectsSectionHtml(profile: FullProfile): string {
  const items = profile.projects.filter((p) => p.isVisible !== false && p.showOnResume !== false);
  if (items.length === 0) return '';

  const entries = items
    .map((p) => {
      const dateRange = formatDateRange(p.startDate, p.endDate, p.isCurrent);
      const description = p.customDescription || p.shortDesc || p.description;
      const descHtml =
        description && containsHtmlFormatting(description)
          ? `<div class="resume-entry-description resume-rich-html">${sanitizeRichHtml(description)}</div>`
          : description
            ? `<div class="resume-entry-description resume-rich-html">${escapeHtml(description)}</div>`
            : '';

      let highlightsHtml = '';
      if (p.highlights && p.highlights.length > 0) {
        const lis = p.highlights
          .map((h) =>
            containsHtmlFormatting(h)
              ? `<li>${sanitizeRichHtml(h)}</li>`
              : `<li>${escapeHtml(h)}</li>`
          )
          .join('');
        highlightsHtml = `<ul class="resume-bullets">${lis}</ul>`;
      }

      return `
      <div class="resume-entry">
        <div class="resume-entry-header">
          <div class="resume-entry-title-block">
            <h3 class="resume-entry-title">${escapeHtml(p.title)}</h3>
            ${p.techStack && p.techStack.length > 0 ? `<p class="resume-entry-tech">${p.techStack.map((t) => escapeHtml(t)).join(', ')}</p>` : ''}
          </div>
          ${dateRange ? `<span class="resume-entry-date">${dateRange}</span>` : ''}
        </div>
        ${descHtml}
        ${highlightsHtml}
      </div>`;
    })
    .join('');

  return `
  <section class="resume-section">
    ${sectionDividerHtml('PROJECTS')}
    <div class="resume-entries">${entries}</div>
  </section>`;
}

function certificationsSectionHtml(profile: FullProfile): string {
  const items = profile.certifications.filter((c) => c.isVisible !== false);
  if (items.length === 0) return '';

  const entries = items
    .map((cert) => {
      const issuedDate = formatResumeDate(cert.issueDate);
      const expDate = cert.expirationDate ? formatResumeDate(cert.expirationDate) : null;
      return `
      <div class="resume-entry-inline">
        <span class="resume-entry-inline-title">${escapeHtml(cert.name)}</span>
        <span class="resume-entry-inline-issuer"> — ${escapeHtml(cert.issuer)}</span>
        ${issuedDate ? `<span class="resume-entry-inline-date"> (${issuedDate}${expDate ? `, expires ${expDate}` : ''})</span>` : ''}
      </div>`;
    })
    .join('');

  return `
  <section class="resume-section">
    ${sectionDividerHtml('CERTIFICATIONS')}
    <div class="resume-entries resume-entries-compact">${entries}</div>
  </section>`;
}

function awardsSectionHtml(profile: FullProfile, title = 'AWARDS & RECOGNITION'): string {
  const items = profile.awards.filter((a) => a.isVisible !== false);
  if (items.length === 0) return '';

  const entries = items
    .map((award) => {
      const awardDate = formatResumeDate(award.date);
      return `
      <div class="resume-entry-inline">
        <span class="resume-entry-inline-title">${escapeHtml(award.title)}</span>
        ${award.issuer ? `<span class="resume-entry-inline-issuer"> — ${escapeHtml(award.issuer)}</span>` : ''}
        ${awardDate ? `<span class="resume-entry-inline-date"> (${awardDate})</span>` : ''}
        ${award.description ? `<p class="resume-entry-inline-description">${escapeHtml(award.description)}</p>` : ''}
      </div>`;
    })
    .join('');

  return `
  <section class="resume-section">
    ${sectionDividerHtml(title)}
    <div class="resume-entries resume-entries-compact">${entries}</div>
  </section>`;
}

function publicationsSectionHtml(items: PublicationItem[]): string {
  if (!items || items.length === 0) return '';

  const entries = items
    .filter((p) => p.isVisible !== false)
    .map((pub) => {
      const safeHref = safeUrl(pub.url);
      const titleHtml = safeHref
        ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(pub.title)}</a>`
        : escapeHtml(pub.title);
      return `
      <div class="resume-publication">
        <p class="resume-publication-title">${titleHtml}</p>
        ${pub.authors ? `<p class="resume-publication-authors">${escapeHtml(pub.authors)}</p>` : ''}
        <p class="resume-publication-meta">${[pub.publisher, pub.date]
          .filter(Boolean)
          .map((s) => escapeHtml(s!))
          .join(', ')}</p>
      </div>`;
    })
    .join('');

  return `
  <section class="resume-section">
    ${sectionDividerHtml('PUBLICATIONS')}
    <div class="resume-entries resume-entries-compact">${entries}</div>
  </section>`;
}

function volunteeringSectionHtml(items: VolunteeringItem[]): string {
  if (!items || items.length === 0) return '';

  const entries = items
    .filter((v) => v.isVisible !== false)
    .map((vol) => {
      const dateRange = formatDateRange(vol.startDate, vol.endDate, vol.isCurrent);
      return `
      <div class="resume-entry">
        <div class="resume-entry-header">
          <div class="resume-entry-title-block">
            <h3 class="resume-entry-title">${escapeHtml(vol.role)}</h3>
            <p class="resume-entry-subtitle">${escapeHtml(vol.organization)}</p>
          </div>
          ${dateRange ? `<span class="resume-entry-date">${dateRange}</span>` : ''}
        </div>
        ${vol.description ? `<p class="resume-entry-description">${escapeHtml(vol.description)}</p>` : ''}
      </div>`;
    })
    .join('');

  return `
  <section class="resume-section">
    ${sectionDividerHtml('VOLUNTEERING')}
    <div class="resume-entries">${entries}</div>
  </section>`;
}

function languagesSectionHtml(items: LanguageItem[]): string {
  if (!items || items.length === 0) return '';

  const visible = items.filter((l) => l.isVisible !== false);
  if (visible.length === 0) return '';

  const text = visible
    .map((l) => `${escapeHtml(l.language)} (${PROFICIENCY_LABELS[l.proficiency] || l.proficiency})`)
    .join(', ');

  return `
  <section class="resume-section">
    ${sectionDividerHtml('LANGUAGES')}
    <p class="resume-languages">${text}</p>
  </section>`;
}

function interestsSectionHtml(items: InterestItem[]): string {
  if (!items || items.length === 0) return '';

  const visible = items.filter((i) => i.isVisible !== false);
  if (visible.length === 0) return '';

  return `
  <section class="resume-section">
    ${sectionDividerHtml('INTERESTS')}
    <p class="resume-interests">${visible.map((i) => escapeHtml(i.name)).join(', ')}</p>
  </section>`;
}

function referencesSectionHtml(items: ReferenceItem[]): string {
  if (!items || items.length === 0) return '';

  const entries = items
    .filter((r) => r.isVisible !== false)
    .map((ref) => {
      const roleLine = [ref.title, ref.company].filter(Boolean).join(', ');
      const contactLine = [ref.email, ref.phone].filter(Boolean).join(' · ');
      return `
      <div class="resume-reference">
        <p class="resume-reference-name">${escapeHtml(ref.name)}</p>
        ${roleLine ? `<p class="resume-reference-role">${escapeHtml(roleLine)}</p>` : ''}
        ${
          ref.relationship
            ? `<p class="resume-reference-relationship">${escapeHtml(ref.relationship)}</p>`
            : ''
        }
        ${contactLine ? `<p class="resume-reference-contact">${escapeHtml(contactLine)}</p>` : ''}
      </div>`;
    })
    .join('');

  if (!entries) return '';

  return `
  <section class="resume-section">
    ${sectionDividerHtml('REFERENCES')}
    <div class="resume-entries resume-entries-compact">${entries}</div>
  </section>`;
}

function customSectionHtml(section: ProfileSection): string {
  const content = section.customContent as CustomSectionContent | null;
  const items = content?.items || [];
  const freeformContent = content?.content;

  if (items.length === 0 && !freeformContent) return '';

  let entriesHtml = '';
  if (items.length > 0) {
    entriesHtml = `<div class="resume-entries">${items
      .filter((item: CustomSectionItem) => item.isVisible !== false)
      .map((item: CustomSectionItem) => {
        const dateRange =
          item.startDate || item.endDate || item.isCurrent
            ? `${item.startDate || ''} – ${item.isCurrent ? 'Present' : item.endDate || ''}`
            : '';
        return `
        <div class="resume-entry">
          <div class="resume-entry-header">
            <div class="resume-entry-title-block">
              <h3 class="resume-entry-title">${escapeHtml(item.title)}</h3>
              ${item.subtitle ? `<p class="resume-entry-subtitle">${escapeHtml(item.subtitle)}</p>` : ''}
            </div>
            ${dateRange ? `<span class="resume-entry-date">${dateRange}</span>` : ''}
          </div>
          ${item.description ? `<p class="resume-entry-description">${escapeHtml(item.description)}</p>` : ''}
          ${item.tags && item.tags.length > 0 ? `<p class="resume-entry-tags">${item.tags.map((t) => escapeHtml(t)).join(', ')}</p>` : ''}
        </div>`;
      })
      .join('')}</div>`;
  }

  const freeformHtml = freeformContent
    ? `<p class="resume-freeform">${escapeHtml(freeformContent)}</p>`
    : '';

  return `
  <section class="resume-section">
    ${sectionDividerHtml(section.title.toUpperCase())}
    ${entriesHtml}
    ${freeformHtml}
  </section>`;
}

/** Extract custom-content items typed as T from a section. */
function getCustomContentItems<T>(section: ProfileSection): T[] {
  const content = section.customContent as unknown as { items?: T[] } | null;
  return content?.items || [];
}

/** Render a single body section by its type (mirrors CleanResumeView's renderSection). */
function renderSectionHtml(
  section: ProfileSection,
  profile: FullProfile,
  options: { stackedSkills?: boolean; atelier?: boolean } = {}
): string {
  switch (section.type) {
    case 'SUMMARY':
      return summarySectionHtml(profile, options.atelier ? 'PROFILE' : 'SUMMARY');
    case 'EXPERIENCE':
      return experienceSectionHtml(profile, options.atelier === true);
    case 'EDUCATION':
      return educationSectionHtml(profile, options.atelier === true);
    case 'SKILLS':
      return skillsSectionHtml(profile, {
        stacked: options.stackedSkills === true,
      });
    case 'PROJECTS':
      return projectsSectionHtml(profile);
    case 'CERTIFICATIONS':
      return certificationsSectionHtml(profile);
    case 'AWARDS':
      return awardsSectionHtml(profile, options.atelier ? 'AWARDS' : 'AWARDS & RECOGNITION');
    case 'PUBLICATIONS':
      return publicationsSectionHtml(getCustomContentItems<PublicationItem>(section));
    case 'VOLUNTEERING':
      return volunteeringSectionHtml(getCustomContentItems<VolunteeringItem>(section));
    case 'LANGUAGES':
      return languagesSectionHtml(getCustomContentItems<LanguageItem>(section));
    case 'INTERESTS':
      return interestsSectionHtml(getCustomContentItems<InterestItem>(section));
    case 'REFERENCES':
      return referencesSectionHtml(getCustomContentItems<ReferenceItem>(section));
    case 'CUSTOM':
      return customSectionHtml(section);
    default:
      return '';
  }
}

// ── The complete CSS that mirrors globals.css resume classes ─────

const RESUME_CSS = `
  /* Reset */
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body { margin: 0; padding: 0; background: white; }

  /* Paper container */
  .resume-paper {
    background: white;
    color: #1a1a1a;
    max-width: 816px;
    padding: 48px 56px;
    font-family: var(--rd-font-family, 'Georgia', 'Times New Roman', Times, serif);
    font-size: var(--rd-font-size, 13px);
    font-weight: var(--rd-body-font-weight, 400);
    font-style: var(--rd-body-font-style, normal);
    text-decoration: var(--rd-body-text-decoration, none);
    line-height: 1.5;
    margin: 0 auto;
  }

  /* Header */
  .resume-header {
    text-align: var(--rd-header-alignment, center);
    margin-bottom: var(--rd-header-margin-bottom, 24px);
  }
  .resume-header-identity {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    min-width: 0;
    width: 100%;
  }
  .resume-header[data-header-composition='photo-left'] {
    text-align: left;
  }
  .resume-header[data-header-composition='photo-left'] .resume-header-identity {
    flex-direction: row;
  }
  .resume-header[data-header-composition='photo-left'] .resume-header-text {
    flex: 1;
    min-width: 0;
    text-align: left;
  }
  .resume-header[data-header-composition='photo-right'] {
    text-align: left;
  }
  .resume-header[data-header-composition='photo-right'] .resume-header-identity {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
  }
  .resume-header[data-header-composition='photo-right'] .resume-header-text {
    flex: 1;
    min-width: 0;
    text-align: left;
  }
  .resume-header[data-header-composition='photo-above'] {
    text-align: center;
  }
  .resume-header[data-header-composition='photo-above'] .resume-header-identity {
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .resume-header[data-header-composition='photo-above-left'] {
    text-align: left;
  }
  .resume-header[data-header-composition='photo-above-left'] .resume-header-identity {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .resume-name {
    font-family: var(--rd-font-name, inherit);
    font-size: var(--rd-name-font-size, 28px);
    font-weight: var(--rd-name-font-weight, 700);
    font-style: var(--rd-name-font-style, normal);
    text-decoration: var(--rd-name-text-decoration, none);
    letter-spacing: 0.02em;
    margin: 0;
    color: var(--rd-heading-color, inherit);
  }
  .resume-headline {
    font-family: var(--rd-font-title, inherit);
    font-size: var(--rd-title-font-size, 15px);
    font-weight: var(--rd-title-font-weight, 400);
    font-style: var(--rd-title-font-style, italic);
    text-decoration: var(--rd-title-text-decoration, none);
    color: #555;
    margin-top: 4px;
  }
  .resume-contact-line {
    font-family: var(--rd-font-contact, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    font-size: var(--rd-contact-font-size, 12px);
    font-weight: var(--rd-contact-font-weight, 400);
    font-style: var(--rd-contact-font-style, normal);
    text-decoration: var(--rd-contact-text-decoration, none);
    color: #666;
    margin-top: 10px;
  }
  .resume-contact-separator { color: #999; }
  .resume-header-photo {
    width: var(--rd-photo-size, 80px);
    height: var(--rd-photo-size, 80px);
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  /* Sections */
  .resume-section {
    margin-top: var(--rd-section-gap, 20px);
  }
  .resume-section-header { margin-bottom: 12px; }
  .resume-section-title {
    font-size: var(--rd-heading-font-size, 12px);
    font-weight: var(--rd-heading-font-weight, 700);
    font-style: var(--rd-heading-font-style, normal);
    text-decoration: var(--rd-heading-text-decoration, none);
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--rd-heading-color, inherit);
    margin: 0 0 6px 0;
    font-family: var(--rd-font-heading, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  }
  .resume-section-line {
    height: var(--rd-divider-height, 1px);
    background: var(--rd-divider-bg, currentColor);
    border-top: var(--rd-divider-border, none);
    border-bottom: var(--rd-divider-border-bottom, none);
    opacity: var(--rd-divider-opacity, 0.2);
  }

  /* Summary */
  .resume-summary { text-align: justify; margin: 0; }

  /* Entry blocks */
  .resume-entries {
    display: flex;
    flex-direction: column;
    gap: var(--rd-entry-gap, 16px);
  }
  .resume-entries-compact { gap: 8px; }
  .resume-entry { break-inside: avoid; }
  .resume-entry-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }
  .resume-entry-title-block { flex: 1; min-width: 0; }
  .resume-entry-title { font-size: 14px; font-weight: 600; margin: 0; color: inherit; }
  .resume-entry-subtitle { font-size: 13px; color: #555; margin: 1px 0 0 0; }
  .resume-entry-date {
    font-size: 12px;
    color: #666;
    white-space: nowrap;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    flex-shrink: 0;
  }
  .resume-entry-tech {
    font-size: 11px;
    color: #777;
    margin: 2px 0 0 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  .resume-entry-description { font-size: 13px; margin: 6px 0 0 0; text-align: justify; }
  .resume-entry-details { margin-top: 4px; font-size: 12px; color: #666; }
  .resume-entry-details p { margin: 2px 0; }
  .resume-entry-tags {
    font-size: 11px; color: #777; margin-top: 4px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  /* Bullets */
  .resume-bullets {
    margin: var(--rd-bullet-margin, 8px) 0 0 0;
    padding-left: 18px;
    list-style: disc;
  }
  .resume-bullets li { margin-bottom: 3px; padding-left: 4px; }
  .resume-bullets li strong { font-weight: 600; }
  .resume-bullets li em { font-style: italic; }
  .resume-bullets li u { text-decoration: underline; }
  .resume-bullets li::marker { color: var(--rd-accent-color, #666); opacity: 0.6; }

  /* Rich-text editor HTML in resume entries */
  .resume-entry .rich-text-bullets,
  .resume-entry ul[data-bullet-style] {
    margin: var(--rd-bullet-margin, 8px) 0 0 0;
    padding-left: 18px;
    list-style: disc;
  }
  .resume-entry .rich-text-bullets li,
  .resume-entry ul[data-bullet-style] li {
    margin-bottom: 3px;
    padding-left: 4px;
  }
  .resume-entry .rich-text-bullets li p,
  .resume-entry ul[data-bullet-style] li p { margin: 0; }
  .resume-entry ul.bullet-style-disc { list-style-type: disc; }
  .resume-entry ul.bullet-style-circle { list-style-type: circle; }
  .resume-entry ul.bullet-style-square { list-style-type: square; }
  .resume-entry ul.bullet-style-dash { list-style-type: '–  '; }
  .resume-entry ol.rich-text-ordered {
    margin: 8px 0 0 0; padding-left: 18px; list-style-type: decimal;
  }
  .resume-entry ol.rich-text-ordered li { margin-bottom: 3px; padding-left: 4px; }
  .resume-entry ol.rich-text-ordered li p { margin: 0; }

  /* Rich HTML prose (summary, descriptions) */
  .resume-rich-html { text-align: justify; margin: 0; }
  .resume-rich-html p { margin: 0.15em 0; }
  .resume-rich-html p:first-child { margin-top: 0; }
  .resume-rich-html p:last-child { margin-bottom: 0; }
  .resume-rich-html strong { font-weight: 600; }
  .resume-rich-html em { font-style: italic; }
  .resume-rich-html u { text-decoration: underline; }

  /* Skills — justified by default; category lines wrap flush left */
  .resume-skills-grouped { display: flex; flex-direction: column; gap: 4px; }
  .resume-skill-group { font-size: 13px; margin: 0; text-align: justify; line-height: 1.45; }
  .resume-skill-group-name { font-weight: 600; }
  .resume-skill-group-items { color: inherit; }
  .resume-skill-group-rich { display: inline; }
  .resume-skill-group-rich > p { display: inline; margin: 0; }
  .resume-skill-group-rich > p + p { display: block; margin-top: 0.15em; }
  .resume-skill-group-rich > ul,
  .resume-skill-group-rich > ol { display: block; margin: 4px 0 0 0; padding-left: 18px; }
  .resume-skill-group-rich > ul li,
  .resume-skill-group-rich > ol li { margin-bottom: 2px; }
  .resume-skills-flat { font-size: 13px; margin: 0; text-align: justify; line-height: 1.45; }

  /* Inline entries (certs, awards) */
  .resume-entry-inline { font-size: 13px; margin-bottom: 4px; }
  .resume-entry-inline-title { font-weight: 600; }
  .resume-entry-inline-issuer { color: #555; }
  .resume-entry-inline-date { color: #777; font-size: 12px; }
  .resume-entry-inline-description { font-size: 12px; color: #666; margin: 2px 0 0 0; padding-left: 12px; }

  /* Publications */
  .resume-publication { margin-bottom: 10px; }
  .resume-publication-title { font-weight: 600; margin: 0; }
  .resume-publication-title a { color: inherit; text-decoration: none; border-bottom: 1px dotted currentColor; }
  .resume-publication-authors { font-size: 12px; color: #555; margin: 2px 0 0 0; }
  .resume-publication-meta { font-size: 12px; color: #777; font-style: italic; margin: 2px 0 0 0; }

  /* Languages & Interests */
  .resume-languages, .resume-interests { font-size: 13px; margin: 0; }

  /* References */
  .resume-reference { margin-bottom: 10px; }
  .resume-reference-name { font-weight: 600; margin: 0; }
  .resume-reference-role, .resume-reference-relationship, .resume-reference-contact {
    font-size: 12px; margin: 2px 0 0; color: #555;
  }

  /* Freeform */
  .resume-freeform { font-size: 13px; white-space: pre-wrap; margin: 0; }

  /* Dark theme — mirrors globals.css resume dark overrides */
  [data-resume-theme='dark'] .resume-paper {
    background: #111827;
    color: #f3f4f6;
  }
  [data-resume-theme='dark'] .resume-name {
    color: var(--rd-heading-color-dark, #e5e5e5);
  }
  [data-resume-theme='dark'] .resume-headline { color: #a0a0a0; }
  [data-resume-theme='dark'] .resume-contact-line { color: #999; }
  [data-resume-theme='dark'] .resume-contact-separator { color: #666; }
  [data-resume-theme='dark'] .resume-section-title {
    color: var(--rd-heading-color-dark, #e5e5e5);
  }
  [data-resume-theme='dark'] .resume-section-line {
    background: var(--rd-divider-bg-dark, currentColor);
    border-top: var(--rd-divider-border-dark, none);
    border-bottom: var(--rd-divider-border-bottom-dark, none);
    opacity: var(--rd-divider-opacity, 0.35);
  }
  [data-resume-theme='dark'] .resume-entry-subtitle { color: #a0a0a0; }
  [data-resume-theme='dark'] .resume-entry-date { color: #888; }
  [data-resume-theme='dark'] .resume-entry-tech { color: #888; }
  [data-resume-theme='dark'] .resume-entry-details { color: #888; }
  [data-resume-theme='dark'] .resume-entry-tags { color: #888; }
  [data-resume-theme='dark'] .resume-bullets li::marker {
    color: var(--rd-accent-color-dark, #888);
    opacity: 0.6;
  }
  [data-resume-theme='dark'] .resume-entry .rich-text-bullets li::marker {
    color: var(--rd-accent-color-dark, #888);
    opacity: 0.6;
  }
  [data-resume-theme='dark'] .resume-skill-group-items { color: inherit; }
  [data-resume-theme='dark'] .resume-entry-inline-issuer { color: #a0a0a0; }
  [data-resume-theme='dark'] .resume-entry-inline-date { color: #888; }
  [data-resume-theme='dark'] .resume-entry-inline-description { color: #888; }
  [data-resume-theme='dark'] .resume-publication-authors { color: #a0a0a0; }
  [data-resume-theme='dark'] .resume-publication-meta { color: #888; }

  /* Lumen template — mirrors globals.css .resume-paper--lumen rules */
  .resume-paper.resume-paper--lumen {
    padding: 52px 56px;
    letter-spacing: 0.005em;
  }
  .resume-paper--lumen .resume-header {
    margin-bottom: calc(var(--rd-header-margin-bottom, 24px) * 1.15);
    padding-bottom: 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--rd-accent-color, #b0aaa3) 55%, transparent);
  }
  .resume-paper--lumen .resume-name {
    letter-spacing: -0.025em;
    font-weight: var(--rd-name-font-weight, 600);
  }
  .resume-paper--lumen .resume-headline {
    margin-top: 6px;
    letter-spacing: 0.01em;
    color: #5c5c5c;
  }
  [data-resume-theme='dark'] .resume-paper--lumen .resume-headline { color: #a3a3a3; }
  .resume-paper--lumen .resume-contact-line {
    margin-top: 12px;
    letter-spacing: 0.015em;
    color: #737373;
  }
  [data-resume-theme='dark'] .resume-paper--lumen .resume-contact-line { color: #a3a3a3; }
  .resume-paper--lumen .resume-contact-separator {
    color: color-mix(in srgb, var(--rd-accent-color, #b0aaa3) 80%, #999);
  }
  .resume-paper--lumen .resume-section {
    margin-top: calc(var(--rd-section-gap, 20px) * 1.1);
  }
  .resume-paper--lumen .resume-section-header { margin-bottom: 10px; }
  .resume-paper--lumen .resume-section-title {
    letter-spacing: 0.2em;
    font-weight: var(--rd-heading-font-weight, 600);
  }
  .resume-paper--lumen .resume-section-line {
    opacity: var(--rd-divider-opacity, 0.28);
    height: 1px;
  }
  .resume-paper--lumen .resume-entry-title {
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .resume-paper--lumen .resume-entry-subtitle { color: #525252; }
  [data-resume-theme='dark'] .resume-paper--lumen .resume-entry-subtitle { color: #a3a3a3; }
  .resume-paper.resume-paper--lumen .resume-entry-date {
    color: #737373;
    letter-spacing: 0.02em;
  }
  [data-resume-theme='dark'] .resume-paper.resume-paper--lumen .resume-entry-date { color: #a3a3a3; }
  .resume-paper--lumen .resume-summary {
    line-height: 1.55;
    color: #404040;
  }
  [data-resume-theme='dark'] .resume-paper--lumen .resume-summary { color: #d4d4d4; }

  /* Sleek template — mirrors globals.css .resume-paper--sleek rules */
  .resume-paper.resume-paper--sleek { padding: 56px 60px; }
  .resume-sleek-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 40px; text-align: left;
    margin-bottom: calc(var(--rd-header-margin-bottom, 24px) * 0.75);
    padding: 8px 0;
  }
  .resume-sleek-identity { display: flex; align-items: center; gap: 16px; min-width: 0; }
  .resume-sleek-photo {
    width: var(--rd-photo-size, 64px); height: var(--rd-photo-size, 64px); border-radius: 50%;
    object-fit: cover; flex-shrink: 0;
  }
  .resume-paper--sleek .resume-name {
    text-transform: uppercase; letter-spacing: 0.14em;
    font-weight: 600; line-height: 1.2;
  }
  .resume-paper--sleek .resume-headline { margin-top: 6px; letter-spacing: 0.02em; }
  .resume-sleek-contact {
    list-style: none; margin: 0; padding: 4px 0 4px 24px;
    border-left: 1px dotted color-mix(in srgb, var(--rd-accent-color, #8f9aa8) 75%, transparent);
    display: flex; flex-direction: column; gap: 5px;
    max-width: 240px; flex-shrink: 0;
  }
  [data-resume-theme='dark'] .resume-sleek-contact {
    border-left-color: color-mix(in srgb, var(--rd-accent-color-dark, #b6bec9) 60%, transparent);
  }
  .resume-sleek-contact-item {
    font-family: var(--rd-font-contact, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    font-size: var(--rd-contact-font-size, 11px); line-height: 1.5; color: #555; word-break: break-word;
    font-weight: var(--rd-contact-font-weight, 400);
    font-style: var(--rd-contact-font-style, normal);
    text-decoration: var(--rd-contact-text-decoration, none);
  }
  [data-resume-theme='dark'] .resume-sleek-contact-item { color: #999; }
  .resume-paper--sleek .resume-section {
    display: grid; grid-template-columns: 168px 1fr;
    column-gap: 36px; row-gap: 14px;
    margin-top: var(--rd-section-gap, 20px);
    padding-top: var(--rd-section-gap, 20px);
    border-top: 1px solid color-mix(in srgb, var(--rd-accent-color, #8f9aa8) 40%, transparent);
  }
  [data-resume-theme='dark'] .resume-paper--sleek .resume-section {
    border-top-color: color-mix(in srgb, var(--rd-accent-color-dark, #b6bec9) 35%, transparent);
  }
  .resume-paper--sleek .resume-section-header { grid-column: 1; margin-bottom: 0; }
  .resume-paper--sleek .resume-section-title { font-size: var(--rd-heading-font-size, 11.5px); letter-spacing: 0.24em; }
  .resume-paper--sleek .resume-section-line { display: none; }
  .resume-paper--sleek .resume-section > :not(.resume-section-header) { grid-column: 2; }
  .resume-paper--sleek .resume-section > .resume-entries { grid-column: 1 / -1; }
  .resume-paper--sleek .resume-section > .resume-entries-compact { grid-column: 2; }
  .resume-paper--sleek .resume-entry {
    display: grid; grid-template-columns: 168px 1fr; column-gap: 36px;
  }
  .resume-paper--sleek .resume-entries-compact .resume-entry { display: block; }
  .resume-paper--sleek .resume-entry-header { grid-column: 1; display: block; }
  .resume-paper--sleek .resume-entry > :not(.resume-entry-header) { grid-column: 2; }
  .resume-paper--sleek .resume-entry-title {
    font-size: 13px; text-transform: uppercase;
    letter-spacing: 0.05em; line-height: 1.35;
  }
  .resume-paper--sleek .resume-entry-subtitle {
    font-size: 11.5px; text-transform: uppercase;
    letter-spacing: 0.05em; margin-top: 3px;
  }
  .resume-paper.resume-paper--sleek .resume-entry-date {
    display: block; margin-top: 8px; white-space: normal; text-align: left;
  }
  .resume-paper--sleek .resume-entry > :nth-child(2) { margin-top: 0; }
  .resume-paper--sleek .resume-entry > :nth-child(2) > .rich-text-bullets:first-child { margin-top: 0; }

  /* Studio template — mirrors globals.css .resume-paper--studio rules */
  .resume-paper.resume-paper--studio { padding: 0; overflow: hidden; }
  .resume-studio-header {
    display: flex; align-items: stretch; justify-content: space-between;
    gap: 28px; text-align: left; margin: 0; padding: 36px 0 28px;
  }
  .resume-studio-identity {
    display: flex; align-items: center; gap: 16px; min-width: 0; flex: 1;
    background: transparent; padding: 8px 12px 8px 36px; position: relative;
  }
  .resume-studio-identity::before {
    content: ''; position: absolute; left: 0; top: 4px; bottom: 4px;
    width: 14px; background: var(--rd-accent-color, #7a9aa5);
  }
  .resume-studio-photo {
    width: var(--rd-photo-size, 64px); height: var(--rd-photo-size, 64px); border-radius: 4px;
    object-fit: cover; flex-shrink: 0;
  }
  .resume-studio-identity-text { min-width: 0; }
  .resume-paper--studio .resume-name {
    text-transform: uppercase; letter-spacing: 0.04em;
    font-weight: 700; line-height: 1.15;
    font-size: calc(var(--rd-name-font-size, 28px) * 1.05);
  }
  .resume-paper--studio .resume-headline {
    margin-top: 8px; text-transform: uppercase; letter-spacing: 0.12em;
    font-style: var(--rd-title-font-style, normal);
    font-weight: var(--rd-title-font-weight, 500);
    text-decoration: var(--rd-title-text-decoration, none);
    font-family: var(--rd-font-title, inherit);
    font-size: var(--rd-title-font-size, 12px); color: #6b7280;
  }
  [data-resume-theme='dark'] .resume-paper--studio .resume-headline { color: #9ca3af; }
  .resume-studio-contact {
    list-style: none; margin: 0; padding: 18px 28px 18px 22px;
    display: flex; flex-direction: column; justify-content: center; gap: 8px;
    width: 260px; max-width: 42%; flex-shrink: 0;
    background: color-mix(in srgb, var(--rd-accent-color, #7a9aa5) 28%, #f4f7f8);
  }
  [data-resume-theme='dark'] .resume-studio-contact {
    background: color-mix(in srgb, var(--rd-accent-color-dark, #9bb5bd) 22%, #1f2937);
  }
  .resume-studio-contact-item {
    font-family: var(--rd-font-contact, inherit);
    font-size: var(--rd-contact-font-size, 12px); line-height: 1.45; color: #374151; word-break: break-word;
    font-weight: var(--rd-contact-font-weight, 400);
    font-style: var(--rd-contact-font-style, normal);
    text-decoration: var(--rd-contact-text-decoration, none);
  }
  [data-resume-theme='dark'] .resume-studio-contact-item { color: #d1d5db; }
  .resume-studio-body { padding: 8px 40px 40px 36px; }
  .resume-studio-body .resume-section:first-child { margin-top: 0; }
  .resume-paper--studio .resume-section-header {
    display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
  }
  .resume-paper--studio .resume-section-title {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: var(--rd-heading-font-size, 13px);
    font-weight: var(--rd-heading-font-weight, 700);
    font-style: var(--rd-heading-font-style, normal);
    text-decoration: var(--rd-heading-text-decoration, none);
    letter-spacing: 0.06em; flex-shrink: 0; margin: 0;
  }
  .resume-paper--studio .resume-section-title::before {
    content: ''; display: inline-block; width: 12px; height: 10px; flex-shrink: 0;
    background:
      linear-gradient(currentColor, currentColor) 0 0 / 100% 1.5px no-repeat,
      linear-gradient(currentColor, currentColor) 0 50% / 100% 1.5px no-repeat,
      linear-gradient(currentColor, currentColor) 0 100% / 100% 1.5px no-repeat;
  }
  .resume-paper--studio .resume-section-line {
    flex: 1; height: 1px; background: #c4c4c4; opacity: 1; margin: 0;
  }
  .resume-skills-stack {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column; gap: 10px;
  }
  .resume-skills-stack-item { font-size: 12.5px; line-height: 1.4; color: #374151; }
  [data-resume-theme='dark'] .resume-skills-stack-item { color: #d1d5db; }
  .resume-paper--studio .resume-summary {
    font-size: 12.5px; line-height: 1.55; color: #4b5563;
  }
  .resume-paper--studio .resume-entry-title {
    text-transform: uppercase; letter-spacing: 0.03em; font-weight: 700;
  }
  .resume-paper--studio .resume-entry-subtitle { font-style: italic; margin-top: 2px; }
  .resume-paper.resume-paper--studio .resume-entry-date {
    border: 1px solid #9ca3af; border-radius: 999px; padding: 3px 10px;
    font-size: 10.5px; letter-spacing: 0.02em; white-space: nowrap;
    flex-shrink: 0; margin-top: 2px;
  }
  [data-resume-theme='dark'] .resume-paper--studio .resume-entry-date { border-color: #6b7280; }

  /* Atelier template — mirrors globals.css .resume-paper--atelier rules */
  .resume-paper.resume-paper--atelier {
    display: flex; flex-direction: column; padding: 40px 48px 28px; position: relative;
  }
  .resume-atelier-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 28px; text-align: left; margin: 0 0 28px; padding: 0 0 20px;
    border-bottom: 1px solid color-mix(in srgb, var(--rd-accent-color, #c25b42) 35%, transparent);
  }
  .resume-atelier-identity { min-width: 0; flex: 1; }
  .resume-paper--atelier .resume-name {
    font-family: var(--rd-font-name, 'Great Vibes', 'Segoe Script', cursive);
    font-weight: var(--rd-name-font-weight, 400);
    font-style: var(--rd-name-font-style, normal);
    text-decoration: var(--rd-name-text-decoration, none);
    font-size: calc(var(--rd-name-font-size, 42px) * 1.05); line-height: 1.15;
    letter-spacing: 0.01em; color: #2a2a2a; text-transform: none;
  }
  .resume-paper--atelier .resume-headline {
    margin-top: 4px; font-family: var(--rd-font-title, 'Lato', 'Helvetica Neue', Helvetica, Arial, sans-serif);
    font-size: var(--rd-title-font-size, 11px);
    font-weight: var(--rd-title-font-weight, 400);
    font-style: var(--rd-title-font-style, normal);
    text-decoration: var(--rd-title-text-decoration, none);
    letter-spacing: 0.28em;
    text-transform: uppercase; color: #4a4a4a;
  }
  .resume-atelier-contact {
    list-style: none; margin: 0; padding: 4px 0 0; display: flex;
    flex-direction: column; gap: 7px; flex-shrink: 0; max-width: 42%;
  }
  .resume-atelier-contact-item {
    display: flex; align-items: center; gap: 8px;
    font-family: var(--rd-font-contact, 'Lato', 'Helvetica Neue', Helvetica, Arial, sans-serif);
    font-size: var(--rd-contact-font-size, 11.5px); line-height: 1.35; color: #3a3a3a; word-break: break-word;
    font-weight: var(--rd-contact-font-weight, 400);
    font-style: var(--rd-contact-font-style, normal);
    text-decoration: var(--rd-contact-text-decoration, none);
  }
  .resume-atelier-contact-icon {
    display: inline-flex; align-items: center; justify-content: center;
    color: var(--rd-accent-color, #c25b42); flex-shrink: 0;
  }
  .resume-atelier-layout {
    display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(180px, 0.9fr);
    gap: 0 36px; flex: 1;
  }
  .resume-atelier-main, .resume-atelier-rail { min-width: 0; }
  .resume-atelier-rail {
    border-left: 1px solid color-mix(in srgb, var(--rd-accent-color, #c25b42) 55%, #e8c4b8);
    padding-left: 28px; margin-left: -8px;
  }
  .resume-atelier-main .resume-section:first-child,
  .resume-atelier-rail .resume-section:first-child { margin-top: 0; }
  .resume-paper--atelier .resume-section-header { display: block; margin-bottom: 12px; }
  .resume-paper--atelier .resume-section-title {
    font-family: var(--rd-font-heading, 'Lato', 'Helvetica Neue', Helvetica, Arial, sans-serif);
    font-size: var(--rd-heading-font-size, 12px);
    font-weight: var(--rd-heading-font-weight, 700);
    font-style: var(--rd-heading-font-style, normal);
    text-decoration: var(--rd-heading-text-decoration, none);
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--rd-heading-color, var(--rd-accent-color, #c25b42)); margin: 0;
  }
  .resume-paper--atelier .resume-section-line { display: none; }
  .resume-paper--atelier .resume-summary { font-size: 12.5px; line-height: 1.6; color: #3a3a3a; }
  .resume-atelier-exp { margin-bottom: 18px; }
  .resume-atelier-exp-grid {
    display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 12px 16px; align-items: start;
  }
  .resume-paper.resume-paper--atelier .resume-atelier-exp .resume-entry-date {
    font-family: var(--rd-font-heading, 'Lato', 'Helvetica Neue', Helvetica, Arial, sans-serif);
    font-size: 12px; font-weight: 700; letter-spacing: 0.02em;
    color: var(--rd-accent-color, #c25b42); white-space: nowrap;
    padding: 0; border: none; margin: 0;
  }
  .resume-atelier-exp-body .resume-entry-title {
    font-family: var(--rd-font-heading, 'Lato', 'Helvetica Neue', Helvetica, Arial, sans-serif);
    font-size: 13px; font-weight: 700; text-transform: none; letter-spacing: 0;
    color: #1a1a1a; margin: 0;
  }
  .resume-atelier-exp-body .resume-entry-subtitle {
    font-family: var(--rd-font-heading, 'Lato', 'Helvetica Neue', Helvetica, Arial, sans-serif);
    font-size: 12px; font-weight: 600; font-style: normal; margin-top: 2px; color: #2a2a2a;
  }
  .resume-atelier-exp-body .resume-bullets,
  .resume-atelier-exp-body .rich-text-bullets { margin-top: 8px; }
  .resume-atelier-edu .resume-entry-title {
    font-family: var(--rd-font-heading, 'Lato', 'Helvetica Neue', Helvetica, Arial, sans-serif);
    font-size: 12.5px; font-weight: 700; margin: 0;
  }
  .resume-atelier-edu .resume-entry-subtitle { font-style: normal; font-size: 12px; margin-top: 2px; }
  .resume-atelier-edu-meta {
    font-family: var(--rd-font-heading, 'Lato', 'Helvetica Neue', Helvetica, Arial, sans-serif);
    font-size: 11px; color: #6b6b6b; margin-top: 3px;
  }
`;

/**
 * Generate a self-contained HTML document for PDF export.
 *
 * The output uses the **exact same** class names, structure, and CSS
 * as `CleanResumeView` so the PDF is pixel-identical to the
 * on-screen resume preview.
 */
export function toPDFHtml(profile: FullProfile): string {
  try {
    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

    // ── Resume design → CSS custom properties ──────────────
    const parsedDesign = parseResumeDesign(profile.resumeDesign);
    const designStyleAttr = buildResumeDesignStyleAttr(parsedDesign);
    const resolvedColorTheme = resolveResumeColorTheme(parsedDesign?.colorTheme);

    // ── Google Font <link> tags for body / name / heading ──
    const fonts = resolveResumeFonts(parsedDesign);
    const fontUrls = new Set(
      [fonts.body, fonts.name, fonts.heading]
        .map((face) => GOOGLE_FONT_URLS[face])
        .filter((url): url is string => Boolean(url))
    );
    const fontLink = [...fontUrls]
      .map((url) => `<link rel="stylesheet" href="${url}" crossorigin="anonymous" />`)
      .join('\n  ');

    // ── Contact items (mirrors CleanResumeView logic) ──────
    const contactItems: string[] = (() => {
      const itemMap = new Map<string, string>();

      if (profile.location) {
        itemMap.set('location', profile.location);
      }
      if (profile.contactInfo?.email && profile.contactInfo.emailPublic) {
        itemMap.set('email', profile.contactInfo.email);
      }
      if (profile.contactInfo?.phone && profile.contactInfo.phonePublic) {
        itemMap.set('phone', cleanPhoneDisplay(profile.contactInfo.phone));
      }

      // Links — display URL without protocol (same as CleanResumeView)
      const visibleLinks = profile.links.filter((l) => l.isVisible !== false);
      for (const link of visibleLinks) {
        itemMap.set(link.id, displayUrl(link.url));
      }

      const storedOrder = Array.isArray(profile.contactInfo?.headerFieldsOrder)
        ? (profile.contactInfo!.headerFieldsOrder as string[])
        : null;

      if (storedOrder && storedOrder.length > 0) {
        const ordered: string[] = [];
        const seen = new Set<string>();
        for (const id of storedOrder) {
          const val = itemMap.get(id);
          if (val && !seen.has(id)) {
            ordered.push(val);
            seen.add(id);
          }
        }
        for (const [id, val] of itemMap) {
          if (!seen.has(id)) ordered.push(val);
        }
        return ordered;
      }

      return Array.from(itemMap.values());
    })();

    // ── Header HTML ────────────────────────────────────────
    const showPhoto = Boolean(profile.resumeShowPhoto && profile.avatarUrl);
    const mergedDesign = mergeResumeDesign(parsedDesign);
    const headerComposition = resolveHeaderComposition(showPhoto, mergedDesign.headerPhotoLayout);
    const contactLineHtml =
      contactItems.length > 0
        ? `<p class="resume-contact-line">${contactItems
            .map((item, i) => {
              const sep = i > 0 ? '<span class="resume-contact-separator"> | </span>' : '';
              return `${sep}<span class="resume-contact-item">${escapeHtml(item)}</span>`;
            })
            .join('')}</p>`
        : '';

    const identityTextHtml = `
          <div class="resume-header-text min-w-0">
            <h1 class="resume-name">${escapeHtml(fullName)}</h1>
            ${profile.headline ? `<p class="resume-headline">${escapeHtml(profile.headline)}</p>` : ''}
            ${contactLineHtml}
          </div>`;
    const photoHtml = showPhoto
      ? `<img src="${safeUrl(profile.avatarUrl)}" alt="${escapeHtml(fullName)}" class="resume-header-photo" />`
      : '';

    let headerHtml: string;
    if (headerComposition === 'text') {
      headerHtml = `
      <header class="resume-header" data-header-composition="text">
        <h1 class="resume-name">${escapeHtml(fullName)}</h1>
        ${profile.headline ? `<p class="resume-headline">${escapeHtml(profile.headline)}</p>` : ''}
        ${contactLineHtml}
      </header>`;
    } else {
      const identityInner = isPhotoBeforeText(headerComposition)
        ? `${photoHtml}${identityTextHtml}`
        : `${identityTextHtml}${photoHtml}`;
      headerHtml = `
      <header class="resume-header" data-header-composition="${headerComposition}">
        <div class="resume-header-identity">
          ${identityInner}
        </div>
      </header>`;
    }

    // ── Body sections in user-configured sortOrder ─────────
    const bodySections = getOrderedSectionObjects(profile);
    const templateId = getResumeTemplateId(parsedDesign?.templateId);
    const isSleek = templateId === 'sleek';
    const isStudio = templateId === 'studio';
    const isAtelier = templateId === 'atelier';
    const isLumen = templateId === 'lumen';
    const sectionOpts = {
      stackedSkills: isAtelier,
      atelier: isAtelier,
    };

    let articleInnerHtml: string;
    if (isAtelier) {
      const railSections = bodySections.filter((s) => isResumeAtelierRailSectionType(s.type));
      const mainSections = bodySections.filter((s) => !isResumeAtelierRailSectionType(s.type));
      const railBodyHtml = railSections
        .map((section) => renderSectionHtml(section, profile, sectionOpts))
        .join('\n');
      const mainBodyHtml = mainSections
        .map((section) => renderSectionHtml(section, profile, sectionOpts))
        .join('\n');

      const atelierFields: {
        id: string;
        kind: 'phone' | 'email' | 'website' | 'link';
        value: string;
      }[] = [];
      if (profile.contactInfo?.phone && profile.contactInfo.phonePublic) {
        atelierFields.push({
          id: 'phone',
          kind: 'phone',
          value: cleanPhoneDisplay(profile.contactInfo.phone),
        });
      }
      if (profile.contactInfo?.email && profile.contactInfo.emailPublic) {
        atelierFields.push({
          id: 'email',
          kind: 'email',
          value: profile.contactInfo.email,
        });
      }
      if (profile.contactInfo?.website) {
        atelierFields.push({
          id: 'website',
          kind: 'website',
          value: displayUrl(profile.contactInfo.website),
        });
      }
      for (const link of profile.links.filter((l) => l.isVisible !== false)) {
        atelierFields.push({ id: link.id, kind: 'link', value: displayUrl(link.url) });
      }

      const contactListHtml =
        atelierFields.length > 0
          ? `<ul class="resume-atelier-contact">${atelierFields
              .map(
                (field) =>
                  `<li class="resume-atelier-contact-item"><span class="resume-atelier-contact-icon">${atelierContactIconSvg(field.kind)}</span><span>${escapeHtml(field.value)}</span></li>`
              )
              .join('')}</ul>`
          : '';

      articleInnerHtml = `
      <header class="resume-header resume-atelier-header">
        <div class="resume-atelier-identity">
          <h1 class="resume-name">${escapeHtml(fullName)}</h1>
          ${profile.headline ? `<p class="resume-headline">${escapeHtml(profile.headline)}</p>` : ''}
        </div>
        ${contactListHtml}
      </header>
      <div class="resume-atelier-layout">
        <div class="resume-atelier-main">${mainBodyHtml}</div>
        <aside class="resume-atelier-rail">${railBodyHtml}</aside>
      </div>`;
    } else if (isStudio) {
      const bodyHtml = bodySections
        .map((section) => renderSectionHtml(section, profile, sectionOpts))
        .join('\n');

      // Contact values only — no P: / E: / A: labels (matches CleanResumeView StudioHeader)
      const contactFieldMap = new Map<string, string>();
      if (profile.contactInfo?.email && profile.contactInfo.emailPublic) {
        contactFieldMap.set('email', profile.contactInfo.email);
      }
      if (profile.contactInfo?.phone && profile.contactInfo.phonePublic) {
        contactFieldMap.set('phone', cleanPhoneDisplay(profile.contactInfo.phone));
      }
      for (const link of profile.links.filter((l) => l.isVisible !== false)) {
        contactFieldMap.set(link.id, displayUrl(link.url));
      }

      const storedOrder = Array.isArray(profile.contactInfo?.headerFieldsOrder)
        ? (profile.contactInfo!.headerFieldsOrder as string[])
        : null;
      const orderedValues: string[] = [];
      const seenFields = new Set<string>();
      const preferredOrder = storedOrder?.length
        ? storedOrder.filter((id) => id !== 'location')
        : ['phone', 'email', ...Array.from(contactFieldMap.keys())];
      for (const id of preferredOrder) {
        if (id === 'location') continue;
        const value = contactFieldMap.get(id);
        if (value && !seenFields.has(id)) {
          orderedValues.push(value);
          seenFields.add(id);
        }
      }
      for (const [id, value] of contactFieldMap) {
        if (!seenFields.has(id)) orderedValues.push(value);
      }

      const studioPhotoHtml = showPhoto
        ? `<img src="${safeUrl(profile.avatarUrl)}" alt="${escapeHtml(fullName)}" class="resume-studio-photo" />`
        : '';
      const contactListHtml =
        orderedValues.length > 0
          ? `<ul class="resume-studio-contact">${orderedValues
              .map((value) => `<li class="resume-studio-contact-item">${escapeHtml(value)}</li>`)
              .join('')}</ul>`
          : '';
      const studioTextHtml = `
          <div class="resume-studio-identity-text resume-header-text">
            <h1 class="resume-name">${escapeHtml(fullName)}</h1>
            ${profile.headline ? `<p class="resume-headline">${escapeHtml(profile.headline)}</p>` : ''}
          </div>`;
      const studioIdentityInner =
        !showPhoto || headerComposition === 'text'
          ? studioTextHtml
          : isPhotoBeforeText(headerComposition)
            ? `${studioPhotoHtml}${studioTextHtml}`
            : `${studioTextHtml}${studioPhotoHtml}`;

      articleInnerHtml = `
      <header class="resume-header resume-studio-header" data-header-composition="${headerComposition}">
        <div class="resume-studio-identity resume-header-identity">
          ${studioIdentityInner}
        </div>
        ${contactListHtml}
      </header>
      <div class="resume-studio-body">${bodyHtml}</div>`;
    } else {
      const bodyHtml = bodySections
        .map((section) => renderSectionHtml(section, profile, sectionOpts))
        .join('\n');

      if (isSleek) {
        const sleekPhotoHtml = showPhoto
          ? `<img src="${safeUrl(profile.avatarUrl)}" alt="${escapeHtml(fullName)}" class="resume-sleek-photo" />`
          : '';
        const contactListHtml =
          contactItems.length > 0
            ? `<ul class="resume-sleek-contact">${contactItems
                .map((item) => `<li class="resume-sleek-contact-item">${escapeHtml(item)}</li>`)
                .join('')}</ul>`
            : '';
        const sleekTextHtml = `
          <div class="resume-header-text" style="min-width:0;">
            <h1 class="resume-name">${escapeHtml(fullName)}</h1>
            ${profile.headline ? `<p class="resume-headline">${escapeHtml(profile.headline)}</p>` : ''}
          </div>`;
        const sleekIdentityInner =
          !showPhoto || headerComposition === 'text'
            ? sleekTextHtml
            : isPhotoBeforeText(headerComposition)
              ? `${sleekPhotoHtml}${sleekTextHtml}`
              : `${sleekTextHtml}${sleekPhotoHtml}`;
        const sleekHeaderHtml = `
      <header class="resume-header resume-sleek-header" data-header-composition="${headerComposition}">
        <div class="resume-sleek-identity resume-header-identity">
          ${sleekIdentityInner}
        </div>
        ${contactListHtml}
      </header>`;
        articleInnerHtml = `${sleekHeaderHtml}\n    ${bodyHtml}`;
      } else {
        articleInnerHtml = `${headerHtml}\n    ${bodyHtml}`;
      }
    }

    const paperClass = [
      'resume-paper',
      isSleek && 'resume-paper--sleek',
      isStudio && 'resume-paper--studio',
      isAtelier && 'resume-paper--atelier',
      isLumen && 'resume-paper--lumen',
    ]
      .filter(Boolean)
      .join(' ');

    // ── Assemble full HTML document ────────────────────────
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(fullName)} - Resume</title>
  ${fontLink}
  <style>${RESUME_CSS}</style>
</head>
<body data-resume-theme="${resolvedColorTheme}">
  <article class="${paperClass}" data-resume-template="${templateId}" style="${designStyleAttr}">
    ${articleInnerHtml}
  </article>
</body>
</html>`;
  } catch (error) {
    serviceLogger.error('Failed to generate PDF HTML', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════
// PDF GENERATION (Puppeteer)
// ═══════════════════════════════════════════════════════════════════

/**
 * PDF options.
 * - `'continuous'` — single long page trimmed to content height
 * - `'a4'`         — ISO A4 pages with page breaks
 * - `'letter'`     — US Letter pages with page breaks
 */
interface PdfOptions {
  /** @default 'letter' */
  layout?: PdfLayout;
}

/**
 * Sparticuz ships Linux-only Chromium binaries for Lambda/Vercel.
 * Only use them on Linux in an actual serverless runtime — not when
 * VERCEL/AWS_* env vars are set locally on macOS/Windows for simulation.
 */
function isServerlessChromiumRuntime(): boolean {
  if (process.platform !== 'linux') return false;
  return Boolean(process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * Launch a headless Chromium browser suitable for the current runtime.
 *
 * In serverless production environments (e.g. Vercel) the system Chrome
 * binary is unavailable and the full `puppeteer` Chromium download exceeds
 * the function size limit. There we use `@sparticuz/chromium`, a Chromium
 * build packaged specifically for AWS Lambda / Vercel, driven by the
 * lightweight `puppeteer-core`.
 *
 * In local development we fall back to the full `puppeteer` package, which
 * bundles its own Chromium and requires no extra system setup.
 */
async function launchBrowser(): Promise<Browser> {
  const isServerless = isServerlessChromiumRuntime();

  if (isServerless) {
    const [{ default: chromium }, puppeteerCore, fs, path, { execSync }] = await Promise.all([
      import('@sparticuz/chromium-min'),
      import('puppeteer-core'),
      import('fs'),
      import('path'),
      import('child_process'),
    ]);

    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const destDir = '/tmp/chromium-pack';
    const tarName = `chromium-v147.0.0-pack.${arch}.tar`;
    const tarPath = path.join(process.cwd(), 'public', tarName);
    const packUrl = `https://github.com/Sparticuz/chromium/releases/download/v147.0.0/chromium-v147.0.0-pack.${arch}.tar`;

    let chromiumPath: string;

    try {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const markerFile = path.join(destDir, 'chromium.br');
      if (!fs.existsSync(markerFile)) {
        serviceLogger.info(`Extracting ${tarPath} to ${destDir}...`);
        if (!fs.existsSync(tarPath)) {
          throw new Error(`Chromium tarball not found at ${tarPath}`);
        }
        execSync(`tar -xf ${tarPath} -C ${destDir}`);
        serviceLogger.info('Chromium extraction completed successfully.');
      } else {
        serviceLogger.info('Chromium pack already extracted in /tmp');
      }

      chromiumPath = await chromium.executablePath(destDir);
    } catch (err: unknown) {
      serviceLogger.error('Failed to extract local Chromium pack', err);
      chromiumPath = await chromium.executablePath(packUrl);
    }

    return puppeteerCore.launch({
      args: [...chromium.args, '--disable-dev-shm-usage'],
      executablePath: chromiumPath,
      headless: (chromium as any).headless,
      defaultViewport: (chromium as any).defaultViewport,
    });
  }

  // Local / non-Linux: use the full puppeteer package (bundled Chromium).
  const { default: puppeteer } = await import('puppeteer');
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }) as unknown as Promise<Browser>;
}

/**
 * Generate a PDF resume that is visually identical to the on-screen
 * `CleanResumeView` preview.
 *
 * The HTML (from `toPDFHtml`) is rendered in headless Chrome via
 * Puppeteer and converted to PDF with the chosen layout mode:
 *
 *  - `'letter'` (default) — US Letter pages with page breaks
 *  - `'a4'`               — ISO A4 pages with page breaks
 *  - `'continuous'`       — single page trimmed to content height
 */
export async function generateResumePDF(
  profile: FullProfile,
  { layout: rawLayout = 'letter' }: PdfOptions = {}
): Promise<Buffer> {
  const layout = normalizePdfLayout(rawLayout);
  const pageSize = getResumePageSize(layout);
  const paperWidthOverride =
    layout === 'a4'
      ? `<style>.resume-paper{max-width:${pageSize.widthPx}px;width:${pageSize.widthPx}px;}</style>`
      : '';
  const html = toPDFHtml(profile).replace('</head>', `${paperWidthOverride}</head>`);

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();

    // Render the HTML and wait for all web fonts to finish loading so the
    // PDF metrics match the on-screen preview exactly.
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    let pdfBuffer: Uint8Array;

    if (layout === 'continuous') {
      // Measure the actual content height so we can create a single page
      const contentHeight = await page.evaluate(() => {
        const paper = document.querySelector('.resume-paper');
        return paper ? paper.scrollHeight : document.body.scrollHeight;
      });

      // Width = Letter (8.5″ at 96 dpi). Height = content + breathing room.
      pdfBuffer = await page.pdf({
        width: `${pageSize.widthPx}px`,
        height: `${contentHeight + 20}px`,
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      });
    } else {
      // A4 or Letter pages. Margins are applied by the PDF renderer;
      // the .resume-paper element's own padding handles the inner spacing.
      pdfBuffer = await page.pdf({
        format: pageSize.pdfFormat,
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      });
    }

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
