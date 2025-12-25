import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Exclude pdf-parse and its dependencies from webpack bundling
  // These packages contain test files with invalid Base64 that break the build
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],

  // Webpack configuration to completely externalize pdf-parse
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark pdf-parse and pdfjs-dist as external modules
      // This prevents webpack from trying to bundle or analyze them at all
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'pdf-parse',
        'pdf-parse/lib/pdf-parse',
        'pdfjs-dist',
        /^pdf-parse.*/,
        /^pdfjs-dist.*/,
      ];
    }

    // Also add alias as a fallback
    config.resolve.alias = {
      ...config.resolve.alias,
      'pdf-parse': 'pdf-parse/lib/pdf-parse',
    };

    return config;
  },

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
    ],
  },

  // Experimental features for better performance
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

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
        ],
      },
    ];
  },
};

export default nextConfig;
