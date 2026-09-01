import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { ClerkProviderWrapper } from '@/components/providers/clerk-provider-wrapper';
import { ThemeProvider } from '@/components/theme-provider';
import { APP_THEME_DEFAULT } from '@/lib/app-theme';

import './globals.css';

// Build environments may inject a placeholder Clerk publishable key, which
// crashes static prerendering when Clerk validates the key. Keep root layout
// dynamic so prerender does not evaluate Clerk at build time.
export const dynamic = 'force-dynamic';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') || 'https://follio.app';

export const metadata: Metadata = {
  title: {
    default: 'Follio — Own your first impression',
    template: '%s | Follio',
  },
  description: 'Your Follio. One link for how people reach you, your resume, and your work.',
  keywords: ['resume', 'portfolio', 'digital resume', 'career', 'professional profile'],
  authors: [{ name: 'Follio' }],
  creator: 'Follio',
  manifest: '/site.webmanifest',
  icons: {
    icon: [{ url: '/favicon.ico' }],
    apple: [{ url: '/apple-touch-icon.png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'Follio',
    title: 'Follio — Own your first impression',
    description: 'Your Follio. One link for how people reach you, your resume, and your work.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Follio — Own your first impression',
    description: 'Your Follio. One link for how people reach you, your resume, and your work.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProviderWrapper>
      <html lang="en" suppressHydrationWarning>
        <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning>
          <ThemeProvider
            attribute="class"
            defaultTheme={APP_THEME_DEFAULT}
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProviderWrapper>
  );
}
