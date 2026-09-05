import {
  getDocumentPageSize,
  type DocumentPageLayout,
  type PdfLayout,
} from '@/lib/document-design';

export function normalizePdfLayout(layout: string | undefined): DocumentPageLayout {
  if (layout === 'continuous' || layout === 'a4' || layout === 'letter') return layout;
  if (layout === 'paged') return 'letter';
  return 'letter';
}

/**
 * Puppeteer/Playwright page surface used to print HTML.
 * Keep in sync with pdf-worker/server.mjs.
 */
export interface HtmlPdfPage {
  setContent: (html: string, options: { waitUntil: 'load' }) => Promise<unknown>;
  evaluate: <T>(pageFunction: () => T | Promise<T>) => Promise<T>;
  pdf: (options: {
    width?: string;
    height?: string;
    format?: 'A4' | 'Letter';
    printBackground: boolean;
    margin: { top: string; right: string; bottom: string; left: string };
  }) => Promise<Uint8Array | Buffer>;
}

export function applyPaperWidthOverride(html: string, layout: DocumentPageLayout): string {
  const pageSize = getDocumentPageSize(layout);
  const paperWidthOverride =
    layout === 'a4'
      ? `<style>.resume-paper{max-width:${pageSize.widthPx}px;width:${pageSize.widthPx}px;}</style>`
      : '';
  if (!paperWidthOverride) return html;
  return html.includes('</head>')
    ? html.replace('</head>', `${paperWidthOverride}</head>`)
    : `${paperWidthOverride}${html}`;
}

export async function printHtmlOnPage(
  page: HtmlPdfPage,
  html: string,
  rawLayout: PdfLayout | string | undefined
): Promise<Buffer> {
  const layout = normalizePdfLayout(rawLayout);
  const pageSize = getDocumentPageSize(layout);
  const finalHtml = applyPaperWidthOverride(html, layout);

  await page.setContent(finalHtml, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  let pdfBuffer: Uint8Array | Buffer;

  if (layout === 'continuous') {
    const contentHeight = await page.evaluate(() => {
      const paper = document.querySelector('.resume-paper');
      return paper ? paper.scrollHeight : document.body.scrollHeight;
    });

    pdfBuffer = await page.pdf({
      width: `${pageSize.widthPx}px`,
      height: `${contentHeight + 20}px`,
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    });
  } else {
    pdfBuffer = await page.pdf({
      format: pageSize.pdfFormat,
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    });
  }

  return Buffer.from(pdfBuffer);
}
