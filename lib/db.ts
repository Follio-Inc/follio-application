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

import { buildDatasourceUrl } from '@/lib/prisma-connection';

const LOG_LEVELS =
  process.env.NODE_ENV === 'development' ? (['error', 'warn'] as const) : (['error'] as const);

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: [...LOG_LEVELS],
    datasourceUrl: buildDatasourceUrl(process.env.DATABASE_URL ?? ''),
  });
}

/**
 * Bump when Prisma models gain fields that a long-lived `globalThis` client would miss,
 * or when connection-pool defaults change and the singleton must be recreated.
 * CoverLetter.visibility / unlistedKey → generation 2.
 * Pool defaults (limit/timeout, no duplicate URL params) → generation 3.
 * AiConnector* / AiEditDraft → generation 4.
 * DocumentPdfCache → generation 5.
 */
const PRISMA_CLIENT_GENERATION = 5;

function schemaFieldFingerprint(): string {
  const modelNames = ['WorkExperience', 'CoverLetter', 'AiEditDraft', 'DocumentPdfCache'] as const;
  return modelNames
    .map((name) => {
      const fields =
        Prisma.dmmf.datamodel.models
          .find((m) => m.name === name)
          ?.fields.map((f) => f.name)
          .join(',') ?? '';
      return `${name}:{${fields}}`;
    })
    .join('|');
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaWorkExperienceFields?: string;
  prismaSchemaFieldFingerprint?: string;
  prismaClientGeneration?: number;
};

/**
 * After `prisma generate`, Next.js can keep a PrismaClient on globalThis that was
 * built from an older schema. Drop it when generation or tracked field sets change.
 */
const fingerprint = schemaFieldFingerprint();
const storedFingerprint =
  globalForPrisma.prismaSchemaFieldFingerprint ?? globalForPrisma.prismaWorkExperienceFields;
const generationMismatch = globalForPrisma.prismaClientGeneration !== PRISMA_CLIENT_GENERATION;
const hadStaleSingleton =
  Boolean(globalForPrisma.prisma) && (generationMismatch || storedFingerprint !== fingerprint);

if (hadStaleSingleton && globalForPrisma.prisma) {
  void globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
  globalForPrisma.prismaClientGeneration = PRISMA_CLIENT_GENERATION;
  globalForPrisma.prismaSchemaFieldFingerprint = fingerprint;
  globalForPrisma.prismaWorkExperienceFields = fingerprint;
}

export default db;
