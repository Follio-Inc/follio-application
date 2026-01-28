import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';

// Force dynamic rendering to avoid static generation issues with Clerk in CI
// This prevents build failures when using placeholder Clerk keys
export const dynamic = 'force-dynamic';

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
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
