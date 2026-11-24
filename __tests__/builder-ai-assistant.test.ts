/**
 * AI Resume Assistant — Builder wiring.
 *
 * The repo has no DOM test environment (the `.tsx` suites render with
 * `renderToStaticMarkup`), so clicks and effects cannot be driven here. What
 * these tests can do — and what actually matters for this change — is pin the
 * wiring guarantees that are easy to regress silently:
 *
 *   - Keywords reuses the job-description path rather than adding an agent
 *     mode or a second endpoint;
 *   - the Builder panel owns no fetching and no hardcoded resume id;
 *   - the assistant renders above the Header section;
 *   - opening the dialog only auto-runs for the general focus, so the other
 *     three cannot spend a billable call just by appearing.
 *
 * Source assertions follow the convention already used by
 * `__tests__/platform-resume-lab.test.ts`, which asserts against shipped
 * source for the same reason: a mock would hide the thing being guaranteed.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { apiModeFor } from '@/app/(dashboard)/resumes/analyze-resume-dialog';

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/**
 * Drop comments so a prose mention of an endpoint is not mistaken for a call
 * to one. Good enough for assertions over this file; not a parser.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const ASSISTANT_PATH = 'app/(dashboard)/builder/components/ai-resume-assistant.tsx';
const EDITOR_PATH = 'app/(dashboard)/builder/components/all-sections-editor.tsx';
const DIALOG_PATH = 'app/(dashboard)/resumes/analyze-resume-dialog.tsx';

describe('analysis focus → agent mode', () => {
  it('runs Keywords as a job-description request, not a new agent mode', () => {
    expect(apiModeFor('keywords')).toBe('jd');
  });

  it('leaves the three real agent modes untouched', () => {
    expect(apiModeFor('general')).toBe('general');
    expect(apiModeFor('jd')).toBe('jd');
    expect(apiModeFor('role')).toBe('role');
  });
});

describe('AI Resume Assistant panel', () => {
  const source = readSource(ASSISTANT_PATH);

  it('offers exactly the four requested actions', () => {
    for (const label of [
      'General Resume Evaluation',
      'Job Description Evaluation',
      'Target Role Evaluation',
      'Missing Keywords',
    ]) {
      expect(source).toContain(label);
    }

    // One entry per focus, no duplicates.
    const focuses = [...source.matchAll(/^\s*focus: '([a-z]+)',$/gm)].map((match) => match[1]);
    expect(focuses).toEqual(['general', 'jd', 'role', 'keywords']);
  });

  it('calls no API of its own — every action goes through the shared dialog', () => {
    const code = stripComments(source);

    expect(code).not.toMatch(/\bfetch\s*\(/);
    // No endpoint path in executable code (the file may name one in a comment).
    expect(code).not.toContain('/api/');
    expect(code).toContain('AnalyzeResumeDialog');
  });

  it('takes the resume id from the Builder store rather than hardcoding one', () => {
    expect(source).toContain('useBuilderStore');
    expect(source).toContain('state.draftProfile.id');

    // No literal cuid/uuid-looking id anywhere in the file.
    expect(source).not.toMatch(/['"]c[a-z0-9]{24}['"]/);
    expect(source).not.toMatch(
      /['"][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]/i
    );
  });

  it('mounts the dialog without a resume until an action is clicked', () => {
    // `analyzingResume` starts null and is only set inside startAnalysis.
    expect(source).toMatch(/useState<\{ id: string; title: string \} \| null>\(\s*null\s*\)/);
    expect(source).toContain('resume={analyzingResume}');
  });

  it('is read-only and says so', () => {
    expect(source).toMatch(/Read-only/i);
  });
});

describe('Builder CONTENT panel placement', () => {
  const source = readSource(EDITOR_PATH);

  it('renders the assistant above the pinned Header section', () => {
    const assistant = source.indexOf('<AiResumeAssistant />');
    const pinned = source.indexOf('pinnedSections.map');

    expect(assistant).toBeGreaterThan(-1);
    expect(pinned).toBeGreaterThan(-1);
    expect(assistant).toBeLessThan(pinned);
  });

  it('keeps BASIC_INFO as the pinned Header section', () => {
    expect(source).toContain("BASIC_INFO: 'Header'");
    expect(source).toContain("PINNED_SECTION_TYPES = new Set<string>(['BASIC_INFO'])");
  });
});

describe('dialog billing guard', () => {
  const source = readSource(DIALOG_PATH);

  it('auto-runs on open only for the general focus', () => {
    // The single auto-run call site sits behind an explicit general check.
    expect(source).toMatch(/if \(initialMode === 'general'\) \{\s*void runAnalysis\(/);
  });

  it('defaults to general so existing callers keep their behaviour', () => {
    expect(source).toContain("initialMode = 'general'");
  });

  it('sends the keyword instruction only for the keywords focus', () => {
    expect(source).toMatch(/mode === 'keywords' \? \{ instruction: KEYWORD_INSTRUCTION \}/);
  });
});
