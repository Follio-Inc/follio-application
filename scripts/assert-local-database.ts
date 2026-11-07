/**
 * Local Prisma commands must not run against the production database.
 * Prisma reads `.env`. Next.js also reads `.env.local`, which overrides it.
 */

import { readFileSync } from 'node:fs';

import { remoteDatabaseBlockedReason } from '@/lib/database-target';

function databaseUrlsFromFile(path: string): string[] {
  try {
    const text = readFileSync(path, 'utf8');
    const urls: string[] = [];
    for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
      const match = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
      if (!match) continue;
      urls.push(match[1].trim().replace(/^['"]|['"]$/g, ''));
    }
    return urls;
  } catch {
    return [];
  }
}

const candidates = [
  process.env.DATABASE_URL,
  process.env.DIRECT_URL,
  ...databaseUrlsFromFile('.env'),
  ...databaseUrlsFromFile('.env.local'),
];

for (const databaseUrl of candidates) {
  const reason = remoteDatabaseBlockedReason({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl,
    allowRemoteDatabase: process.env.ALLOW_REMOTE_DATABASE,
  });
  if (reason) {
    console.error(reason);
    process.exit(1);
  }
}
