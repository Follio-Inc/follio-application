/**
 * Shared headless Chromium → PDF pipeline for paper documents.
 * Resume and cover letter HTML generators feed this.
 */

import type { Browser } from 'puppeteer-core';

import {
  getDocumentPageSize,
  type DocumentPageLayout,
  type PdfLayout,
} from '@/lib/document-design';
import { logger } from '@/lib/logger';

const serviceLogger = logger.child({ source: 'document-pdf' });

export interface DocumentPdfOptions {
  /** @default 'letter' */
  layout?: PdfLayout;
}

function normalizePdfLayout(layout: string | undefined): DocumentPageLayout {
  if (layout === 'continuous' || layout === 'a4' || layout === 'letter') return layout;
  if (layout === 'paged') return 'letter';
  return 'letter';
}

function isServerlessChromiumRuntime(): boolean {
  if (process.platform !== 'linux') return false;
  return Boolean(process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * Launch a headless Chromium browser suitable for the current runtime.
 */
export async function launchBrowser(): Promise<Browser> {
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
    const tarPath = path.join(process.cwd(), 'public', `chromium-v147.0.0-pack.${arch}.tar`);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headless: (chromium as any).headless,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      defaultViewport: (chromium as any).defaultViewport,
    });
  }

  const { default: puppeteer } = await import('puppeteer');
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }) as unknown as Promise<Browser>;
}

/**
 * Render HTML to PDF with continuous / A4 / Letter layout modes.
 * Expects a `.resume-paper` (or compatible) root for continuous height measure.
 */
export async function generateDocumentPDF(
  html: string,
  { layout: rawLayout = 'letter' }: DocumentPdfOptions = {}
): Promise<Buffer> {
  const layout = normalizePdfLayout(rawLayout);
  const pageSize = getDocumentPageSize(layout);
  const paperWidthOverride =
    layout === 'a4'
      ? `<style>.resume-paper{max-width:${pageSize.widthPx}px;width:${pageSize.widthPx}px;}</style>`
      : '';
  const finalHtml = html.includes('</head>')
    ? html.replace('</head>', `${paperWidthOverride}</head>`)
    : `${paperWidthOverride}${html}`;

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(finalHtml, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    let pdfBuffer: Uint8Array;

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
  } finally {
    await browser.close();
  }
}
