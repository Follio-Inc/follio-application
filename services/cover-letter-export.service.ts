/**
 * Cover letter PDF HTML — mirrors CleanCoverLetterView using shared --rd-* tokens.
 */

import {
  buildCoverLetterDesignStyleAttr,
  coverLetterBodyParagraphs,
  mergeCoverLetterContent,
  mergeCoverLetterDesign,
  type CoverLetterContent,
  type CoverLetterDesign,
} from '@/lib/cover-letter';
import { defaultResolvedFonts, resolveDocumentColorTheme } from '@/lib/document-design';
import { generateDocumentPDF, type DocumentPdfOptions } from '@/services/document-pdf.service';
import type { DocumentFontFamily } from '@/lib/document-design';

/** Google Font URLs — same allowlist as resume PDF export. */
const GOOGLE_FONT_URLS: Partial<Record<DocumentFontFamily, string>> = {
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

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const COVER_LETTER_PDF_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .resume-paper {
    margin: 0 auto;
    padding: 48px 56px;
    background: #fff;
    color: #171717;
    font-family: var(--rd-font-body);
    font-size: var(--rd-font-size);
    line-height: 1.55;
  }
  [data-resume-theme='dark'] .resume-paper {
    background: #0a0a0a;
    color: #e5e5e5;
  }
  .cover-letter-meta p { margin: 0; }
  .cover-letter-body p { margin: 0 0 var(--rd-entry-gap); }
  .cover-letter-body p:last-child { margin-bottom: 0; }
  .resume-justify-all .cover-letter-meta { text-align: justify; }
`;

export function toCoverLetterPDFHtml(
  content: CoverLetterContent | null | undefined,
  design: CoverLetterDesign | null | undefined
): string {
  const c = mergeCoverLetterContent(content);
  const d = mergeCoverLetterDesign(design);
  const designStyleAttr = buildCoverLetterDesignStyleAttr(d);
  const theme = resolveDocumentColorTheme(d.colorTheme);
  const fonts = defaultResolvedFonts(d);
  const fontUrls = new Set(
    [fonts.body, fonts.name, fonts.heading]
      .map((face) => GOOGLE_FONT_URLS[face])
      .filter((url): url is string => Boolean(url))
  );
  const fontLink = [...fontUrls]
    .map((url) => `<link rel="stylesheet" href="${url}" crossorigin="anonymous" />`)
    .join('\n  ');

  const recipientLines = [c.recipientName, c.recipientTitle, c.company, c.companyAddress]
    .filter((line) => line?.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');

  const paragraphs = coverLetterBodyParagraphs(c.body)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('');

  const nameStyle = `font-family:var(--rd-font-name);font-size:var(--rd-name-font-size);font-weight:var(--rd-name-font-weight);font-style:var(--rd-name-font-style);text-decoration:var(--rd-name-text-decoration);color:var(--rd-heading-color)`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  ${fontLink}
  <style>${COVER_LETTER_PDF_CSS}</style>
</head>
<body>
  <article class="resume-paper cover-letter-paper${d.justifyAll ? ' resume-justify-all' : ''}"
    data-resume-theme="${theme}"
    style="${designStyleAttr}">
    ${
      c.signatureName
        ? `<header class="cover-letter-header" style="margin-bottom:var(--rd-header-margin-bottom)">
      <h1 class="resume-name" style="margin:0;${nameStyle}">${escapeHtml(c.signatureName)}</h1>
    </header>`
        : ''
    }
    <div class="cover-letter-meta" style="font-family:var(--rd-font-body);font-size:var(--rd-font-size);font-weight:var(--rd-body-font-weight);font-style:var(--rd-body-font-style);color:var(--rd-heading-color)">
      ${c.date ? `<p style="margin-bottom:1rem;opacity:0.85">${escapeHtml(c.date)}</p>` : ''}
      ${recipientLines ? `<div style="margin-bottom:1rem">${recipientLines}</div>` : ''}
      ${c.greeting ? `<p style="margin-bottom:1rem">${escapeHtml(c.greeting)}</p>` : ''}
      <div class="cover-letter-body" style="margin-bottom:1.5rem">
        ${paragraphs || '<p style="opacity:0.5;font-style:italic"> </p>'}
      </div>
      <div style="margin-top:1.5rem">
        ${c.closing ? `<p style="margin-bottom:1.5rem">${escapeHtml(c.closing)}</p>` : ''}
        ${
          c.signatureName
            ? `<p style="font-family:var(--rd-font-name);font-weight:var(--rd-name-font-weight)">${escapeHtml(c.signatureName)}</p>`
            : ''
        }
      </div>
    </div>
  </article>
</body>
</html>`;
}

export async function generateCoverLetterPDF(
  content: CoverLetterContent | null | undefined,
  design: CoverLetterDesign | null | undefined,
  options: DocumentPdfOptions = {}
): Promise<Buffer> {
  return generateDocumentPDF(toCoverLetterPDFHtml(content, design), options);
}
