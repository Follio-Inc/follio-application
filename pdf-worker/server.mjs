/**
 * Warm Chromium PDF worker. One browser stays alive; each request opens a page.
 * Keep print logic in sync with lib/document-pdf/print-html.ts.
 */

import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';

import { chromium } from 'playwright';

const PORT = Number(process.env.PORT || 3001);
const SECRET = process.env.PDF_WORKER_SECRET || '';
const MAX_BODY_BYTES = 5_000_000;
const MAX_CONCURRENT = Math.max(1, Number(process.env.PDF_WORKER_CONCURRENCY || 2));
const SET_CONTENT_TIMEOUT_MS = 20_000;
const MAX_CONTINUOUS_HEIGHT_PX = 20_000;

const PAGE_SIZES = {
  letter: { widthPx: 816, pdfFormat: 'Letter' },
  a4: { widthPx: 794, pdfFormat: 'A4' },
};

/** @type {import('playwright').Browser | null} */
let browser = null;
let inflight = 0;
/** @type {Array<() => void>} */
const waiters = [];

function secretsMatch(header) {
  const expected = `Bearer ${SECRET}`;
  const a = Buffer.from(header || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function getBrowser() {
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  browser.on('disconnected', () => {
    browser = null;
  });
  return browser;
}

async function withConcurrencySlot(fn) {
  while (inflight >= MAX_CONCURRENT) {
    await new Promise((resolve) => {
      waiters.push(resolve);
    });
  }
  inflight += 1;
  try {
    return await fn();
  } finally {
    inflight -= 1;
    const next = waiters.shift();
    if (next) next();
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function normalizeLayout(raw) {
  if (raw === 'continuous' || raw === 'a4' || raw === 'letter') return raw;
  if (raw === 'paged') return 'letter';
  return 'letter';
}

async function htmlToPdfOnce(html, layout) {
  const pageSize = layout === 'a4' ? PAGE_SIZES.a4 : PAGE_SIZES.letter;
  const paperWidthOverride =
    layout === 'a4'
      ? `<style>.resume-paper{max-width:${pageSize.widthPx}px;width:${pageSize.widthPx}px;}</style>`
      : '';
  const finalHtml = html.includes('</head>')
    ? html.replace('</head>', `${paperWidthOverride}</head>`)
    : `${paperWidthOverride}${html}`;

  const instance = await getBrowser();
  const page = await instance.newPage();
  try {
    await page.setContent(finalHtml, {
      waitUntil: 'domcontentloaded',
      timeout: SET_CONTENT_TIMEOUT_MS,
    });
    try {
      await page.evaluate(() =>
        Promise.race([
          document.fonts.ready.then(() => undefined),
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ])
      );
    } catch {
      // print with fallback fonts
    }

    if (layout === 'continuous') {
      const contentHeight = await page.evaluate(() => {
        const paper = document.querySelector('.resume-paper');
        return paper ? paper.scrollHeight : document.body.scrollHeight;
      });
      const heightPx = Math.min(
        Math.max(Number(contentHeight) || 1056, 1) + 20,
        MAX_CONTINUOUS_HEIGHT_PX
      );
      return page.pdf({
        width: `${pageSize.widthPx}px`,
        height: `${heightPx}px`,
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      });
    }

    return page.pdf({
      format: pageSize.pdfFormat,
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function htmlToPdf(html, layout) {
  try {
    return await htmlToPdfOnce(html, layout);
  } catch (error) {
    console.error('PDF render attempt failed, relaunching browser:', error);
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
    return htmlToPdfOnce(html, layout);
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    try {
      const instance = await getBrowser();
      send(
        res,
        instance.isConnected() ? 200 : 503,
        JSON.stringify({ ok: instance.isConnected(), inflight }),
        { 'Content-Type': 'application/json' }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'browser down';
      send(res, 503, JSON.stringify({ ok: false, error: message }), {
        'Content-Type': 'application/json',
      });
    }
    return;
  }

  if (req.method !== 'POST' || url.pathname !== '/render') {
    send(res, 404, 'Not found');
    return;
  }

  if (!SECRET) {
    send(res, 500, 'PDF_WORKER_SECRET is not set');
    return;
  }

  if (!secretsMatch(req.headers.authorization)) {
    send(res, 401, 'Unauthorized');
    return;
  }

  try {
    const raw = await readBody(req);
    const payload = JSON.parse(raw.toString('utf8'));
    const html = typeof payload.html === 'string' ? payload.html : '';
    if (!html) {
      send(res, 400, 'html is required');
      return;
    }

    const layout = normalizeLayout(payload.layout);
    const pdf = await withConcurrencySlot(() => htmlToPdf(html, layout));
    send(res, 200, pdf, {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.length),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'render failed';
    console.error('PDF render failed:', message);
    send(res, 500, message);
  }
});

server.requestTimeout = 120_000;
server.headersTimeout = 125_000;
server.keepAliveTimeout = 65_000;

if (!SECRET) {
  console.error('PDF_WORKER_SECRET is required');
  process.exit(1);
}

const instance = await getBrowser();
console.log(
  `PDF worker listening on :${PORT} (browser ${instance.isConnected() ? 'ready' : 'down'}, concurrency ${MAX_CONCURRENT})`
);
server.listen(PORT);
