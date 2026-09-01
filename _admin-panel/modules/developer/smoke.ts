import type { SmokeItem } from './types';

/**
 * Manual smoke checklist for surfaces that are hard to fully automate in unit tests.
 * Mark items done in the overlay (persisted in localStorage).
 */
export const SMOKE_ITEMS: SmokeItem[] = [
  {
    id: 'ai-resume-reader',
    area: 'AI',
    title: 'Resume reader (dev tool)',
    href: '/admin/developer?tab=resume-reader',
    verify:
      'Open Resume reader, run Alex Morgan or upload a PDF. Name / experience / skills look right. savedToProfile stays false.',
  },
  {
    id: 'dashboard-follio',
    area: 'Dashboard',
    title: 'Follio home',
    href: '/dashboard',
    verify:
      'Follio snap is letter-ratio like resume cards, 1.5× size, left-aligned. A hairline joins the Follio to the attached resume. Name, link, and Edit / Share / Open in one compact row.',
  },
  {
    id: 'dashboard-resumes',
    area: 'Dashboard',
    title: 'Resume section loads',
    href: '/dashboard',
    verify: 'Resume cards render below the Follio; create / open / visibility meta look correct.',
  },
  {
    id: 'public-follio',
    area: 'Public',
    title: 'Public Follio',
    href: '/dashboard',
    verify:
      'Open the copied Follio link without auth. Card shows name, connect actions, Resume Open/Download, and Work when those surfaces are public.',
  },
  {
    id: 'cover-letter-builder',
    area: 'Cover letter',
    title: 'Builder opens',
    href: '/cover-letter-builder',
    verify: 'Content / designer / preview panes load; edits autosave without errors.',
  },
  {
    id: 'cover-letter-download',
    area: 'Cover letter',
    title: 'PDF download',
    href: '/cover-letter-builder',
    verify: 'Download dialog opens and PDF downloads with a sensible filename.',
  },
  {
    id: 'cover-letter-visibility',
    area: 'Cover letter',
    title: 'Share / visibility',
    href: '/cover-letter-builder',
    verify: 'Private vs unlisted share dialog works; /cl/[key] opens when unlisted.',
  },
  {
    id: 'resume-builder',
    area: 'Resume',
    title: 'Resume builder',
    href: '/builder',
    verify: 'Pane layout, design controls, and preview still behave after document shared UI.',
  },
  {
    id: 'resume-download-share',
    area: 'Resume',
    title: 'Resume download & share',
    href: '/builder',
    verify: 'Download and share dialogs still match expected resume behavior.',
  },
  {
    id: 'public-resume',
    area: 'Public',
    title: 'Public resume route',
    href: '/dashboard',
    verify: 'Open a public/unlisted resume link from share; page renders without auth.',
  },
];

export function getSmokeItems(): SmokeItem[] {
  return SMOKE_ITEMS;
}
