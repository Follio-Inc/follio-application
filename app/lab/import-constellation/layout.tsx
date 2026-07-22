import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connect your accounts · Follio',
  description:
    'Preview of onboarding Step 3 — connect professional profiles to import resume data.',
  robots: { index: false, follow: false },
};

export default function ImportConstellationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
