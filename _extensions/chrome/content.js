/**
 * Extract the most likely job-description text from the current page.
 * Heuristic: prefer known JD containers, then main/article, then body — strip chrome.
 */

(function () {
  const JD_HINT =
    /\b(responsibilities|requirements|qualifications|about the (role|job|position)|job description|what you.ll (do|bring)|minimum qualifications|preferred qualifications)\b/i;

  const SELECTORS = [
    '[data-automation-id="jobPostingDescription"]', // Workday
    '[data-automation-id="job-posting-details"]',
    '.job-description',
    '#job-description',
    '.jobDescription',
    '[class*="job-description" i]',
    '[class*="JobDescription" i]',
    '[class*="posting-description" i]',
    'article',
    'main',
    '[role="main"]',
  ];

  function visibleText(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone
      .querySelectorAll('script, style, noscript, svg, nav, footer, header')
      .forEach((n) => n.remove());
    return (clone.innerText || clone.textContent || '')
      .replace(/\s+\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function scoreCandidate(text) {
    if (!text || text.length < 80) return 0;
    let score = Math.min(text.length / 500, 8);
    if (JD_HINT.test(text)) score += 6;
    if (/\b(apply|years of experience|bachelor|remote|hybrid)\b/i.test(text)) score += 2;
    // Penalize huge dumps (likely whole page chrome)
    if (text.length > 40_000) score -= 4;
    return score;
  }

  function extractJobDescription() {
    const candidates = [];

    for (const sel of SELECTORS) {
      try {
        document.querySelectorAll(sel).forEach((el) => {
          const text = visibleText(el);
          candidates.push({ text, score: scoreCandidate(text), source: sel });
        });
      } catch {
        // invalid selector in some browsers — ignore
      }
    }

    // Also scan sections/divs with JD-ish headings
    document.querySelectorAll('section, div').forEach((el) => {
      const heading = el.querySelector('h1, h2, h3');
      const headingText = heading?.innerText || '';
      if (JD_HINT.test(headingText) || JD_HINT.test(el.className || '')) {
        const text = visibleText(el);
        candidates.push({ text, score: scoreCandidate(text) + 3, source: 'heading-near' });
      }
    });

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates.find((c) => c.score > 0 && c.text.length >= 80);

    let text = best?.text || visibleText(document.body);
    // Cap payload size for the API
    if (text.length > 60_000) text = text.slice(0, 60_000);

    const looksLikeJd = JD_HINT.test(text) || scoreCandidate(text) >= 4;

    return {
      text,
      looksLikeJd,
      pageUrl: location.href,
      pageTitle: document.title || '',
      source: best?.source || 'body',
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'FOLLIO_EXTRACT_JD') {
      try {
        sendResponse({ ok: true, data: extractJobDescription() });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || 'Extract failed' });
      }
      return true;
    }
    return false;
  });
})();
