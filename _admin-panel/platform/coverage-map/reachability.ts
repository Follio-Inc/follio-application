import type { ReachabilityRecord } from './types';

/**
 * Verified reachability findings (PLATFORM_TODO item 3).
 *
 * Four services and one library sit in three different states despite
 * near-identical names. The point of recording them is that `services/` contains
 * both `resume-parser.service.ts` (live, called from a route) and
 * `lib/resume-parser/` (dead), and a scan that conflates the two would report a
 * false orphan — or worse, quarantine the live one.
 *
 * `importedBy` is re-derived from the repository by
 * `__tests__/platform-coverage-map.test.ts`, so these are not assertions taken
 * on trust: rewiring any of these modules fails the suite.
 */
export const REACHABILITY: ReachabilityRecord[] = [
  {
    path: 'services/import/resume-openresume.service.ts',
    reachability: 'orphan',
    importedBy: [],
    entryChain: [],
    evidence:
      'Nothing imports it, in any form. It is the sole consumer of lib/resume-parser, so it is the link whose absence makes that whole library dead. PLATFORM_TODO item 23 makes the resume lab its first consumer — treat it as an untested baseline until then.',
  },
  {
    path: 'services/resume-parser-ai.service.ts',
    reachability: 'orphan',
    importedBy: [],
    entryChain: [],
    evidence:
      'Nothing imports it, in any form. It consumes services/resume-parser.service.ts via a dynamic import at line 375, which makes it a consumer of live code but does not make it reachable itself.',
  },
  {
    path: 'lib/resume-parser',
    reachability: 'orphan',
    importedBy: ['services/import/resume-openresume.service.ts'],
    entryChain: [],
    evidence:
      'Transitively dead, not unimported: its one importer is services/import/resume-openresume.service.ts:11 (parseResumeFromPdfBuffer), and that service is itself an orphan, so no shipped entry point reaches this library. Distinct from services/resume-parser.service.ts, which is live — the names differ by one path segment and conflating them produces a false orphan report. The product resume import path does not use this parser; it uses services/import/resume-ai.service.ts.',
    tests: {
      files: [
        '__tests__/extract-education.test.ts',
        '__tests__/extract-profile.test.ts',
        '__tests__/extract-project.test.ts',
        '__tests__/extract-skills.test.ts',
        '__tests__/extract-work-experience.test.ts',
        '__tests__/feature-scoring-system.test.ts',
        '__tests__/group-lines-into-sections.test.ts',
        '__tests__/resume-parser-helpers.test.ts',
      ],
      count: 137,
    },
  },
  {
    path: 'services/import/resume.service.ts',
    reachability: 'module-reachable-call-unused',
    importedBy: ['services/import/index.ts'],
    entryChain: [
      'app/api/import/links/route.ts',
      'services/import/index.ts',
      'services/import/resume.service.ts',
    ],
    evidence:
      'Re-exported by services/import/index.ts:12, and that barrel is imported by app/api/import/links/route.ts:2 for a different symbol (linksImportService). The module is therefore evaluated on every /api/import/links request while none of its own exports are called. NOT an orphan — do not label it one, and do not quarantine it on the strength of having no callers.',
  },
  {
    path: 'services/resume-parser.service.ts',
    reachability: 'live',
    importedBy: [
      'app/api/import/linkedin/route.ts',
      'services/import/resume.service.ts',
      'services/resume-parser-ai.service.ts',
    ],
    entryChain: ['app/api/import/linkedin/route.ts', 'services/resume-parser.service.ts'],
    evidence:
      'Called from a shipped route: app/api/import/linkedin/route.ts:12 imports extractTextFromPDF and parseResumeText. Its other two importers are not shipped-reachable, so the LinkedIn route is what keeps it live. A different file from lib/resume-parser/.',
  },
];

export function getReachability(path: string): ReachabilityRecord | undefined {
  return REACHABILITY.find((record) => record.path === path);
}

/** Paths in one reachability class, for reports that group by state. */
export function listByReachability(
  reachability: ReachabilityRecord['reachability']
): ReachabilityRecord[] {
  return REACHABILITY.filter((record) => record.reachability === reachability);
}
