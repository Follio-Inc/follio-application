import type { PdfLayout } from '@/lib/document-design';
import { printHtmlOnPage, type HtmlPdfPage } from '@/lib/document-pdf/print-html';

/**
 * Local Chromium (full Puppeteer). Used in `next dev` when PDF_WORKER_URL is unset.
 */
export async function renderPdfViaLocalChromium(html: string, layout: PdfLayout): Promise<Buffer> {
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    return await printHtmlOnPage(page as unknown as HtmlPdfPage, html, layout);
  } finally {
    await browser.close();
  }
}
