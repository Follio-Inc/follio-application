import {
  getDocumentPageSize,
  type DocumentPageLayout,
  type PdfLayout,
} from '@/lib/document-design';

const SET_CONTENT_TIMEOUT_MS = 20_000;
/** Guard against a pathological continuous page that OOMs Chromium. */
const MAX_CONTINUOUS_HEIGHT_PX = 20_000;

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
  setDefaultTimeout?: (ms: number) => void;
  setContent: (
    html: string,
    options: { waitUntil: 'load' | 'domcontentloaded'; timeout?: number }
  ) => Promise<unknown>;
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

async function waitForFontsBriefly(page: HtmlPdfPage): Promise<void> {
  try {
    await page.evaluate(() =>
      Promise.race([
        document.fonts.ready.then(() => undefined),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 2500);
        }),
      ])
    );
  } catch {
    // Fallback system fonts — still print.
  }
}

export async function printHtmlOnPage(
  page: HtmlPdfPage,
  html: string,
  rawLayout: PdfLayout | string | undefined
): Promise<Buffer> {
  const layout = normalizePdfLayout(rawLayout);
  const pageSize = getDocumentPageSize(layout);
  const finalHtml = applyPaperWidthOverride(html, layout);

  page.setDefaultTimeout?.(SET_CONTENT_TIMEOUT_MS);

  // `load` waits for every photo/font request. A hung avatar URL on one
  // resume is why one account downloads and another gets a 500.
  await page.setContent(finalHtml, {
    waitUntil: 'domcontentloaded',
    timeout: SET_CONTENT_TIMEOUT_MS,
  });
  await waitForFontsBriefly(page);

  let pdfBuffer: Uint8Array | Buffer;

  if (layout === 'continuous') {
    const contentHeight = await page.evaluate(() => {
      const paper = document.querySelector('.resume-paper');
      return paper ? paper.scrollHeight : document.body.scrollHeight;
    });
    const heightPx = Math.min(
      Math.max(Number(contentHeight) || pageSize.heightPx, 1) + 20,
      MAX_CONTINUOUS_HEIGHT_PX
    );

    pdfBuffer = await page.pdf({
      width: `${pageSize.widthPx}px`,
      height: `${heightPx}px`,
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
