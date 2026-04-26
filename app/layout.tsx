import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { ThemeProvider } from '@/components/theme-provider';

import './globals.css';

// NOTE: We intentionally do NOT mark the root layout as `force-dynamic`.
// Pages that need dynamic rendering (anything calling Clerk's `auth()`,
// reading cookies/headers, or using `force-dynamic` themselves) opt in
// individually. Marking the root forces every page \u2014 including static
// marketing pages \u2014 to be re-rendered on every request, killing prefetch
// and edge caching.

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Follio - Your Digital Resume Platform',
    template: '%s | Follio',
  },
  description:
    'Create a digital-native resume that adapts to every viewer. Multiple views, perfect parsing, and seamless exports.',
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
    url: 'https://follio.dev',
    siteName: 'Follio',
    title: 'Follio - Your Digital Resume Platform',
    description:
      'Create a digital-native resume that adapts to every viewer. Multiple views, perfect parsing, and seamless exports.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Follio - Your Digital Resume Platform',
    description:
      'Create a digital-native resume that adapts to every viewer. Multiple views, perfect parsing, and seamless exports.',
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
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
