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
import { parseResumeDesign } from '@/lib/resume-design';
import { formatDate } from '@/lib/utils';
import type {
  CustomSectionContent,
  CustomSectionItem,
  FullProfile,
  InterestItem,
  JSONResume,
  LanguageItem,
  ProfileSection,
  PublicationItem,
  ResumeDensity,
  ResumeDesign,
  ResumeDividerStyle,
  ResumeFontFamily,
  VolunteeringItem,
} from '@/types';
import { HEADER_SECTION_TYPES, RESUME_DESIGN_DEFAULTS, RESUME_FONT_MAP } from '@/types';

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

        case 'SKILLS':
          if (visibleSkills.length > 0) {
            lines.push('SKILLS');
            lines.push('-'.repeat(50));
            const skillNames = visibleSkills.map((s) => s.name);
            lines.push(skillNames.join(', '));
            lines.push('');
          }
          break;

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
};

/** Density → scale factor (mirrors resume-design.ts). */
const DENSITY_SCALE: Record<ResumeDensity, number> = {
  compact: 0.75,
  normal: 1,
  relaxed: 1.35,
};

/** Build divider inline-CSS fragments from the divider style. */
function getDividerCssVars(
  style: ResumeDividerStyle,
  accentColor: string
): Record<string, string | number> {
  const transparent = 'transparent';
  switch (style) {
    case 'line':
      return {
        '--rd-divider-height': '1px',
        '--rd-divider-bg': accentColor,
        '--rd-divider-border': 'none',
        '--rd-divider-opacity': '0.2',
        '--rd-divider-border-bottom': 'none',
      };
    case 'double':
      return {
        '--rd-divider-height': '4px',
        '--rd-divider-bg': transparent,
        '--rd-divider-border': `1px solid ${accentColor}`,
        '--rd-divider-opacity': '0.25',
        '--rd-divider-border-bottom': `1px solid ${accentColor}`,
      };
    case 'thick':
      return {
        '--rd-divider-height': '2.5px',
        '--rd-divider-bg': accentColor,
        '--rd-divider-border': 'none',
        '--rd-divider-opacity': '0.25',
        '--rd-divider-border-bottom': 'none',
      };
    case 'dashed':
      return {
        '--rd-divider-height': '0',
        '--rd-divider-bg': transparent,
        '--rd-divider-border': `1.5px dashed ${accentColor}`,
        '--rd-divider-opacity': '0.3',
        '--rd-divider-border-bottom': 'none',
      };
    case 'dotted':
      return {
        '--rd-divider-height': '0',
        '--rd-divider-bg': transparent,
        '--rd-divider-border': `1.5px dotted ${accentColor}`,
        '--rd-divider-opacity': '0.3',
        '--rd-divider-border-bottom': 'none',
      };
    case 'none':
      return {
        '--rd-divider-height': '0',
        '--rd-divider-bg': transparent,
        '--rd-divider-border': 'none',
        '--rd-divider-opacity': '0',
        '--rd-divider-border-bottom': 'none',
      };
    default:
      return {
        '--rd-divider-height': '1px',
        '--rd-divider-bg': accentColor,
        '--rd-divider-border': 'none',
        '--rd-divider-opacity': '0.2',
        '--rd-divider-border-bottom': 'none',
      };
  }
}

/**
 * Build a CSS `style` attribute value with all `--rd-*` custom properties
 * for the `.resume-paper` element. Mirrors `buildResumeDesignStyles`.
 */
function buildDesignStyleAttr(raw: unknown): string {
  const d: Required<ResumeDesign> = {
    ...RESUME_DESIGN_DEFAULTS,
    ...(parseResumeDesign(raw) ?? {}),
  };
  const s = DENSITY_SCALE[d.density];
  const divider = getDividerCssVars(d.dividerStyle, d.accentColor);

  const props: Record<string, string | number> = {
    '--rd-heading-color': d.headingColor,
    '--rd-accent-color': d.accentColor,
    '--rd-font-family': RESUME_FONT_MAP[d.fontFamily],
    '--rd-font-size': `${d.fontSize}px`,
    '--rd-name-font-size': `${d.nameFontSize}px`,
    '--rd-header-alignment': d.headerAlignment,
    '--rd-section-gap': `${Math.round(20 * s)}px`,
    '--rd-entry-gap': `${Math.round(16 * s)}px`,
    '--rd-bullet-margin': `${Math.round(8 * s)}px`,
    '--rd-header-margin-bottom': `${Math.round(24 * s)}px`,
    ...divider,
  };

  return Object.entries(props)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

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

function summarySectionHtml(profile: FullProfile): string {
  if (!profile.summary || isHtmlEmpty(profile.summary)) return '';
  // Summary may contain rich HTML from the editor — sanitize before embedding.
  const content = containsHtmlFormatting(profile.summary)
    ? sanitizeRichHtml(profile.summary)
    : escapeHtml(profile.summary);
  return `
  <section class="resume-section">
    ${sectionDividerHtml('SUMMARY')}
    <div class="resume-summary resume-rich-html">${content}</div>
  </section>`;
}

function experienceSectionHtml(profile: FullProfile): string {
  const items = profile.workExperiences.filter((e) => e.isVisible !== false);
  if (items.length === 0) return '';

  const entries = items
    .map((exp) => {
      const dateRange = formatDateRange(exp.startDate, exp.endDate, exp.isCurrent);
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

      return `
      <div class="resume-entry">
        <div class="resume-entry-header">
          <div class="resume-entry-title-block">
            <h3 class="resume-entry-title">${escapeHtml(exp.role)}</h3>
            <p class="resume-entry-subtitle">${escapeHtml(companyLine)}</p>
          </div>
          <span class="resume-entry-date">${dateRange}</span>
        </div>
        ${bulletsHtml}
      </div>`;
    })
    .join('');

  return `
  <section class="resume-section">
    ${sectionDividerHtml('EXPERIENCE')}
    <div class="resume-entries">${entries}</div>
  </section>`;
}

function educationSectionHtml(profile: FullProfile): string {
  const items = profile.educations.filter((e) => e.isVisible !== false);
  if (items.length === 0) return '';

  const entries = items
    .map((edu) => {
      const degreeLine = [edu.degree, edu.fieldOfStudy].filter(Boolean).join(' in ');
      const dateRange = formatDateRange(edu.startDate, edu.endDate, edu.isCurrent);

      let detailsHtml = '';
      if (edu.gpa || edu.activities) {
        const parts: string[] = [];
        if (edu.gpa) parts.push(`<p>GPA: ${escapeHtml(edu.gpa)}</p>`);
        if (edu.activities) parts.push(`<p>${escapeHtml(String(edu.activities))}</p>`);
        detailsHtml = `<div class="resume-entry-details">${parts.join('')}</div>`;
      }

      return `
      <div class="resume-entry">
        <div class="resume-entry-header">
          <div class="resume-entry-title-block">
            <h3 class="resume-entry-title">${escapeHtml(degreeLine || edu.institution)}</h3>
            ${degreeLine ? `<p class="resume-entry-subtitle">${escapeHtml(edu.institution)}</p>` : ''}
          </div>
          <span class="resume-entry-date">${dateRange}</span>
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

function skillsSectionHtml(profile: FullProfile): string {
  const visibleSkillGroups = profile.skillGroups
    .map((g) => ({ ...g, skills: g.skills.filter((s) => s.isVisible !== false) }))
    .filter((g) => g.skills.length > 0);
  const visibleSkills = profile.skills.filter((s) => s.isVisible !== false);

  if (visibleSkillGroups.length > 0) {
    const groups = visibleSkillGroups
      .map(
        (g) =>
          `<div class="resume-skill-group"><span class="resume-skill-group-name">${escapeHtml(g.name)}:</span> <span class="resume-skill-group-items">${g.skills.map((s) => escapeHtml(s.name)).join(', ')}</span></div>`
      )
      .join('');
    return `
  <section class="resume-section">
    ${sectionDividerHtml('SKILLS')}
    <div class="resume-skills-grouped">${groups}</div>
  </section>`;
  }

  if (visibleSkills.length === 0) return '';
  return `
  <section class="resume-section">
    ${sectionDividerHtml('SKILLS')}
    <p class="resume-skills-flat">${visibleSkills.map((s) => escapeHtml(s.name)).join(', ')}</p>
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

function awardsSectionHtml(profile: FullProfile): string {
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
    ${sectionDividerHtml('AWARDS & RECOGNITION')}
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
function renderSectionHtml(section: ProfileSection, profile: FullProfile): string {
  switch (section.type) {
    case 'SUMMARY':
      return summarySectionHtml(profile);
    case 'EXPERIENCE':
      return experienceSectionHtml(profile);
    case 'EDUCATION':
      return educationSectionHtml(profile);
    case 'SKILLS':
      return skillsSectionHtml(profile);
    case 'PROJECTS':
      return projectsSectionHtml(profile);
    case 'CERTIFICATIONS':
      return certificationsSectionHtml(profile);
    case 'AWARDS':
      return awardsSectionHtml(profile);
    case 'PUBLICATIONS':
      return publicationsSectionHtml(getCustomContentItems<PublicationItem>(section));
    case 'VOLUNTEERING':
      return volunteeringSectionHtml(getCustomContentItems<VolunteeringItem>(section));
    case 'LANGUAGES':
      return languagesSectionHtml(getCustomContentItems<LanguageItem>(section));
    case 'INTERESTS':
      return interestsSectionHtml(getCustomContentItems<InterestItem>(section));
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
    line-height: 1.5;
    margin: 0 auto;
  }

  /* Header */
  .resume-header {
    text-align: var(--rd-header-alignment, center);
    margin-bottom: var(--rd-header-margin-bottom, 24px);
  }
  .resume-name {
    font-size: var(--rd-name-font-size, 28px);
    font-weight: 700;
    letter-spacing: 0.02em;
    margin: 0;
    color: var(--rd-heading-color, inherit);
  }
  .resume-headline {
    font-size: 15px;
    color: #555;
    margin-top: 4px;
    font-style: italic;
  }
  .resume-contact-line {
    font-size: 12px;
    color: #666;
    margin-top: 10px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  .resume-contact-separator { color: #999; }
  .resume-header-photo {
    width: 80px;
    height: 80px;
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
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--rd-heading-color, inherit);
    margin: 0 0 6px 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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

  /* Skills */
  .resume-skills-grouped { display: flex; flex-direction: column; gap: 4px; }
  .resume-skill-group { font-size: 13px; }
  .resume-skill-group-name { font-weight: 600; }
  .resume-skill-group-items { color: #555; }
  .resume-skills-flat { font-size: 13px; margin: 0; }

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

  /* Freeform */
  .resume-freeform { font-size: 13px; white-space: pre-wrap; margin: 0; }
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
    const designStyleAttr = buildDesignStyleAttr(profile.resumeDesign);

    // ── Google Font <link> tag (empty for system fonts) ────
    const design: Required<ResumeDesign> = {
      ...RESUME_DESIGN_DEFAULTS,
      ...(parseResumeDesign(profile.resumeDesign) ?? {}),
    };
    const fontUrl = GOOGLE_FONT_URLS[design.fontFamily];
    const fontLink = fontUrl
      ? `<link rel="stylesheet" href="${fontUrl}" crossorigin="anonymous" />`
      : '';

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
    const showPhoto = profile.resumeShowPhoto && profile.avatarUrl;
    const contactLineHtml =
      contactItems.length > 0
        ? `<p class="resume-contact-line">${contactItems
            .map((item, i) => {
              const sep = i > 0 ? '<span class="resume-contact-separator"> | </span>' : '';
              return `${sep}<span class="resume-contact-item">${escapeHtml(item)}</span>`;
            })
            .join('')}</p>`
        : '';

    let headerHtml: string;
    if (showPhoto) {
      headerHtml = `
      <header class="resume-header" style="display:flex;align-items:flex-start;gap:16px;">
        <img src="${safeUrl(profile.avatarUrl)}" alt="${escapeHtml(fullName)}" class="resume-header-photo" />
        <div style="min-width:0;flex:1;">
          <h1 class="resume-name">${escapeHtml(fullName)}</h1>
          ${profile.headline ? `<p class="resume-headline">${escapeHtml(profile.headline)}</p>` : ''}
          ${contactLineHtml}
        </div>
      </header>`;
    } else {
      headerHtml = `
      <header class="resume-header">
        <h1 class="resume-name">${escapeHtml(fullName)}</h1>
        ${profile.headline ? `<p class="resume-headline">${escapeHtml(profile.headline)}</p>` : ''}
        ${contactLineHtml}
      </header>`;
    }

    // ── Body sections in user-configured sortOrder ─────────
    const bodySections = getOrderedSectionObjects(profile);
    const bodyHtml = bodySections.map((section) => renderSectionHtml(section, profile)).join('\n');

    // ── Assemble full HTML document ────────────────────────
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(fullName)} - Resume</title>
  ${fontLink}
  <style>${RESUME_CSS}</style>
</head>
<body>
  <article class="resume-paper" style="${designStyleAttr}">
    ${headerHtml}
    ${bodyHtml}
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
 * PDF layout mode.
 * - `'paged'`      – Standard Letter pages with automatic page breaks.
 * - `'continuous'`  – Single long page trimmed to content height.
 */
export type PdfLayout = 'paged' | 'continuous';

interface PdfOptions {
  /** @default 'paged' */
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
 *  - `'paged'` (default) — standard Letter-size pages with page breaks.
 *  - `'continuous'`       — single page trimmed to the actual content height.
 */
export async function generateResumePDF(
  profile: FullProfile,
  { layout = 'paged' }: PdfOptions = {}
): Promise<Buffer> {
  const html = toPDFHtml(profile);

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

      // Width = 816px (8.5″ at 96 dpi). Height = content + breathing room.
      pdfBuffer = await page.pdf({
        width: '816px',
        height: `${contentHeight + 20}px`,
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      });
    } else {
      // Standard Letter pages. Margins are applied by the PDF renderer;
      // the .resume-paper element's own padding handles the inner spacing.
      pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      });
    }

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
