/**
 * Export Service
 * Converts canonical profile data to various export formats
 */

import { formatDate } from '@/lib/utils';
import type { FullProfile, JSONResume } from '@/types';

// pdfkit uses CJS exports – require works reliably with serverExternalPackages
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

/**
 * Convert profile to JSON Resume format
 * @see https://jsonresume.org/schema/
 */
export function toJSONResume(profile: FullProfile): JSONResume {
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

  return {
    basics: {
      name: fullName,
      label: profile.headline || undefined,
      image: profile.avatarUrl || undefined,
      email: profile.contactInfo?.emailPublic ? profile.contactInfo.email || undefined : undefined,
      url: profile.contactInfo?.website || undefined,
      summary: profile.summary || undefined,
      location: profile.location
        ? {
            city: profile.location,
          }
        : undefined,
      profiles: profile.links.map((link) => ({
        network: link.type,
        url: link.url,
        username: link.label || undefined,
      })),
    },
    work: profile.workExperiences.map((exp) => ({
      name: exp.company,
      position: exp.role,
      url: exp.companyUrl || undefined,
      startDate: formatDate(exp.startDate, { year: 'numeric', month: '2-digit' }),
      endDate: exp.isCurrent
        ? undefined
        : formatDate(exp.endDate, { year: 'numeric', month: '2-digit' }) || undefined,
      summary: exp.bullets.length > 0 ? exp.bullets.join('. ') : undefined,
      highlights: exp.bullets,
    })),
    education: profile.educations.map((edu) => ({
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
      profile.skillGroups.length > 0
        ? profile.skillGroups.map((group) => ({
            name: group.name,
            level: undefined,
            keywords: group.skills.map((s) => s.name),
          }))
        : profile.skills.map((skill) => ({
            name: skill.name,
            level: skill.level || undefined,
            keywords: [],
          })),
    projects: profile.projects.map((project) => ({
      name: project.title,
      description: project.description || undefined,
      highlights: project.highlights,
      keywords: project.techStack,
      startDate: formatDate(project.startDate, { year: 'numeric', month: '2-digit' }) || undefined,
      endDate: project.isCurrent
        ? undefined
        : formatDate(project.endDate, { year: 'numeric', month: '2-digit' }) || undefined,
      url: project.url || project.repoUrl || undefined,
    })),
    awards: profile.awards.map((award) => ({
      title: award.title,
      date: formatDate(award.date, { year: 'numeric', month: '2-digit' }) || undefined,
      awarder: award.issuer || undefined,
      summary: award.description || undefined,
    })),
    certificates: profile.certifications.map((cert) => ({
      name: cert.name,
      date: formatDate(cert.issueDate, { year: 'numeric', month: '2-digit' }) || undefined,
      issuer: cert.issuer,
      url: cert.credentialUrl || undefined,
    })),
  };
}

/**
 * Convert profile to plain text format
 */
export function toPlainText(profile: FullProfile): string {
  const lines: string[] = [];
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

  // Header
  lines.push(fullName.toUpperCase());
  if (profile.headline) lines.push(profile.headline);
  if (profile.location) lines.push(profile.location);

  // Contact
  const contacts: string[] = [];
  if (profile.contactInfo?.email && profile.contactInfo.emailPublic) {
    contacts.push(profile.contactInfo.email);
  }
  if (profile.contactInfo?.website) {
    contacts.push(profile.contactInfo.website);
  }
  profile.links.forEach((link) => {
    contacts.push(link.url);
  });
  if (contacts.length > 0) {
    lines.push(contacts.join(' | '));
  }
  lines.push('');

  // Summary
  if (profile.summary) {
    lines.push('SUMMARY');
    lines.push('-'.repeat(50));
    lines.push(profile.summary);
    lines.push('');
  }

  // Work Experience
  if (profile.workExperiences.length > 0) {
    lines.push('EXPERIENCE');
    lines.push('-'.repeat(50));
    profile.workExperiences.forEach((exp) => {
      const dateRange = exp.isCurrent
        ? `${formatDate(exp.startDate)} - Present`
        : `${formatDate(exp.startDate)} - ${formatDate(exp.endDate)}`;
      lines.push(`${exp.role} | ${exp.company}`);
      lines.push(`${dateRange}${exp.location ? ` | ${exp.location}` : ''}`);
      exp.bullets.forEach((bullet) => {
        lines.push(`• ${bullet}`);
      });
      lines.push('');
    });
  }

  // Education
  if (profile.educations.length > 0) {
    lines.push('EDUCATION');
    lines.push('-'.repeat(50));
    profile.educations.forEach((edu) => {
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

  // Skills
  if (profile.skills.length > 0) {
    lines.push('SKILLS');
    lines.push('-'.repeat(50));
    const skillNames = profile.skills.map((s) => s.name);
    lines.push(skillNames.join(', '));
    lines.push('');
  }

  // Projects
  if (profile.projects.length > 0) {
    lines.push('PROJECTS');
    lines.push('-'.repeat(50));
    profile.projects.forEach((project) => {
      lines.push(project.title);
      if (project.description) lines.push(project.description);
      if (project.techStack.length > 0) {
        lines.push(`Technologies: ${project.techStack.join(', ')}`);
      }
      if (project.url) lines.push(`URL: ${project.url}`);
      lines.push('');
    });
  }

  // Certifications
  if (profile.certifications.length > 0) {
    lines.push('CERTIFICATIONS');
    lines.push('-'.repeat(50));
    profile.certifications.forEach((cert) => {
      lines.push(`${cert.name} - ${cert.issuer}`);
      if (cert.issueDate) lines.push(`Issued: ${formatDate(cert.issueDate)}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate HTML for PDF export
 * TODO: Implement Playwright-based PDF generation for production
 */
export function toPDFHtml(profile: FullProfile): string {
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

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
  <div class="header">
    <h1>${fullName}</h1>
    ${profile.headline ? `<div class="headline">${profile.headline}</div>` : ''}
    <div class="contact">
      ${profile.location ? `${profile.location}` : ''}
      ${profile.contactInfo?.email && profile.contactInfo.emailPublic ? ` | ${profile.contactInfo.email}` : ''}
      ${profile.contactInfo?.website ? ` | <a href="${profile.contactInfo.website}">${profile.contactInfo.website}</a>` : ''}
    </div>
  </div>

  ${
    profile.summary
      ? `
  <div class="section">
    <h2>Summary</h2>
    <p>${profile.summary}</p>
  </div>
  `
      : ''
  }

  ${
    profile.workExperiences.length > 0
      ? `
  <div class="section">
    <h2>Experience</h2>
    ${profile.workExperiences
      .map(
        (exp) => `
    <div class="entry">
      <div class="entry-header">
        <div>
          <h3 class="entry-title">${exp.role}</h3>
          <div class="entry-subtitle">${exp.company}${exp.location ? ` | ${exp.location}` : ''}</div>
        </div>
        <div class="entry-date">${formatDate(exp.startDate)} - ${exp.isCurrent ? 'Present' : formatDate(exp.endDate)}</div>
      </div>
      ${
        exp.bullets.length > 0
          ? `
      <ul>
        ${exp.bullets.map((b) => `<li>${b}</li>`).join('')}
      </ul>
      `
          : ''
      }
    </div>
    `
      )
      .join('')}
  </div>
  `
      : ''
  }

  ${
    profile.educations.length > 0
      ? `
  <div class="section">
    <h2>Education</h2>
    ${profile.educations
      .map(
        (edu) => `
    <div class="entry">
      <div class="entry-header">
        <div>
          <h3 class="entry-title">${edu.degree || ''} ${edu.fieldOfStudy || ''}</h3>
          <div class="entry-subtitle">${edu.institution}</div>
        </div>
        <div class="entry-date">${formatDate(edu.startDate)} - ${edu.isCurrent ? 'Present' : formatDate(edu.endDate)}</div>
      </div>
    </div>
    `
      )
      .join('')}
  </div>
  `
      : ''
  }

  ${
    profile.skills.length > 0
      ? `
  <div class="section">
    <h2>Skills</h2>
    <div class="skills">
      ${profile.skills.map((s) => `<span class="skill">${s.name}</span>`).join('')}
    </div>
  </div>
  `
      : ''
  }

  ${
    profile.projects.length > 0
      ? `
  <div class="section">
    <h2>Projects</h2>
    ${profile.projects
      .map(
        (p) => `
    <div class="entry">
      <h3 class="entry-title">${p.title}</h3>
      ${p.description ? `<div class="entry-description">${p.description}</div>` : ''}
      ${p.techStack.length > 0 ? `<div class="entry-subtitle">Tech: ${p.techStack.join(', ')}</div>` : ''}
    </div>
    `
      )
      .join('')}
  </div>
  `
      : ''
  }
</body>
</html>
  `.trim();
}

/**
 * Generate a clean PDF resume from profile data using PDFKit
 */
export function generateResumePDF(profile: FullProfile): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Colors
    const primaryColor = '#1a1a1a';
    const secondaryColor = '#555555';
    const lineColor = '#cccccc';

    // ── Header ──────────────────────────────────────────────
    doc.fontSize(24).font('Helvetica-Bold').fillColor(primaryColor).text(fullName);

    if (profile.headline) {
      doc.fontSize(11).font('Helvetica').fillColor(secondaryColor).text(profile.headline);
    }

    // Contact line
    const contacts: string[] = [];
    if (profile.location) contacts.push(profile.location);
    if (profile.contactInfo?.email && profile.contactInfo.emailPublic) {
      contacts.push(profile.contactInfo.email);
    }
    if (profile.contactInfo?.website) contacts.push(profile.contactInfo.website);
    profile.links.forEach((link) => contacts.push(link.url));

    if (contacts.length > 0) {
      doc.fontSize(9).font('Helvetica').fillColor(secondaryColor).text(contacts.join('  |  '));
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

    // ── Summary ─────────────────────────────────────────────
    if (profile.summary) {
      sectionHeader('Summary');
      doc.fontSize(10).font('Helvetica').fillColor(primaryColor).text(profile.summary);
    }

    // ── Work Experience ─────────────────────────────────────
    if (profile.workExperiences.length > 0) {
      sectionHeader('Experience');
      profile.workExperiences.forEach((exp, i) => {
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
              .text(`•  ${bullet}`, { indent: 10 });
          });
        }
      });
    }

    // ── Education ───────────────────────────────────────────
    if (profile.educations.length > 0) {
      sectionHeader('Education');
      profile.educations.forEach((edu, i) => {
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

    // ── Skills ──────────────────────────────────────────────
    if (profile.skills.length > 0 || profile.skillGroups.length > 0) {
      sectionHeader('Skills');
      if (profile.skillGroups.length > 0) {
        profile.skillGroups.forEach((group) => {
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
          .text(profile.skills.map((s) => s.name).join(', '));
      }
    }

    // ── Projects ────────────────────────────────────────────
    if (profile.projects.length > 0) {
      sectionHeader('Projects');
      profile.projects.forEach((project, i) => {
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

    // ── Certifications ──────────────────────────────────────
    if (profile.certifications.length > 0) {
      sectionHeader('Certifications');
      profile.certifications.forEach((cert, i) => {
        if (i > 0) doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor).text(cert.name);
        const details: string[] = [cert.issuer];
        if (cert.issueDate) details.push(formatDate(cert.issueDate));
        doc.fontSize(10).font('Helvetica').fillColor(secondaryColor).text(details.join(' | '));
      });
    }

    // ── Awards ──────────────────────────────────────────────
    if (profile.awards.length > 0) {
      sectionHeader('Awards');
      profile.awards.forEach((award, i) => {
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

    doc.end();
  });
}
