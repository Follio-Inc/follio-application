import { describe, expect, it } from 'vitest';

import {
  bulletsToHtml,
  containsHtmlFormatting,
  escapeHtml,
  htmlToBullets,
  isHtmlEmpty,
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
