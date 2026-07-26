import type { QuickLink } from './types';

export const QUICK_LINKS: QuickLink[] = [
  { id: 'home', label: 'Home', href: '/', group: 'App' },
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', group: 'App' },
  { id: 'builder', label: 'Resume builder', href: '/builder', group: 'App' },
  {
    id: 'cover-letter-builder',
    label: 'Cover letter builder',
    href: '/cover-letter-builder',
    group: 'App',
  },
  { id: 'resumes', label: 'Resumes', href: '/resumes', group: 'App' },
  { id: 'settings', label: 'Settings', href: '/settings', group: 'App' },
  { id: 'onboarding', label: 'Onboarding', href: '/onboarding', group: 'App' },
  { id: 'admin', label: 'Admin', href: '/admin', group: 'Admin' },
  { id: 'lab', label: 'Lab', href: '/lab', group: 'Admin' },
];

export function getQuickLinks(): QuickLink[] {
  return QUICK_LINKS;
}
