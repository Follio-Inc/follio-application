import type { TestSuite } from './types';

/**
 * Named suites map product areas → Vitest globs.
 * Keep this in sync when adding feature tests.
 * Safe for client import (no Node APIs).
 */
export const TEST_SUITES: TestSuite[] = [
  {
    id: 'cover-letter',
    label: 'Cover letter',
    description: 'Visibility, design, and document-design coverage for cover letters.',
    patterns: ['__tests__/cover-letter-*.test.ts', '__tests__/document-download-share.test.ts'],
  },
  {
    id: 'documents',
    label: 'Documents dashboard',
    description: 'Shared document dashboard, share foundation, and download helpers.',
    patterns: [
      '__tests__/document-dashboard-foundation.test.ts',
      '__tests__/document-download-share.test.ts',
      '__tests__/share-foundation.test.ts',
    ],
  },
  {
    id: 'resume',
    label: 'Resume / builder',
    description: 'Public resume, pane layout, titles, and page layout.',
    patterns: [
      '__tests__/public-resume.test.ts',
      '__tests__/builder-pane-layout.test.ts',
      '__tests__/resume-title.test.ts',
      '__tests__/resume-page-layout.test.ts',
      '__tests__/url.test.ts',
    ],
  },
  {
    id: 'quality',
    label: 'Quality gates',
    description: 'Fast shared utilities, middleware, validations, and errors.',
    patterns: [
      '__tests__/utils.test.ts',
      '__tests__/validations.test.ts',
      '__tests__/errors.test.ts',
      '__tests__/middleware.test.ts',
      '__tests__/url.test.ts',
      '__tests__/features.test.ts',
    ],
  },
  {
    id: 'all',
    label: 'All unit tests',
    description: 'Full Vitest run (`npm run test:run`). Slower — use before a big merge.',
    patterns: ['__tests__/**/*.test.ts'],
  },
];

export function getTestSuite(id: string): TestSuite | undefined {
  return TEST_SUITES.find((suite) => suite.id === id);
}
