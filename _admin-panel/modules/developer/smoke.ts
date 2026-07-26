import type { SmokeItem } from './types';

/**
 * Manual smoke checklist for surfaces that are hard to fully automate in unit tests.
 * Mark items done in the overlay (persisted in localStorage).
 */
export const SMOKE_ITEMS: SmokeItem[] = [
  {
    id: 'dashboard-resumes',
    area: 'Dashboard',
    title: 'Resumes section loads',
    href: '/dashboard',
    verify: 'Resume cards render; create / open / visibility meta look correct.',
  },
  {
    id: 'dashboard-cover-letters',
    area: 'Dashboard',
    title: 'Cover letters section',
    href: '/dashboard',
    verify: 'Cover letter scroller appears; empty state and create entry work.',
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
    href: '/dashboard',
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
