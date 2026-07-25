/**
 * Prisma Database Client
 * Singleton pattern for database connection to prevent multiple instances in development
 *
 * Optimized for Neon serverless Postgres + Vercel deployment:
 * - Uses connection pooling via Neon's pooler endpoint
 * - Configured for serverless cold starts
 * - Handles Neon's aggressive idle connection closing
 */

import { Prisma, PrismaClient } from '@prisma/client';

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
  return new PrismaClient({
    log: [...LOG_LEVELS],
    datasourceUrl: buildDatasourceUrl(),
  });
}

function workExperienceFieldFingerprint(): string {
  return (
    Prisma.dmmf.datamodel.models
      .find((m) => m.name === 'WorkExperience')
      ?.fields.map((f) => f.name)
      .join(',') ?? ''
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaWorkExperienceFields?: string;
  __prismaCreatedAt?: number;
  __prismaInstanceId?: string;
};

/**
 * After `prisma generate`, Next.js can keep a PrismaClient on globalThis that was
 * built from an older schema. Drop it when the WorkExperience field set changes.
 */
const fingerprint = workExperienceFieldFingerprint();
const hadStaleSingleton =
  Boolean(globalForPrisma.prisma) && globalForPrisma.prismaWorkExperienceFields !== fingerprint;

if (hadStaleSingleton && globalForPrisma.prisma) {
  void globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}

const reusedExistingClient = Boolean(globalForPrisma.prisma);
const instanceId = `prisma_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
  globalForPrisma.prismaWorkExperienceFields = fingerprint;
  globalForPrisma.__prismaCreatedAt = Date.now();
  globalForPrisma.__prismaInstanceId = instanceId;
}

// #region agent log
{
  const we = Prisma.dmmf.datamodel.models.find((m) => m.name === 'WorkExperience');
  const dbHost = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? '').host;
    } catch {
      return 'invalid-url';
    }
  })();
  fetch('http://127.0.0.1:7254/ingest/fcf2bd3d-74c8-4090-ab73-f47f4b1cfce0', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '55c426' },
    body: JSON.stringify({
      sessionId: '55c426',
      runId: 'post-fix',
      hypothesisId: 'A',
      location: 'lib/db.ts:module-init',
      message: 'Prisma singleton init state',
      data: {
        reusedExistingClient,
        hadStaleSingleton,
        instanceId,
        fingerprint,
        workExperienceHasTags: we?.fields.some((f) => f.name === 'tags') ?? null,
        workExperienceFields: we?.fields.map((f) => f.name) ?? [],
        dbHost,
        clientVersion: Prisma.prismaVersion.client,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

export default db;
