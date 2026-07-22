import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connect profiles · Follio',
  description:
    'Attach profiles across careers, engineering, design, and writing — preview of the onboarding connect step.',
  robots: { index: false, follow: false },
};

export default function ImportConstellationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
