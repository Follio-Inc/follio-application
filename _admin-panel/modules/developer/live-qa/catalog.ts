import type { LiveQaPathway } from './types';

/**
 * Versioned journey catalog for Live QA.
 *
 * Keep intents product-language ("open Share, set Public"), not CSS.
 * When Follio UI copy/layout changes, update the matching Playwright
 * pathway under `pathways/` — the catalog stays the durable map.
 */
export const LIVE_QA_PATHWAYS: LiveQaPathway[] = [
  {
    id: 'public.landing',
    title: 'Marketing landing loads',
    description: 'Anonymous visitor can open `/` and see a clear sign-up / product CTA.',
    area: 'Public',
    spec: 'pathways/public-landing.spec.ts',
    requiresAuth: false,
    fixtureKind: 'none',
    stability: 'stable',
    intents: [
      'Open `/`',
      'Assert page is not an error shell',
      'Assert a primary CTA toward sign-up or product is visible',
    ],
    tags: ['smoke', 'public'],
  },
  {
    id: 'auth.dashboard-gate',
    title: 'Dashboard requires sign-in',
    description: 'Unauthenticated `/dashboard` redirects into Clerk sign-in with redirect_url.',
    area: 'Auth',
    spec: 'pathways/auth-dashboard-gate.spec.ts',
    requiresAuth: false,
    fixtureKind: 'none',
    stability: 'stable',
    intents: [
      'Open `/dashboard` without a session',
      'Land on sign-in (or Clerk hosted)',
      'Preserve intent to return to dashboard',
    ],
    tags: ['smoke', 'auth'],
  },
  {
    id: 'onboarding.upload',
    title: 'Upload resume → template → builder',
    description:
      'Signed-in user uploads a PDF from the fixture pool, picks a template, and lands in the builder with extracted content.',
    area: 'Onboarding',
    spec: 'pathways/onboarding-upload.spec.ts',
    requiresAuth: true,
    fixtureKind: 'resume-pdf',
    stability: 'experimental',
    intents: [
      'Open `/resumes`',
      'New resume → Upload resume',
      'Upload selected PDF fixture',
      'Wait for parse to finish',
      'Apply a resume template',
      'Land on `/builder` with content present',
    ],
    tags: ['critical', 'onboarding', 'upload'],
  },
  {
    id: 'onboarding.blank',
    title: 'Blank path → guided steps → builder',
    description:
      'Signed-in user starts blank, completes guided profile steps with a persona fixture, and reaches the builder.',
    area: 'Onboarding',
    spec: 'pathways/onboarding-blank.spec.ts',
    requiresAuth: true,
    fixtureKind: 'blank-persona',
    stability: 'experimental',
    intents: [
      'Open `/resumes`',
      'New resume → Start blank',
      'Choose a template → Create resume',
      'Optionally fill guided steps with persona data',
      'Land on `/builder`',
    ],
    tags: ['critical', 'onboarding', 'blank'],
  },
  {
    id: 'builder.designer-templates',
    title: 'Designer: switch templates',
    description:
      'In the builder, open Designer and cycle through resume templates without crashing preview.',
    area: 'Designer',
    spec: 'pathways/builder-designer.spec.ts',
    requiresAuth: true,
    fixtureKind: 'none',
    stability: 'experimental',
    intents: [
      'Open `/builder` with an existing resume',
      'Open Designer / template controls',
      'Select at least two templates (e. for classic → lumen)',
      'Assert preview still renders',
    ],
    tags: ['builder', 'designer'],
  },
  {
    id: 'share.visibility-cycle',
    title: 'Share: Private → Public → Unlisted',
    description: 'Cycle resume visibility and verify the matching public URL behavior.',
    area: 'Share',
    spec: 'pathways/share-visibility.spec.ts',
    requiresAuth: true,
    fixtureKind: 'none',
    stability: 'experimental',
    intents: [
      'Open Share from builder or resumes',
      'Set Public — assert vanity / handle URL works',
      'Set Unlisted — assert `/r/[key]` works',
      'Set Private — assert public URL is blocked or unavailable',
    ],
    tags: ['critical', 'share', 'visibility'],
  },
  {
    id: 'multi-resume.create-blank',
    title: 'Create another blank resume',
    description: 'From resumes/dashboard, create a new blank resume and open it in the builder.',
    area: 'Multi-resume',
    spec: 'pathways/multi-resume-blank.spec.ts',
    requiresAuth: true,
    fixtureKind: 'none',
    stability: 'experimental',
    intents: [
      'Open `/resumes` or dashboard create flow',
      'Choose Start blank',
      'New resume appears and opens in `/builder`',
    ],
    tags: ['multi-resume'],
  },
  {
    id: 'cover-letter.builder-smoke',
    title: 'Cover letter builder opens',
    description:
      'Signed-in user can open the cover letter builder and see editor + preview chrome.',
    area: 'Cover letter',
    spec: 'pathways/cover-letter-smoke.spec.ts',
    requiresAuth: true,
    fixtureKind: 'none',
    stability: 'experimental',
    intents: ['Open `/cover-letter-builder`', 'Assert editor / designer / preview regions exist'],
    tags: ['cover-letter', 'smoke'],
  },
  {
    id: 'links.public-page',
    title: 'Links page route resolves',
    description:
      'When a handle has links visibility, `/u/[handle]/links` responds without a server error shell.',
    area: 'Links',
    spec: 'pathways/links-public.spec.ts',
    requiresAuth: false,
    fixtureKind: 'none',
    stability: 'experimental',
    intents: [
      'Open `/u/alexchen/links` (seed handle) or configured LIVE_QA_LINKS_HANDLE',
      'Assert page is not a 500 shell',
    ],
    tags: ['links', 'public'],
  },
];

export function getLiveQaPathway(id: string): LiveQaPathway | undefined {
  return LIVE_QA_PATHWAYS.find((pathway) => pathway.id === id);
}

export function listLiveQaPathways(ids?: string[]): LiveQaPathway[] {
  if (!ids?.length) return [...LIVE_QA_PATHWAYS];
  const set = new Set(ids);
  return LIVE_QA_PATHWAYS.filter((pathway) => set.has(pathway.id));
}
