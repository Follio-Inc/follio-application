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
import {
  defaultResolvedFonts,
  documentGoogleFontLinkTags,
  resolveDocumentColorTheme,
} from '@/lib/document-design';
import { escapeHtml } from '@/lib/html-utils';
import { generateDocumentPDF, type DocumentPdfOptions } from '@/services/document-pdf.service';

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
  const fontLink = documentGoogleFontLinkTags([fonts.body, fonts.name, fonts.heading]);

  const recipientLines = [c.recipientName, c.recipientTitle, c.company, c.companyAddress]
    .filter((line) => line?.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');

  const paragraphs = coverLetterBodyParagraphs(c.body)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('');

  // Markup matches CleanCoverLetterView: date → recipient → greeting → body → closing → signature.
  // Signature appears only in the footer (never as a top header).
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
    <div class="cover-letter-meta" style="font-family:var(--rd-font-body);font-size:var(--rd-font-size);font-weight:var(--rd-body-font-weight);font-style:var(--rd-body-font-style);color:var(--rd-heading-color)">
      ${c.date ? `<p style="margin-bottom:1rem;opacity:0.85">${escapeHtml(c.date)}</p>` : ''}
      ${recipientLines ? `<div style="margin-bottom:1rem">${recipientLines}</div>` : ''}
      ${c.greeting ? `<p style="margin-bottom:1rem">${escapeHtml(c.greeting)}</p>` : ''}
      <div class="cover-letter-body" style="margin-bottom:1.5rem">
        ${paragraphs || '<p style="opacity:0.5;font-style:italic"> </p>'}
      </div>
      <div style="margin-top:1.5rem">
        ${c.closing ? `<p style="margin-bottom:1.5rem">${escapeHtml(c.closing)}</p>` : ''}
        ${c.signatureName ? `<p>${escapeHtml(c.signatureName)}</p>` : ''}
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
