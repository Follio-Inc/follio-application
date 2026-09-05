import type { PdfLayout } from '@/lib/document-design';
import { printHtmlOnPage, type HtmlPdfPage } from '@/lib/document-pdf/print-html';

/**
 * Chromium bundled in the serverless function (no Fly worker, no runtime tar download).
 */
export async function renderPdfViaServerlessChromium(
  html: string,
  layout: PdfLayout
): Promise<Buffer> {
  const [{ default: chromium }, puppeteerCore] = await Promise.all([
    import('@sparticuz/chromium'),
    import('puppeteer-core'),
  ]);

  chromium.setGraphicsMode = false;
  const executablePath = await chromium.executablePath();
  const browser = await puppeteerCore.launch({
    args: [...chromium.args, '--disable-dev-shm-usage'],
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    return await printHtmlOnPage(page as unknown as HtmlPdfPage, html, layout);
  } finally {
    await browser.close();
  }
}
