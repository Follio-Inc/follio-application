import type { ExcludedPath, PlatformFeature } from './types';

/**
 * The coverage map — the owner-facing Follio inventory (PLATFORM_TODO item 2).
 *
 * Reachability classification is item 3 and deliberately absent here. In
 * particular the `lib/resume-parser/` tests are **not** attached to any feature:
 * they cover a parser reachable only through an orphaned service, and listing
 * them under AI resume import would assert coverage that does not exist.
 *
 * Rules for entries:
 * - `codeLocations` and `unitTests` are repo-relative and must exist on disk.
 *   `__tests__/platform-coverage-map.test.ts` enforces this.
 * - A directory in `codeLocations` claims everything beneath it.
 * - Overlapping claims are allowed and expected: `/onboarding/import` is both an
 *   onboarding step and the resume-import entry point. Ownership is not exclusive.
 * - `pathways` must resolve to a real `LIVE_QA_PATHWAYS` id.
 * - `userDescription` describes what a person does, not how the code works.
 * - Record a known gap in `notes` rather than leaving it implied.
 * - `lab` names an *intended* lab. No labs exist before item 20, so only the
 *   feature whose lab is already planned carries one.
 *
 * Why some tests stay `uncategorized` (item 5a). These are not gaps to close by
 * inventing ownership — they belong to no owner-facing feature:
 * - The Developer Platform's own tests: `devtools-overlay`, `live-qa-catalog`,
 *   `platform-coverage-map`, `platform-scan`, `platform-scan-tests`,
 *   `platform-scan-pathways`, `platform-scan-source-facts`. They cover
 *   `_admin-panel/`, which is operator tooling, not product.
 * - Shared infrastructure no single feature owns: `errors`, `html-utils`,
 *   `logger`, `prisma-connection`, `url`, `utils`, `validations`. Attributing
 *   `lib/utils.ts` to one feature would be a fiction every other feature pays
 *   for the next time the drift scan runs.
 *
 * Separately, `__tests__/agents/runtime.test.ts` stays `unlisted`: it tests the
 * shared `lib/agents` runtime and reaches `portfolio` only because it uses
 * portfolio agents as fixtures. Listing it under portfolio would claim coverage
 * the test does not provide.
 *
 * Rules for `aiStages` and `prismaModels` (item 7). Both are *declarations*,
 * checked against what the repository actually does:
 * - `aiStages` names the `MAX_TOKENS` keys a feature's own code passes. All
 *   eleven budgeted keys but `agentTurn` are declared; `agentTurn` belongs to
 *   the shared `lib/agents` runtime, which no feature claims for the same
 *   reason `codeLocations` leaves it out. An AI feature with no key is normal —
 *   `jd-match` imports no AI client at all.
 * - `prismaModels` names only the models a feature's code queries **and no
 *   other feature's does**. That is eight of thirty-one. The shared tables are
 *   deliberately declared nowhere: `Profile` is queried from seventeen
 *   features' code and `User` from fourteen, so listing them everywhere would
 *   record ownership nobody has — the same judgement item 5a made about
 *   `uncategorized` tests over shared utilities. The scan still reports every
 *   model, and still names the one with no feature owner at all (`Admin`,
 *   queried only from the excluded admin surfaces).
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
      // `lib/agents` is deliberately NOT claimed: the resume-parse agent runs on
      // that runtime, but so do the portfolio and snap-view agents. A feature
      // owns what implements it, not the shared machinery it runs on.
    ],
    category: 'Resume import',
    status: 'shipped',
    lab: 'resume-import-ai',
    // Both call sites are in this feature's own code: resumeParse in
    // services/import/resume-ai.service.ts, follioVoice in the agent's rewrite
    // step. `data-sources` also reaches resumeParse, but only because it claims
    // the whole `services/import` directory — the import pipeline is this
    // feature's, so the stage is declared here and not there.
    aiStages: ['follioVoice', 'resumeParse'],
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
      'app/api/photos',
      'lib/total-experience.ts',
      'lib/skills',
      // Section-editing implementation the builder is actually built from.
      'lib/document-builder',
      'lib/rich-text/bullet-mode.ts',
      'lib/resume/header-layout.ts',
      'lib/contact',
      'lib/hooks/use-contact-manager.ts',
    ],
    category: 'Builder',
    status: 'shipped',
    unitTests: [
      '__tests__/builder-pane-layout.test.ts',
      '__tests__/entry-edit-guard.test.ts',
      '__tests__/bullet-mode.test.ts',
      '__tests__/contact-entries.test.ts',
      '__tests__/contact-source-label.test.ts',
      '__tests__/resume-header-layout.test.ts',
      '__tests__/total-experience.test.ts',
      '__tests__/skill-groups.test.ts',
      // Both cover lib/hooks/use-contact-manager, the builder's contact editor —
      // not the resume parser, where their names suggest they belong.
      '__tests__/remove-email-from-list.test.ts',
      '__tests__/remove-phone-from-list.test.ts',
    ],
    pathways: [],
    notes:
      'Every section renders inline on /builder via all-sections-editor; there is no per-section route, and /builder/[section] is a redirect stub. Autosave has no unit coverage — entry-edit-guard covers change detection only. No Live QA pathway covers section editing; builder.designer-templates belongs to designer-templates.',
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
      'lib/share',
      'lib/shareable-resume-link.ts',
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
      'app/cover-letter-preview/[id]',
      'lib/cover-letter',
      'components/document-dashboard',
      'services/cover-letter.service.ts',
      'services/cover-letter-export.service.ts',
    ],
    category: 'Cover letter',
    status: 'shipped',
    prismaModels: ['CoverLetter'],
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
      'app/[username]',
      'app/me',
      'components/public-profile-chrome.tsx',
      'lib/public-profile-chrome.ts',
      'lib/follio-identity',
      'lib/resume/highlights.ts',
      'lib/resume/presentation.ts',
      'lib/resume/contact.ts',
      'lib/features.ts',
    ],
    category: 'Public surfaces',
    status: 'shipped',
    unitTests: [
      '__tests__/public-profile-chrome.test.ts',
      '__tests__/follio-peek.test.ts',
      '__tests__/resume-highlights.test.ts',
      '__tests__/follio-identity.test.ts',
      '__tests__/follio-voice.test.ts',
      '__tests__/resume-presentation.test.ts',
      '__tests__/resume-contact.test.ts',
    ],
    pathways: ['links.public-page'],
    notes:
      'Status is shipped, but the /work door alone is gated by NEXT_PUBLIC_PORTFOLIO_ENABLED. `flag` is left unset deliberately — setting it would imply the whole page is off. Also owns the vanity /[username] and /me entry points.',
  },

  // ── Entry and account ───────────────────────────────────────────────────
  {
    id: 'marketing-site',
    name: 'Marketing and legal pages',
    userDescription:
      'Lands on follio.me, learns what Follio is, and finds the contact, privacy and terms pages.',
    codeLocations: [
      'app/page.tsx',
      'components/landing-page.tsx',
      'app/contact',
      'app/privacy',
      'app/terms',
    ],
    category: 'Public surfaces',
    status: 'shipped',
    unitTests: ['__tests__/landing-page-oauth-visibility.test.ts'],
    pathways: ['public.landing'],
  },
  {
    id: 'auth-access',
    name: 'Sign-in, sign-up and the workspace gate',
    userDescription:
      'Creates an account or signs in — by email or an OAuth provider — and gets sent back to wherever they were heading.',
    codeLocations: [
      'app/sign-in',
      'app/sign-up',
      'middleware.ts',
      'lib/active-profile.ts',
      'lib/clerk-env.ts',
    ],
    category: 'Account',
    status: 'shipped',
    unitTests: [
      '__tests__/middleware.test.ts',
      '__tests__/clerk-env.test.ts',
      '__tests__/active-profile.test.ts',
      '__tests__/onboarding-hard-gate.test.ts',
    ],
    pathways: ['auth.dashboard-gate'],
    notes:
      'Clerk-hosted. Live QA never drives the sign-in UI; it replays a captured storage state. onboarding-hard-gate moved here in item 5a: despite its name it asserts on the redirect machinery (lib/active-profile.ts, components/client-redirect.tsx, the dashboard shell), which is the access layer — it reads no app/onboarding file at all.',
  },
  {
    id: 'settings-account',
    name: 'Settings and account',
    userDescription:
      'Changes their handle, privacy and appearance preferences, manages AI assistants, or deletes their account.',
    codeLocations: [
      'app/(dashboard)/settings',
      'app/api/account',
      'app/api/profile/check-handle',
      'app/api/profile/dismiss-banner',
      'lib/account',
    ],
    category: 'Account',
    status: 'shipped',
    // Only this feature queries AgentRun, through account deletion.
    prismaModels: ['AgentRun'],
    unitTests: [
      '__tests__/delete-account.test.ts',
      '__tests__/clear-account-client-state.test.ts',
      '__tests__/connect-external-account.test.ts',
      '__tests__/resolve-user.test.ts',
    ],
    pathways: [],
  },

  // ── Getting started ─────────────────────────────────────────────────────
  {
    id: 'onboarding',
    name: 'Onboarding',
    userDescription:
      'Picks why they are here, chooses to upload a resume or start blank, and comes out with a first resume in the builder.',
    codeLocations: [
      'app/onboarding',
      'app/api/onboarding',
      'lib/onboarding',
      'lib/onboarding-ui.ts',
      'components/onboarding',
    ],
    category: 'Onboarding',
    status: 'shipped',
    unitTests: [
      '__tests__/onboarding-no-review.test.ts',
      '__tests__/onboarding-resume-start-choice.test.ts',
      '__tests__/onboarding-skip-next.test.ts',
      '__tests__/onboarding-summary-overwrite.test.ts',
      '__tests__/onboarding-ui.test.ts',
      '__tests__/onboarding-resume-construction.test.ts',
      '__tests__/project-import-prefill.test.ts',
      '__tests__/review-import.test.ts',
      '__tests__/lab-import-constellation.test.ts',
    ],
    pathways: ['onboarding.blank'],
    notes:
      'Five of these tests assert on Follio source text via readFileSync rather than on behavior, so they catch deletions but not behavioral regressions. /onboarding/review is a redirect stub to /onboarding/build.',
  },

  // ── Resume lifecycle ────────────────────────────────────────────────────
  {
    id: 'resume-management',
    name: 'Resume library',
    userDescription:
      'Keeps several resumes side by side — creates, clones, renames and deletes them, and picks which one is their main public resume.',
    codeLocations: [
      'app/(dashboard)/resumes',
      'app/(dashboard)/dashboard/page.tsx',
      'app/(dashboard)/dashboard/dashboard-client.tsx',
      'app/(dashboard)/dashboard/dashboard-resumes-section.tsx',
      'components/document-dashboard',
      'app/api/resumes',
      'lib/resume-title.ts',
      'lib/resume/new-resume-defaults.ts',
    ],
    category: 'Resumes',
    status: 'shipped',
    unitTests: [
      '__tests__/resume-title.test.ts',
      '__tests__/new-resume-defaults.test.ts',
      '__tests__/sort-resumes-public-first.test.ts',
      '__tests__/dashboard-follio-card.test.ts',
      '__tests__/document-dashboard-foundation.test.ts',
    ],
    pathways: ['multi-resume.create-blank'],
    notes:
      'Clone, rename, delete and set-primary are covered only at the title-helper level; the operations themselves and their API routes have no test.',
  },
  {
    id: 'designer-templates',
    name: 'Designer and templates',
    userDescription:
      'Switches resume templates, fonts, colours and page layout, and zooms in to check how the page will print.',
    codeLocations: [
      'app/(dashboard)/builder/components/designer-panel.tsx',
      'app/(dashboard)/builder/components/resume-design-panel.tsx',
      'app/(dashboard)/builder/components/resume-template-gallery.tsx',
      'app/(dashboard)/builder/components/resume-zoom-modal.tsx',
      'app/api/profile/resume-design',
      'lib/resume/templates',
      'lib/resume-design.ts',
      'lib/resume/atelier.ts',
      'lib/resume/page-layout.ts',
      'app/preview/[templateId]',
    ],
    category: 'Builder',
    status: 'shipped',
    unitTests: [
      '__tests__/resume-templates.test.ts',
      '__tests__/resume-fonts.test.ts',
      '__tests__/resume-page-layout.test.ts',
      '__tests__/resume-zoom-modal.test.ts',
      '__tests__/resume-atelier.test.ts',
      '__tests__/resume-template-preview-profile.test.ts',
    ],
    pathways: ['builder.designer-templates'],
    notes:
      'Pathway moved here from resume-builder in item 2 — it exercises the Designer panel, not section editing. Item 5a moved template-switch and minimal-studio-utils to portfolio: the import graph showed both test lib/portfolio template code, not resume templates.',
  },
  {
    id: 'download-export',
    name: 'Download and export',
    userDescription:
      'Downloads their resume as a PDF, or pulls their profile out as JSON or plain text.',
    codeLocations: [
      'app/(dashboard)/builder/components/download-dialog.tsx',
      'app/api/export',
      'lib/document-download',
      'lib/document-pdf',
      'lib/hooks/use-resume-download.ts',
      'services/export.service.ts',
      'services/document-pdf.service.ts',
      'app/resume-preview/[id]',
      'pdf-worker',
    ],
    category: 'Export',
    status: 'shipped',
    prismaModels: ['DocumentPdfCache'],
    unitTests: [
      '__tests__/export-service.test.ts',
      '__tests__/document-download-share.test.ts',
      '__tests__/document-pdf-render.test.ts',
      '__tests__/use-resume-download.test.ts',
    ],
    pathways: [],
    notes:
      'document-pdf-render stubs fetch, so the worker contract is covered but no test ever produces real PDF bytes.',
  },

  // ── Bringing data in ────────────────────────────────────────────────────
  {
    id: 'data-sources',
    name: 'Data sources',
    userDescription:
      'Connects GitHub, LinkedIn, Medium, YouTube, Google or plain links, and pulls that work into their profile.',
    codeLocations: [
      'app/(dashboard)/builder/data-sources',
      'app/(dashboard)/data-sources',
      'app/api/data-sources',
      'app/api/import/github',
      'app/api/import/google',
      'app/api/import/linkedin',
      'app/api/import/links',
      'app/api/import/medium',
      'app/api/import/youtube',
      'services/import',
      'services/github.service.ts',
      'services/github-enhanced.service.ts',
      'lib/import/profile-url.ts',
    ],
    category: 'Data sources',
    status: 'shipped',
    unitTests: [
      '__tests__/github-service.test.ts',
      '__tests__/linkedin-profile-url.test.ts',
      '__tests__/profile-url.test.ts',
    ],
    pathways: [],
    notes:
      'Connect flows cross third-party OAuth consent screens and stay manual — automating them needs real test apps per provider. No Live QA pathway covers this area.',
  },
  {
    id: 'import-sync',
    name: 'Import sync and merge',
    userDescription:
      'Re-pulls from a connected source, previews what would change, and applies only the parts they want.',
    codeLocations: [
      'app/(dashboard)/builder/import-sync',
      'app/api/import/jobs',
      'app/api/import/sessions',
      'app/api/import/sync-apply',
      'app/api/import/sync-preview',
      'app/api/import/sync-status',
      'services/merge.service.ts',
      'services/multi-source-merger.service.ts',
      'services/import-session.service.ts',
    ],
    category: 'Data sources',
    status: 'shipped',
    prismaModels: ['ImportSession'],
    unitTests: ['__tests__/merge.service.test.ts', '__tests__/multi-source-merger.test.ts'],
    pathways: [],
  },

  // ── AI features ─────────────────────────────────────────────────────────
  {
    id: 'follio-voice',
    name: 'Follio voice',
    userDescription:
      'Has their imported resume copy rewritten into a Follio headline and about section that sound like a person, not a CV.',
    codeLocations: ['services/agents/resume-parse/rewrite-for-follio.ts'],
    category: 'AI',
    status: 'shipped',
    aiStages: ['follioVoice'],
    unitTests: ['__tests__/agents/follio-voice.test.ts'],
    pathways: [],
    notes:
      'No route or page of its own — it runs as a step inside the resume-parse agent, so it ships only via resume-import-ai. Its MAX_TOKENS key is in aiStages, where the drift scan can check it.',
  },
  {
    id: 'snap-view',
    name: 'Snap view',
    userDescription: 'Gets an at-a-glance generated summary card of their profile.',
    codeLocations: [
      'app/api/profile/[handle]/snap-view',
      'services/snap-view.service.ts',
      'services/agents/snap-view',
      'types/snap-view.ts',
    ],
    category: 'AI',
    status: 'shipped',
    aiStages: ['snapViewGeneration'],
    unitTests: ['__tests__/agents/snap-view-agent.test.ts'],
    pathways: [],
  },
  {
    id: 'brand-insight',
    name: 'Brand insight and logos',
    userDescription:
      'Sees the companies and schools on their profile recognised, with the right logo and a short read on each.',
    codeLocations: [
      'app/api/brand/insight',
      'app/api/brand/logo',
      'lib/brand-insight',
      'lib/brand-logo',
    ],
    category: 'AI',
    status: 'shipped',
    unitTests: ['__tests__/follio-insight.test.ts', '__tests__/brand-logo.test.ts'],
    pathways: [],
  },
  {
    id: 'jd-match',
    name: 'JD match / resume lens',
    userDescription:
      'Pastes a job description and sees which parts of their resume line up with it, highlighted in place.',
    codeLocations: [
      'lib/jd-match',
      'lib/resume-lens',
      'components/resume-lens',
      'app/api/extension/match-jd',
    ],
    category: 'AI',
    status: 'shipped',
    unitTests: ['__tests__/jd-match.test.ts', '__tests__/resume-lens.test.ts'],
    pathways: [],
    notes:
      'Shipped on two paths: the resume lens on the public resume page (app/u/[handle]/resume-shell.tsx) and the extension match-jd endpoint. `aiStages` is deliberately unset: it has no MAX_TOKENS key because it imports no AI client at all — the matching is lexical. A drift signal keyed on MAX_TOKENS alone would miss this feature entirely, which is why the scan reports it under "AI-category features that call no AI client" rather than as a gap.',
  },

  // ── Integrations ────────────────────────────────────────────────────────
  {
    id: 'ai-connector-mcp',
    name: 'AI connector and MCP',
    userDescription:
      'Connects an AI assistant to their Follio so it can read their profile and propose edits they approve.',
    codeLocations: [
      'app/api/ai-connector',
      'app/api/mcp',
      'app/api/oauth',
      'app/oauth/authorize',
      'lib/ai-connector',
      'lib/mcp',
      'services/ai-connector.service.ts',
      'services/ai-connector-oauth.service.ts',
    ],
    category: 'Integrations',
    status: 'shipped',
    // The four connector tables are queried nowhere else.
    prismaModels: ['AiConnectorAuthCode', 'AiConnectorClient', 'AiConnectorToken', 'AiEditDraft'],
    unitTests: ['__tests__/ai-connector.test.ts'],
    pathways: [],
  },
  {
    id: 'chrome-extension',
    name: 'Chrome extension',
    userDescription:
      'Uses the Follio browser extension to pull up their resumes and match them against a job posting while browsing.',
    codeLocations: ['_extensions/chrome', 'app/api/extension'],
    category: 'Integrations',
    status: 'shipped',
    unitTests: [],
    pathways: [],
    notes:
      'No unit tests of its own. Its match-jd endpoint is covered indirectly by jd-match; the extension client code is untested.',
  },

  // ── Flagged off ─────────────────────────────────────────────────────────
  {
    id: 'portfolio',
    name: 'Portfolio',
    userDescription:
      'Generates a full portfolio site from their profile and publishes it — unavailable unless the flag is on.',
    codeLocations: [
      'app/api/portfolio',
      'app/(dashboard)/dashboard/portfolio/edit',
      'services/portfolio',
      'services/agents/portfolio',
      'lib/portfolio',
      'lib/portfolio-appearance.ts',
      'lib/features.ts',
    ],
    category: 'Portfolio',
    status: 'flagged',
    flag: 'NEXT_PUBLIC_PORTFOLIO_ENABLED',
    // Seven of the eleven budgeted stages: the six pipeline stages plus the
    // content transform. `agentTurn` is not here — it belongs to the shared
    // lib/agents runtime, which no feature claims, for the same reason
    // `codeLocations` leaves it out.
    aiStages: [
      'contentTransform',
      'designBrief',
      'evidenceExtraction',
      'narrativeGeneration',
      'portfolioStrategy',
      'profileUnderstanding',
      'validation',
    ],
    unitTests: [
      '__tests__/portfolio-appearance.test.ts',
      '__tests__/portfolio-content.test.ts',
      '__tests__/portfolio-overrides.test.ts',
      '__tests__/portfolio-resolve-copy.test.ts',
      '__tests__/portfolio-rich-html.test.ts',
      '__tests__/features.test.ts',
      '__tests__/template-switch.test.ts',
      '__tests__/minimal-studio-utils.test.ts',
      '__tests__/agents/narrative-prompt.test.ts',
      '__tests__/agents/section-write.test.ts',
    ],
    pathways: [],
    notes:
      'Off unless NEXT_PUBLIC_PORTFOLIO_ENABLED=true. Six-stage pipeline at services/portfolio/pipeline/stage-a..f. The only feature flag in lib/features.ts. template-switch and minimal-studio-utils moved here in item 5a — both test lib/portfolio template code. __tests__/agents/runtime.test.ts is deliberately NOT listed: it tests the shared lib/agents runtime and only reaches portfolio because it uses portfolio agents as fixtures.',
  },
];

/**
 * Routes and pages deliberately outside the product inventory.
 *
 * A directory excludes everything beneath it. Every `app/**` page and
 * `app/api/**` route must be either claimed by a feature above or listed here —
 * `__tests__/platform-coverage-map.test.ts` fails otherwise, so a new route
 * cannot land unnoticed.
 */
export const EXCLUDED: ExcludedPath[] = [
  {
    path: 'app/admin',
    reason:
      'Operator tooling: the admin shell plus the Developer Platform page shim. Not product, and gated by requireAdmin.',
  },
  {
    path: 'app/api/admin',
    reason:
      'Admin-only API shims for the operator panel (health, status, catalog, test, live-qa, resume reader, users, stats). Not product.',
  },
  {
    path: 'app/lab',
    reason:
      'Scratch experiment surface (import-constellation). Not linked from product navigation.',
  },
  {
    path: 'app/portfolio-preview',
    reason:
      'Preview harness for portfolio templates, used while building them. Not a user-reachable product surface.',
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
