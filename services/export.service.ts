/**
 * Export Service
 * Converts canonical profile data to various export formats
 */

import { cleanPhoneDisplay } from '@/components/ui/phone-input';
import { containsHtmlFormatting, isHtmlEmpty, stripHtmlTags } from '@/lib/html-utils';
import { logger } from '@/lib/logger';
import { formatDate } from '@/lib/utils';
import type { FullProfile, JSONResume } from '@/types';
import { HEADER_SECTION_TYPES } from '@/types';

// pdfkit uses CJS exports – require works reliably with serverExternalPackages
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

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

/**
 * Generate HTML for PDF export.
 * All user-provided data is escaped to prevent XSS.
 */
export function toPDFHtml(profile: FullProfile): string {
  try {
    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

    // Filter hidden items
    const visibleExperiences = profile.workExperiences.filter((e) => e.isVisible !== false);
    const visibleEducations = profile.educations.filter((e) => e.isVisible !== false);
    const visibleSkills = profile.skills.filter((s) => s.isVisible !== false);
    const visibleProjects = profile.projects.filter(
      (p) => p.isVisible !== false && p.showOnResume !== false
    );

    // Build body sections HTML in user-configured order
    const sectionOrder = getOrderedBodySections(profile);
    const sectionHtmlParts: string[] = [];

    for (const sectionType of sectionOrder) {
      switch (sectionType) {
        case 'SUMMARY':
          if (profile.summary && !isHtmlEmpty(profile.summary)) {
            sectionHtmlParts.push(`
  <div class="section">
    <h2>Summary</h2>
    <p>${escapeHtml(profile.summary)}</p>
  </div>`);
          }
          break;

        case 'EXPERIENCE':
          if (visibleExperiences.length > 0) {
            sectionHtmlParts.push(`
  <div class="section">
    <h2>Experience</h2>
    ${visibleExperiences
      .map(
        (exp) => `
    <div class="entry">
      <div class="entry-header">
        <div>
          <h3 class="entry-title">${escapeHtml(exp.role)}</h3>
          <div class="entry-subtitle">${escapeHtml(exp.company)}${exp.location ? ` | ${escapeHtml(exp.location)}` : ''}</div>
        </div>
        <div class="entry-date">${formatDate(exp.startDate)} - ${exp.isCurrent ? 'Present' : formatDate(exp.endDate)}</div>
      </div>
      ${
        exp.bullets.length > 0
          ? `
      <ul>
        ${exp.bullets.map((b) => (containsHtmlFormatting(b) ? `<li>${b}</li>` : `<li>${escapeHtml(b)}</li>`)).join('')}
      </ul>`
          : ''
      }
    </div>`
      )
      .join('')}
  </div>`);
          }
          break;

        case 'EDUCATION':
          if (visibleEducations.length > 0) {
            sectionHtmlParts.push(`
  <div class="section">
    <h2>Education</h2>
    ${visibleEducations
      .map(
        (edu) => `
    <div class="entry">
      <div class="entry-header">
        <div>
          <h3 class="entry-title">${escapeHtml(edu.degree)} ${escapeHtml(edu.fieldOfStudy)}</h3>
          <div class="entry-subtitle">${escapeHtml(edu.institution)}</div>
        </div>
        <div class="entry-date">${formatDate(edu.startDate)} - ${edu.isCurrent ? 'Present' : formatDate(edu.endDate)}</div>
      </div>
    </div>`
      )
      .join('')}
  </div>`);
          }
          break;

        case 'SKILLS':
          if (visibleSkills.length > 0) {
            sectionHtmlParts.push(`
  <div class="section">
    <h2>Skills</h2>
    <div class="skills">
      ${visibleSkills.map((s) => `<span class="skill">${escapeHtml(s.name)}</span>`).join('')}
    </div>
  </div>`);
          }
          break;

        case 'PROJECTS':
          if (visibleProjects.length > 0) {
            sectionHtmlParts.push(`
  <div class="section">
    <h2>Projects</h2>
    ${visibleProjects
      .map(
        (p) => `
    <div class="entry">
      <h3 class="entry-title">${escapeHtml(p.title)}</h3>
      ${p.description ? `<div class="entry-description">${escapeHtml(p.description)}</div>` : ''}
      ${p.techStack.length > 0 ? `<div class="entry-subtitle">Tech: ${p.techStack.map((t) => escapeHtml(t)).join(', ')}</div>` : ''}
    </div>`
      )
      .join('')}
  </div>`);
          }
          break;

        default:
          break;
      }
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${fullName} - Resume</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      line-height: 1.5; 
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }
    h1 { font-size: 28px; margin-bottom: 4px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 12px; border-bottom: 2px solid #333; padding-bottom: 4px; }
    h3 { font-size: 16px; margin-bottom: 2px; }
    .header { margin-bottom: 24px; }
    .header-with-photo { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
    .header-photo { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .header-info { min-width: 0; flex: 1; }
    .headline { color: #666; font-size: 16px; margin-bottom: 4px; }
    .contact { font-size: 14px; color: #666; }
    .contact a { color: #0066cc; text-decoration: none; }
    .section { margin-bottom: 20px; }
    .entry { margin-bottom: 16px; }
    .entry-header { display: flex; justify-content: space-between; align-items: baseline; }
    .entry-title { font-weight: 600; }
    .entry-subtitle { color: #666; font-size: 14px; }
    .entry-date { color: #666; font-size: 14px; }
    .entry-description { margin-top: 4px; font-size: 14px; }
    ul { margin: 8px 0 0 20px; }
    li { font-size: 14px; margin-bottom: 4px; }
    .skills { display: flex; flex-wrap: wrap; gap: 8px; }
    .skill { background: #f0f0f0; padding: 4px 12px; border-radius: 4px; font-size: 14px; }
    @media print {
      body { padding: 20px; }
      .entry { break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${(() => {
    const pdfContactItems = getOrderedContactItems(profile);
    const contactHtml = pdfContactItems
      .map((c) =>
        c.href && c.href.startsWith('http')
          ? `<a href="${escapeHtml(c.href)}">${escapeHtml(c.value)}</a>`
          : escapeHtml(c.value)
      )
      .join(' | ');

    if (profile.resumeShowPhoto && profile.avatarUrl) {
      return `
  <div class="header-with-photo">
    <img src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(fullName)}" class="header-photo" />
    <div class="header-info">
      <h1>${escapeHtml(fullName)}</h1>
      ${profile.headline ? `<div class="headline">${escapeHtml(profile.headline)}</div>` : ''}
      ${contactHtml ? `<div class="contact">${contactHtml}</div>` : ''}
    </div>
  </div>`;
    }
    return `
  <div class="header">
    <h1>${escapeHtml(fullName)}</h1>
    ${profile.headline ? `<div class="headline">${escapeHtml(profile.headline)}</div>` : ''}
    ${contactHtml ? `<div class="contact">${contactHtml}</div>` : ''}
  </div>`;
  })()}

  ${sectionHtmlParts.join('\n')}
</body>
</html>
  `.trim();
  } catch (error) {
    serviceLogger.error('Failed to generate PDF HTML', error);
    throw error;
  }
}

/**
 * PDF layout mode.
 * - `'paged'`      – Standard A4 pages with automatic page breaks (print-friendly).
 * - `'continuous'`  – Single long page trimmed to content height (screen-friendly).
 */
export type PdfLayout = 'paged' | 'continuous';

interface PdfOptions {
  /** @default 'paged' */
  layout?: PdfLayout;
}

/**
 * Generate a clean PDF resume from profile data using PDFKit.
 *
 * Accepts an optional `layout` parameter:
 *  - `'paged'` (default) produces standard A4 pages with page breaks.
 *  - `'continuous'` renders all content on one tall page, then trims the
 *    MediaBox so the PDF height equals the content height.
 */
export function generateResumePDF(
  profile: FullProfile,
  { layout = 'paged' }: PdfOptions = {}
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;
    const MAX_HEIGHT = 15000; // ~5 m – more than enough for any resume
    const PAGE_MARGINS = { top: 50, bottom: 50, left: 50, right: 50 };

    const isContinuous = layout === 'continuous';

    const doc = new PDFDocument({
      size: isContinuous
        ? ([A4_WIDTH, MAX_HEIGHT] as [number, number])
        : ([A4_WIDTH, A4_HEIGHT] as [number, number]),
      margins: PAGE_MARGINS,
      bufferPages: true,
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

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
    const visibleCerts = profile.certifications.filter((c) => c.isVisible !== false);
    const visibleAwards = profile.awards.filter((a) => a.isVisible !== false);

    // Colors
    const primaryColor = '#1a1a1a';
    const secondaryColor = '#555555';
    const lineColor = '#cccccc';

    // ── Header ──────────────────────────────────────────────
    doc.fontSize(24).font('Helvetica-Bold').fillColor(primaryColor).text(fullName);

    if (profile.headline) {
      doc.fontSize(11).font('Helvetica').fillColor(secondaryColor).text(profile.headline);
    }

    // Contact line – respects user-configured header field order
    const pdfKitContactItems = getOrderedContactItems(profile);

    if (pdfKitContactItems.length > 0) {
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(secondaryColor)
        .text(pdfKitContactItems.map((c) => c.value).join('  |  '));
    }

    doc.moveDown(0.5);

    // ── Helper: Section header with underline ───────────────
    const sectionHeader = (title: string) => {
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(primaryColor)
        .text(title.toUpperCase(), { continued: false });
      const y = doc.y;
      doc
        .moveTo(doc.page.margins.left, y)
        .lineTo(doc.page.margins.left + pageWidth, y)
        .strokeColor(lineColor)
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.3);
    };

    // ── Section renderers (keyed by section type) ───────────
    const renderSummary = () => {
      if (profile.summary && !isHtmlEmpty(profile.summary)) {
        sectionHeader('Summary');
        doc.fontSize(10).font('Helvetica').fillColor(primaryColor).text(profile.summary);
      }
    };

    const renderExperience = () => {
      if (visibleExperiences.length > 0) {
        sectionHeader('Experience');
        visibleExperiences.forEach((exp, i) => {
          if (i > 0) doc.moveDown(0.5);
          const dateRange = exp.isCurrent
            ? `${formatDate(exp.startDate)} – Present`
            : `${formatDate(exp.startDate)} – ${formatDate(exp.endDate)}`;

          doc.fontSize(11).font('Helvetica-Bold').fillColor(primaryColor).text(exp.role);
          doc
            .fontSize(10)
            .font('Helvetica')
            .fillColor(secondaryColor)
            .text(`${exp.company}${exp.location ? ` | ${exp.location}` : ''}  •  ${dateRange}`);

          if (exp.bullets.length > 0) {
            doc.moveDown(0.2);
            exp.bullets.forEach((bullet) => {
              doc
                .fontSize(10)
                .font('Helvetica')
                .fillColor(primaryColor)
                .text(`•  ${stripHtmlTags(bullet)}`, { indent: 10 });
            });
          }
        });
      }
    };

    const renderEducation = () => {
      if (visibleEducations.length > 0) {
        sectionHeader('Education');
        visibleEducations.forEach((edu, i) => {
          if (i > 0) doc.moveDown(0.3);
          const degree = [edu.degree, edu.fieldOfStudy].filter(Boolean).join(' in ');
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor(primaryColor)
            .text(degree || edu.institution);

          if (degree) {
            doc.fontSize(10).font('Helvetica').fillColor(secondaryColor).text(edu.institution);
          }

          if (edu.startDate || edu.endDate) {
            const dateRange = edu.isCurrent
              ? `${formatDate(edu.startDate)} – Present`
              : `${formatDate(edu.startDate)} – ${formatDate(edu.endDate)}`;
            doc.fontSize(10).font('Helvetica').fillColor(secondaryColor).text(dateRange);
          }

          if (edu.gpa) {
            doc.fontSize(10).font('Helvetica').fillColor(primaryColor).text(`GPA: ${edu.gpa}`);
          }
        });
      }
    };

    const renderSkills = () => {
      if (visibleSkills.length > 0 || visibleSkillGroups.length > 0) {
        sectionHeader('Skills');
        if (visibleSkillGroups.length > 0) {
          visibleSkillGroups.forEach((group) => {
            doc
              .fontSize(10)
              .font('Helvetica-Bold')
              .fillColor(primaryColor)
              .text(`${group.name}: `, { continued: true });
            doc
              .font('Helvetica')
              .fillColor(secondaryColor)
              .text(group.skills.map((s) => s.name).join(', '));
          });
        } else {
          doc
            .fontSize(10)
            .font('Helvetica')
            .fillColor(primaryColor)
            .text(visibleSkills.map((s) => s.name).join(', '));
        }
      }
    };

    const renderProjects = () => {
      if (visibleProjects.length > 0) {
        sectionHeader('Projects');
        visibleProjects.forEach((project, i) => {
          if (i > 0) doc.moveDown(0.3);

          const projectDateParts: string[] = [];
          if (project.startDate) {
            projectDateParts.push(formatDate(project.startDate));
            if (project.isCurrent) {
              projectDateParts.push('Present');
            } else if (project.endDate) {
              projectDateParts.push(formatDate(project.endDate));
            }
          }

          doc.fontSize(11).font('Helvetica-Bold').fillColor(primaryColor).text(project.title);

          if (projectDateParts.length > 0) {
            doc
              .fontSize(10)
              .font('Helvetica')
              .fillColor(secondaryColor)
              .text(projectDateParts.join(' – '));
          }

          if (project.description) {
            doc.fontSize(10).font('Helvetica').fillColor(primaryColor).text(project.description);
          }

          if (project.techStack.length > 0) {
            doc
              .fontSize(10)
              .font('Helvetica-Oblique')
              .fillColor(secondaryColor)
              .text(`Technologies: ${project.techStack.join(', ')}`);
          }

          if (project.highlights.length > 0) {
            project.highlights.forEach((h) => {
              doc
                .fontSize(10)
                .font('Helvetica')
                .fillColor(primaryColor)
                .text(`•  ${h}`, { indent: 10 });
            });
          }
        });
      }
    };

    const renderCertifications = () => {
      if (visibleCerts.length > 0) {
        sectionHeader('Certifications');
        visibleCerts.forEach((cert, i) => {
          if (i > 0) doc.moveDown(0.3);
          doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor).text(cert.name);
          const details: string[] = [cert.issuer];
          if (cert.issueDate) details.push(formatDate(cert.issueDate));
          doc.fontSize(10).font('Helvetica').fillColor(secondaryColor).text(details.join(' | '));
        });
      }
    };

    const renderAwards = () => {
      if (visibleAwards.length > 0) {
        sectionHeader('Awards');
        visibleAwards.forEach((award, i) => {
          if (i > 0) doc.moveDown(0.3);
          doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor).text(award.title);
          const details: string[] = [];
          if (award.issuer) details.push(award.issuer);
          if (award.date) details.push(formatDate(award.date));
          if (details.length > 0) {
            doc.fontSize(10).font('Helvetica').fillColor(secondaryColor).text(details.join(' | '));
          }
          if (award.description) {
            doc.fontSize(10).font('Helvetica').fillColor(primaryColor).text(award.description);
          }
        });
      }
    };

    // ── Render body sections in user-configured sortOrder ────
    const sectionRenderers: Record<string, () => void> = {
      SUMMARY: renderSummary,
      EXPERIENCE: renderExperience,
      EDUCATION: renderEducation,
      SKILLS: renderSkills,
      PROJECTS: renderProjects,
      CERTIFICATIONS: renderCertifications,
      AWARDS: renderAwards,
    };

    const sectionOrder = getOrderedBodySections(profile);
    for (const sectionType of sectionOrder) {
      const renderer = sectionRenderers[sectionType];
      if (renderer) renderer();
    }

    // For continuous layout, trim the oversized page to actual content height
    // so the PDF has no trailing blank space. Paged layout uses standard A4
    // pages and needs no trimming.
    if (isContinuous) {
      const actualHeight = doc.y + PAGE_MARGINS.bottom;
      doc.page.dictionary.data.MediaBox = [0, MAX_HEIGHT - actualHeight, A4_WIDTH, MAX_HEIGHT];
    }

    doc.end();
  });
}
