/**
 * Prisma Database Client
 * Singleton pattern for database connection to prevent multiple instances in development
 *
 * Optimized for Neon serverless Postgres + Vercel deployment:
 * - Uses connection pooling via Neon's pooler endpoint
 * - Configured for serverless cold starts
 * - Handles Neon's aggressive idle connection closing
 */

import { PrismaClient } from '@prisma/client';

const LOG_LEVELS =
  process.env.NODE_ENV === 'development' ? (['error', 'warn'] as const) : (['error'] as const);

/**
 * Connection pool URL parameters for resilience against closed connections.
 * - connection_limit: Max connections in the pool (keep low for dev)
 * - pool_timeout: Seconds to wait for a free connection before erroring
 * - connect_timeout: Seconds to wait when establishing a new connection
 */
function buildDatasourceUrl(): string {
  const baseUrl = process.env.DATABASE_URL ?? '';
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}connection_limit=5&pool_timeout=10&connect_timeout=10`;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: [...LOG_LEVELS],
    datasourceUrl: buildDatasourceUrl(),
  });

  return client;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export default db;
