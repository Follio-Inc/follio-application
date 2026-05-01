import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Image optimization configuration
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
      {
        protocol: 'https',
        hostname: 'images.clerk.dev',
      },
      {
        protocol: 'https',
        hostname: 'cdn-images-1.medium.com',
      },
      {
        protocol: 'https',
        hostname: 'miro.medium.com',
      },
    ],
  },

  // Experimental features for better performance
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
      // Allow Clerk's sign-out server actions to work properly
      // Reads from ALLOWED_ORIGINS env var in production; falls back to localhost for dev
      allowedOrigins: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : ['localhost:3000'],
    },
    // Tree-shake heavy barrel-import libraries so each `import { X } from 'lucide-react'`
    // pulls only X instead of the entire icon set. Major win for bundle size and
    // dev-mode compile times \u2014 these libs are imported in dozens of places.
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', 'framer-motion', 'date-fns'],
  },

  // Externalize packages that don't work with webpack bundling
  serverExternalPackages: ['pdf-parse', 'puppeteer'],

  // Headers for security and SEO
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Strict-Transport-Security: Enforces HTTPS for 1 year, including subdomains
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
      // Resume preview iframe: serve fresh content to prevent stale
      // data after profile edits in the builder.
      {
        source: '/resume-preview/:id*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store',
          },
        ],
      },
      // Portfolio pages: always serve fresh content to prevent stale
      // content flash after profile edits. The page uses force-dynamic
      // so server-side rendering is already uncached.
      {
        source: '/u/:handle*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
