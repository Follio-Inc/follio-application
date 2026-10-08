import type { PlatformFeature } from './types';

/**
 * The coverage map.
 *
 * Seeded with five features to prove the shape (PLATFORM_TODO item 1). The full
 * owner-facing inventory lands in item 2, and reachability classification in
 * item 3 — do not add either here.
 *
 * Rules for entries:
 * - `codeLocations` and `unitTests` are repo-relative and must exist on disk.
 *   `__tests__/platform-coverage-map.test.ts` enforces this.
 * - `pathways` must resolve to a real `LIVE_QA_PATHWAYS` id.
 * - `userDescription` describes what a person does, not how the code works.
 * - Record a known gap in `notes` rather than leaving it implied.
 */
export const COVERAGE_MAP: PlatformFeature[] = [
  {
    id: 'resume-import-ai',
    name: 'AI resume import',
    userDescription:
      'Uploads a resume PDF and gets a filled-in Follio profile back, instead of typing everything by hand.',
    codeLocations: [
      'app/api/import/resume/route.ts',
      'app/api/resumes/[resumeId]/import-resume/route.ts',
      'app/onboarding/import/page.tsx',
      'services/import/resume-ai.service.ts',
      'services/agents/resume-parse',
      'lib/agents',
    ],
    category: 'Resume import',
    status: 'shipped',
    lab: 'resume-import-ai',
    unitTests: [
      // Covers the agent definition plus the Follio-voice rewrite step.
      '__tests__/agents/follio-voice.test.ts',
      // Covers the admin resume reader that wraps this service (service mocked).
      '__tests__/devtools-resume-reader.test.ts',
    ],
    pathways: ['onboarding.upload'],
    notes:
      'Thinnest coverage of any shipped resume feature. No test references extractTextFromPDF, parseResumeTextWithAI, normalizeAIData or saveAIResumeToProfile; only importResumeWithAI appears in a test, and there it is mocked. The route does not compose the three stages itself — it calls extractTextFromPDF then delegates to runResumeParseAgent, which adds a fourth stage (rewriteNormalizedResumeForFollio) and writes an AgentRun. See PLATFORM_TODO item 21.',
  },
  {
    id: 'resume-builder',
    name: 'Resume builder',
    userDescription:
      'Edits every part of a resume — basics, experience, education, skills, projects, links, photos — and watches a live preview update.',
    codeLocations: [
      'app/(dashboard)/builder',
      'app/(dashboard)/builder/components/all-sections-editor.tsx',
      'app/api/profile',
      'lib/total-experience.ts',
      'lib/skills',
    ],
    category: 'Builder',
    status: 'shipped',
    unitTests: [
      '__tests__/builder-pane-layout.test.ts',
      '__tests__/entry-edit-guard.test.ts',
      '__tests__/bullet-mode.test.ts',
      '__tests__/contact-entries.test.ts',
      '__tests__/resume-contact.test.ts',
      '__tests__/resume-header-layout.test.ts',
      '__tests__/total-experience.test.ts',
      '__tests__/skill-groups.test.ts',
    ],
    pathways: ['builder.designer-templates'],
    notes:
      'Every section renders inline on /builder via all-sections-editor; there is no per-section route. Autosave has no unit coverage — entry-edit-guard covers change detection only.',
  },
  {
    id: 'resume-share-visibility',
    name: 'Resume sharing and visibility',
    userDescription:
      'Chooses who can see a resume — private, a secret link, or a public URL — and shares that link.',
    codeLocations: [
      'app/(dashboard)/share',
      'components/share-dialog.tsx',
      'lib/visibility.ts',
      'lib/public-resume.ts',
      'lib/share-token.ts',
      'app/api/profile/share-token/route.ts',
      'app/api/profile/unlisted-key/route.ts',
      'app/r/[key]/page.tsx',
    ],
    category: 'Sharing',
    status: 'shipped',
    unitTests: [
      '__tests__/visibility.test.ts',
      '__tests__/public-resume.test.ts',
      '__tests__/shareable-resume-link.test.ts',
      '__tests__/share-foundation.test.ts',
    ],
    pathways: ['share.visibility-cycle'],
    notes:
      'lib/share-token.ts has no test of its own, so expiry and exhaustion of a share token are uncovered.',
  },
  {
    id: 'cover-letter',
    name: 'Cover letter builder',
    userDescription:
      'Writes and designs a cover letter, downloads it as a PDF, and shares it by secret link.',
    codeLocations: [
      'app/(dashboard)/cover-letter-builder',
      'app/api/cover-letters',
      'app/cl/[key]/page.tsx',
      'services/cover-letter.service.ts',
      'services/cover-letter-export.service.ts',
    ],
    category: 'Cover letter',
    status: 'shipped',
    unitTests: [
      '__tests__/cover-letter-visibility.test.ts',
      '__tests__/cover-letter-document-design.test.ts',
    ],
    pathways: ['cover-letter.builder-smoke'],
  },
  {
    id: 'public-follio',
    name: 'Public Follio page',
    userDescription:
      'Shares one link that shows who they are, with doors through to their resume, work, links and highlights.',
    codeLocations: [
      'app/u/[handle]',
      'components/public-profile-chrome.tsx',
      'lib/follio-identity',
      'lib/features.ts',
    ],
    category: 'Public surfaces',
    status: 'shipped',
    unitTests: [
      '__tests__/public-profile-chrome.test.ts',
      '__tests__/follio-peek.test.ts',
      '__tests__/resolve-user.test.ts',
      '__tests__/resume-highlights.test.ts',
    ],
    pathways: ['links.public-page'],
    notes:
      'Status is shipped, but the /work door alone is gated by NEXT_PUBLIC_PORTFOLIO_ENABLED. `flag` is left unset deliberately — setting it would imply the whole page is off.',
  },
];

export function getFeature(id: string): PlatformFeature | undefined {
  return COVERAGE_MAP.find((feature) => feature.id === id);
}

export function listFeatures(ids?: string[]): PlatformFeature[] {
  if (!ids?.length) return [...COVERAGE_MAP];
  const wanted = new Set(ids);
  return COVERAGE_MAP.filter((feature) => wanted.has(feature.id));
}
