/**
 * Prisma Database Client
 * Singleton pattern for database connection to prevent multiple instances in development
 *
 * Optimized for Neon serverless Postgres + Vercel deployment:
 * - Uses connection pooling via Neon's pooler endpoint
 * - Configured for serverless cold starts
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // Datasource configuration for serverless environments
    datasourceUrl: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export default db;
