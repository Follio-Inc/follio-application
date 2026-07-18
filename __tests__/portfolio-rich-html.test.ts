import { describe, expect, it } from 'vitest';

import {
  isPortfolioRichHtml,
  isPortfolioTextEmpty,
  portfolioHtmlToPlainText,
  sanitizePortfolioHtml,
  toPortfolioEditorHtml,
  toPortfolioStoredText,
} from '@/lib/portfolio/rich-html';

describe('portfolio rich html', () => {
  it('detects portfolio block markup', () => {
    expect(isPortfolioRichHtml('<p>Hello</p>')).toBe(true);
    expect(isPortfolioRichHtml('<h2>Title</h2>')).toBe(true);
    expect(isPortfolioRichHtml('<blockquote><p>Q</p></blockquote>')).toBe(true);
    expect(isPortfolioRichHtml('Just plain text')).toBe(false);
  });

  it('sanitizes to Medium-style allowlist and strips links/lists', () => {
    const dirty =
      '<p style="text-align: center">Hi <strong>there</strong></p><script>alert(1)</script><ul><li>x</li></ul><a href="https://evil.test">link</a>';
    const clean = sanitizePortfolioHtml(dirty);
    expect(clean).toContain('<p');
    expect(clean).toContain('<strong>');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('<ul');
    expect(clean).not.toContain('<a ');
  });

  it('preserves portfolio HTML on store and strips resume-style HTML', () => {
    expect(toPortfolioStoredText('<p>Edited in portfolio</p>')).toBe('<p>Edited in portfolio</p>');
    expect(toPortfolioStoredText('<p>Has <a href="https://x.test">link</a></p>')).not.toContain(
      '<a '
    );
    expect(toPortfolioStoredText('<ul><li>Resume bullet</li></ul>')).toBe('Resume bullet');
  });

  it('wraps plain text for the editor', () => {
    expect(toPortfolioEditorHtml('Hello world')).toBe('<p>Hello world</p>');
    expect(toPortfolioEditorHtml('')).toBe('');
  });

  it('treats empty markup as empty', () => {
    expect(isPortfolioTextEmpty('<p></p>')).toBe(true);
    expect(isPortfolioTextEmpty('<p><br></p>')).toBe(true);
    expect(isPortfolioTextEmpty('<p>Hi</p>')).toBe(false);
  });

  it('extracts plain text for SEO/AI', () => {
    expect(portfolioHtmlToPlainText('<h2>Hello</h2><p>World</p>')).toBe('Hello World');
  });
});
