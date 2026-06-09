import { describe, expect, it } from 'vitest';

import {
  bulletsToHtml,
  containsHtmlFormatting,
  escapeHtml,
  htmlToBullets,
  isHtmlEmpty,
  isHtmlFullyJustified,
  justifyHtmlContent,
  sanitizeRichHtml,
  stripHtmlTags,
} from '@/lib/html-utils';

// ─── containsHtmlFormatting ────────────────────────────────────────────────

describe('containsHtmlFormatting', () => {
  it('detects <strong> tags', () => {
    expect(containsHtmlFormatting('<strong>Bold</strong> text')).toBe(true);
  });

  it('detects <em> tags', () => {
    expect(containsHtmlFormatting('<em>italic</em> words')).toBe(true);
  });

  it('detects <u> tags', () => {
    expect(containsHtmlFormatting('<u>underlined</u>')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(containsHtmlFormatting('Just a regular bullet point')).toBe(false);
  });

  it('returns false for angle brackets that are not HTML tags', () => {
    expect(containsHtmlFormatting('Reduced latency by <50ms')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(containsHtmlFormatting('')).toBe(false);
  });
});

// ─── escapeHtml ────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('leaves safe text unchanged', () => {
    expect(escapeHtml('Hello world')).toBe('Hello world');
  });
});

// ─── isHtmlEmpty ───────────────────────────────────────────────────────────

describe('isHtmlEmpty', () => {
  it('returns true for null and undefined', () => {
    expect(isHtmlEmpty(null)).toBe(true);
    expect(isHtmlEmpty(undefined)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isHtmlEmpty('')).toBe(true);
  });

  it('returns true for whitespace-only string', () => {
    expect(isHtmlEmpty('   ')).toBe(true);
    expect(isHtmlEmpty('\n\t')).toBe(true);
  });

  it('returns true for empty paragraph tags (Tiptap default)', () => {
    expect(isHtmlEmpty('<p></p>')).toBe(true);
  });

  it('returns true for paragraph with only a <br>', () => {
    expect(isHtmlEmpty('<p><br></p>')).toBe(true);
    expect(isHtmlEmpty('<p><br/></p>')).toBe(true);
    expect(isHtmlEmpty('<p><br /></p>')).toBe(true);
  });

  it('returns true for nested empty tags', () => {
    expect(isHtmlEmpty('<p><strong></strong></p>')).toBe(true);
  });

  it('returns true for &nbsp; only', () => {
    expect(isHtmlEmpty('<p>&nbsp;</p>')).toBe(true);
  });

  it('returns false for content with text', () => {
    expect(isHtmlEmpty('<p>Hello world</p>')).toBe(false);
  });

  it('returns false for formatted text', () => {
    expect(isHtmlEmpty('<p><strong>Bold</strong> text</p>')).toBe(false);
  });

  it('returns false for plain text', () => {
    expect(isHtmlEmpty('Some summary text')).toBe(false);
  });
});

// ─── stripHtmlTags ─────────────────────────────────────────────────────────

describe('stripHtmlTags', () => {
  it('strips <strong> and <em> tags', () => {
    expect(stripHtmlTags('<strong>Bold</strong> and <em>italic</em>')).toBe('Bold and italic');
  });

  it('converts <br> to newline', () => {
    expect(stripHtmlTags('Line 1<br>Line 2')).toBe('Line 1\nLine 2');
  });

  it('handles empty input', () => {
    expect(stripHtmlTags('')).toBe('');
  });

  it('decodes HTML entities', () => {
    expect(stripHtmlTags('&amp; &lt; &gt; &quot;')).toBe('& < > "');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtmlTags('Just text')).toBe('Just text');
  });
});

// ─── bulletsToHtml ─────────────────────────────────────────────────────────

describe('bulletsToHtml', () => {
  it('converts plain-text bullets to HTML list', () => {
    const result = bulletsToHtml(['First bullet', 'Second bullet']);
    expect(result).toContain(
      '<ul class="rich-text-bullets bullet-style-disc" data-bullet-style="disc">'
    );
    expect(result).toContain('<li><p>First bullet</p></li>');
    expect(result).toContain('<li><p>Second bullet</p></li>');
  });

  it('escapes special characters in plain-text bullets', () => {
    const result = bulletsToHtml(['Use <script> tags carefully']);
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('preserves HTML formatting in already-formatted bullets', () => {
    const result = bulletsToHtml(['<strong>Bold</strong> text']);
    expect(result).toContain('<li><p><strong>Bold</strong> text</p></li>');
  });

  it('returns empty string for empty array', () => {
    expect(bulletsToHtml([])).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(bulletsToHtml(null)).toBe('');
    expect(bulletsToHtml(undefined)).toBe('');
  });

  it('handles mixed plain and HTML bullets', () => {
    const result = bulletsToHtml(['Plain text', '<em>Italic</em> bullet']);
    expect(result).toContain('<li><p>Plain text</p></li>');
    expect(result).toContain('<li><p><em>Italic</em> bullet</p></li>');
  });
});

// ─── htmlToBullets ─────────────────────────────────────────────────────────

describe('htmlToBullets', () => {
  it('extracts plain text from list items', () => {
    const html = '<ul><li><p>First</p></li><li><p>Second</p></li></ul>';
    expect(htmlToBullets(html)).toEqual(['First', 'Second']);
  });

  it('preserves inline formatting tags', () => {
    const html = '<ul><li><p><strong>Bold</strong> text</p></li></ul>';
    expect(htmlToBullets(html)).toEqual(['<strong>Bold</strong> text']);
  });

  it('preserves mixed formatting', () => {
    const html = '<ul><li><p><strong>Led</strong> a team of <em>5 engineers</em></p></li></ul>';
    expect(htmlToBullets(html)).toEqual(['<strong>Led</strong> a team of <em>5 engineers</em>']);
  });

  it('strips the wrapper <p> tag from Tiptap output', () => {
    const html = '<ul class="rich-text-bullets bullet-style-disc"><li><p>Content</p></li></ul>';
    const result = htmlToBullets(html);
    expect(result).toEqual(['Content']);
    // Should NOT contain <p> wrapper
    expect(result[0]).not.toContain('<p>');
  });

  it('handles list items without <p> wrapper', () => {
    const html = '<ul><li>Direct content</li></ul>';
    expect(htmlToBullets(html)).toEqual(['Direct content']);
  });

  it('filters out empty items', () => {
    const html = '<ul><li><p></p></li><li><p>Non-empty</p></li></ul>';
    expect(htmlToBullets(html)).toEqual(['Non-empty']);
  });

  it('returns empty array for empty string', () => {
    expect(htmlToBullets('')).toEqual([]);
  });

  it('falls back to newline splitting for non-list HTML', () => {
    const html = '<p>Line one</p><p>Line two</p>';
    const result = htmlToBullets(html);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Line one');
  });
});

// ─── Round-trip ────────────────────────────────────────────────────────────

describe('bulletsToHtml → htmlToBullets round-trip', () => {
  it('preserves plain text bullets through round-trip', () => {
    const original = ['Led a team of 5', 'Built CI/CD pipeline', 'Reduced deploy time by 40%'];
    const html = bulletsToHtml(original);
    const restored = htmlToBullets(html);
    expect(restored).toEqual(original);
  });

  it('preserves HTML-formatted bullets through round-trip', () => {
    const original = ['<strong>Led</strong> a team of 5', '<em>Built</em> CI/CD pipeline'];
    const html = bulletsToHtml(original);
    const restored = htmlToBullets(html);
    expect(restored).toEqual(original);
  });
});

// ─── isHtmlFullyJustified ──────────────────────────────────────────────────

describe('isHtmlFullyJustified', () => {
  it('returns true for null/undefined/empty', () => {
    expect(isHtmlFullyJustified(null)).toBe(true);
    expect(isHtmlFullyJustified(undefined)).toBe(true);
    expect(isHtmlFullyJustified('')).toBe(true);
  });

  it('returns true for HTML with no text-align', () => {
    expect(isHtmlFullyJustified('<p>Hello world</p>')).toBe(true);
  });

  it('returns true for HTML with text-align: justify', () => {
    expect(isHtmlFullyJustified('<p style="text-align: justify">Hello</p>')).toBe(true);
  });

  it('returns false for text-align: left', () => {
    expect(isHtmlFullyJustified('<p style="text-align: left">Hello</p>')).toBe(false);
  });

  it('returns false for text-align: center', () => {
    expect(isHtmlFullyJustified('<p style="text-align: center">Hello</p>')).toBe(false);
  });

  it('returns false for text-align: right', () => {
    expect(isHtmlFullyJustified('<p style="text-align: right">Hello</p>')).toBe(false);
  });

  it('returns false when mixed alignments exist', () => {
    const html = '<p style="text-align: justify">Justified</p><p style="text-align: left">Left</p>';
    expect(isHtmlFullyJustified(html)).toBe(false);
  });

  it('handles TipTap bullet list HTML with alignment', () => {
    const html = '<ul><li><p style="text-align: center">Item 1</p></li><li><p>Item 2</p></li></ul>';
    expect(isHtmlFullyJustified(html)).toBe(false);
  });
});

// ─── justifyHtmlContent ────────────────────────────────────────────────────

describe('justifyHtmlContent', () => {
  it('returns null for null input', () => {
    expect(justifyHtmlContent(null)).toBe(null);
  });

  it('returns null for undefined input', () => {
    expect(justifyHtmlContent(undefined)).toBe(null);
  });

  it('returns unchanged HTML when already justified', () => {
    const html = '<p style="text-align: justify">Hello</p>';
    expect(justifyHtmlContent(html)).toBe(html);
  });

  it('returns unchanged HTML when no text-align exists', () => {
    const html = '<p>Simple text</p>';
    expect(justifyHtmlContent(html)).toBe(html);
  });

  it('replaces text-align: left with justify', () => {
    const html = '<p style="text-align: left">Hello</p>';
    expect(justifyHtmlContent(html)).toBe('<p style="text-align: justify">Hello</p>');
  });

  it('replaces text-align: center with justify', () => {
    const html = '<p style="text-align: center">Hello</p>';
    expect(justifyHtmlContent(html)).toBe('<p style="text-align: justify">Hello</p>');
  });

  it('replaces text-align: right with justify', () => {
    const html = '<p style="text-align: right">Hello</p>';
    expect(justifyHtmlContent(html)).toBe('<p style="text-align: justify">Hello</p>');
  });

  it('replaces all occurrences in multi-element HTML', () => {
    const html = '<p style="text-align: left">First</p><p style="text-align: right">Second</p>';
    expect(justifyHtmlContent(html)).toBe(
      '<p style="text-align: justify">First</p><p style="text-align: justify">Second</p>'
    );
  });

  it('preserves other inline styles alongside text-align', () => {
    const html = '<p style="color: red; text-align: center; font-weight: bold">Hello</p>';
    expect(justifyHtmlContent(html)).toBe(
      '<p style="color: red; text-align: justify; font-weight: bold">Hello</p>'
    );
  });

  it('handles bullet list HTML with mixed alignment', () => {
    const html = '<ul><li><p style="text-align: center">Item 1</p></li><li><p>Item 2</p></li></ul>';
    const result = justifyHtmlContent(html);
    expect(result).toBe(
      '<ul><li><p style="text-align: justify">Item 1</p></li><li><p>Item 2</p></li></ul>'
    );
    expect(isHtmlFullyJustified(result!)).toBe(true);
  });
});

// ─── sanitizeRichHtml ───────────────────────────────────────────────────────

describe('sanitizeRichHtml', () => {
  it('returns empty string for null, undefined and empty input', () => {
    expect(sanitizeRichHtml(null)).toBe('');
    expect(sanitizeRichHtml(undefined)).toBe('');
    expect(sanitizeRichHtml('')).toBe('');
  });

  it('preserves allowed inline formatting tags', () => {
    const html = '<strong>Bold</strong> <em>italic</em> <u>under</u> <s>strike</s>';
    expect(sanitizeRichHtml(html)).toBe(html);
  });

  it('preserves bullet lists with style classes', () => {
    const html = '<ul class="bullet-style-disc" data-bullet-style="disc"><li><p>Item</p></li></ul>';
    expect(sanitizeRichHtml(html)).toBe(html);
  });

  it('preserves text-align inline styles', () => {
    const html = '<p style="text-align: center">Centered</p>';
    expect(sanitizeRichHtml(html)).toBe(html);
  });

  it('strips <script> tags entirely', () => {
    const result = sanitizeRichHtml('<p>Safe</p><script>alert(1)</script>');
    expect(result).toContain('<p>Safe</p>');
    expect(result).not.toContain('<script');
    expect(result.toLowerCase()).not.toContain('alert(1)');
  });

  it('strips <img> tags with onerror handlers (stored XSS vector)', () => {
    const result = sanitizeRichHtml('<img src=x onerror="alert(document.cookie)">');
    expect(result).not.toContain('<img');
    expect(result.toLowerCase()).not.toContain('onerror');
  });

  it('removes inline event handler attributes', () => {
    const result = sanitizeRichHtml('<p onclick="steal()">Click</p>');
    expect(result.toLowerCase()).not.toContain('onclick');
    expect(result).toContain('Click');
  });

  it('strips javascript: protocol from anchor href', () => {
    // eslint-disable-next-line no-script-url
    const result = sanitizeRichHtml('<a href="javascript:alert(1)">link</a>');
    expect(result.toLowerCase()).not.toContain('javascript:');
  });

  it('strips data: protocol from anchor href', () => {
    const result = sanitizeRichHtml('<a href="data:text/html,<script>alert(1)</script>">link</a>');
    expect(result.toLowerCase()).not.toContain('data:');
  });

  it('preserves safe http(s) links', () => {
    const html = '<a href="https://example.com">site</a>';
    expect(sanitizeRichHtml(html)).toContain('href="https://example.com"');
  });

  it('preserves mailto and tel links', () => {
    expect(sanitizeRichHtml('<a href="mailto:a@b.com">m</a>')).toContain('mailto:a@b.com');
    expect(sanitizeRichHtml('<a href="tel:+15551234">t</a>')).toContain('tel:+15551234');
  });

  it('adds rel="noopener noreferrer" to target=_blank links', () => {
    const result = sanitizeRichHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('strips disallowed structural tags like <iframe>', () => {
    const result = sanitizeRichHtml('<iframe src="https://evil.com"></iframe><p>ok</p>');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('<p>ok</p>');
  });
});
