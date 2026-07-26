import { describe, expect, it } from 'vitest';

import {
  buildLinkShareEmailSubject,
  buildLinkShareMessage,
  buildPrivateDocumentShareEmailSubject,
  buildPrivateDocumentShareMessage,
  detectWebmailProvider,
} from '@/lib/share';

describe('buildLinkShareMessage', () => {
  it('includes the share URL and content label', () => {
    const message = buildLinkShareMessage('Alex', 'https://follio.me/alex', 'resume');
    expect(message).toContain('resume');
    expect(message).toContain('https://follio.me/alex');
    expect(message).toContain('Alex');
  });

  it('uses portfolio wording', () => {
    const message = buildLinkShareMessage(null, 'https://follio.me/alex/portfolio', 'portfolio');
    expect(message).toContain('portfolio');
    expect(message).toContain('https://follio.me/alex/portfolio');
  });

  it('uses cover letter wording for unlisted letters', () => {
    const message = buildLinkShareMessage('Alex', 'https://follio.me/cl/abc', 'cover-letter');
    expect(message).toContain('cover letter');
    expect(message).toContain('https://follio.me/cl/abc');
  });
});

describe('buildPrivateDocumentShareMessage', () => {
  it('never includes a public URL', () => {
    const message = buildPrivateDocumentShareMessage('Alex', 'cover letter');
    expect(message).toContain('cover letter');
    expect(message).toContain('Alex');
    expect(message).not.toMatch(/https?:\/\//);
    expect(message).not.toContain('follio.me');
  });
});

describe('share email subjects', () => {
  it('builds link subjects with and without a first name', () => {
    expect(buildLinkShareEmailSubject('Alex', 'resume')).toBe('Alex shared a resume with you');
    expect(buildLinkShareEmailSubject(null, 'portfolio')).toBe('Shared a portfolio with you');
    expect(buildLinkShareEmailSubject('Alex', 'cover-letter')).toBe(
      'Alex shared a cover letter with you'
    );
  });

  it('prefers title for private documents', () => {
    expect(buildPrivateDocumentShareEmailSubject('Acme role', 'cover letter')).toBe('Acme role');
    expect(buildPrivateDocumentShareEmailSubject('  ', 'cover letter')).toBe('My cover letter');
  });
});

describe('detectWebmailProvider', () => {
  it('maps known domains and ignores unknown ones', () => {
    expect(detectWebmailProvider('me@gmail.com')?.name).toBe('Gmail');
    expect(detectWebmailProvider('me@outlook.com')?.name).toBe('Outlook');
    expect(detectWebmailProvider('me@company.io')).toBeNull();
    expect(detectWebmailProvider(null)).toBeNull();
  });
});
