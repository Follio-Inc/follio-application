/**
 * Prisma connection helpers
 *
 * Pure URL + retry logic so the Next.js Prisma singleton can recover from
 * Neon/Postgres closing idle connections and from a briefly exhausted pool
 * without instantiating PrismaClient in tests.
 */

const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** Errors that mean the query never reached Postgres — safe to retry writes too. */
const NEVER_STARTED_CODES = new Set(['P2024', 'P1001', 'P1002']);

const DEFAULT_POOL = {
  connectionLimitLocal: '10',
  connectionLimitPooled: '5',
  poolTimeout: '20',
  connectTimeout: '10',
} as const;

export function isNeonPooledUrl(databaseUrl: string): boolean {
  return /[-.]pooler[./:]/i.test(databaseUrl) || databaseUrl.includes('-pooler.');
}

/**
 * Merge Prisma pool params into DATABASE_URL without duplicating keys already
 * present (so .env can still override). Adds `pgbouncer=true` for Neon pooler
 * hosts so Prisma does not use prepared statements against PgBouncer.
 */
export function buildDatasourceUrl(baseUrl: string): string {
  if (!baseUrl) return baseUrl;

  const qIndex = baseUrl.indexOf('?');
  const head = qIndex === -1 ? baseUrl : baseUrl.slice(0, qIndex);
  const query = qIndex === -1 ? '' : baseUrl.slice(qIndex + 1);
  const params = new URLSearchParams(query);
  const pooled = isNeonPooledUrl(baseUrl);

  if (!params.has('connection_limit')) {
    params.set(
      'connection_limit',
      pooled ? DEFAULT_POOL.connectionLimitPooled : DEFAULT_POOL.connectionLimitLocal
    );
  }
  if (!params.has('pool_timeout')) {
    params.set('pool_timeout', DEFAULT_POOL.poolTimeout);
  }
  if (!params.has('connect_timeout')) {
    params.set('connect_timeout', DEFAULT_POOL.connectTimeout);
  }
  if (pooled && !params.has('pgbouncer')) {
    params.set('pgbouncer', 'true');
  }

  const qs = params.toString();
  return qs ? `${head}?${qs}` : head;
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return typeof error.code === 'string' ? error.code : '';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return typeof error.message === 'string' ? error.message : '';
  }
  return '';
}

/**
 * True when a Prisma failure is transient (pool wait, unreachable server, or
 * a closed connection on a read). Writes are only retried when the query
 * never started, so we do not double-insert.
 */
export function isRetryablePrismaError(error: unknown, operation?: string): boolean {
  const code = errorCode(error);
  const message = errorMessage(error);

  if (NEVER_STARTED_CODES.has(code)) return true;
  if (/timed out fetching a new connection/i.test(message)) return true;
  if (/can't reach database server/i.test(message)) return true;

  const isRead = !operation || READ_OPERATIONS.has(operation);
  if (!isRead) return false;

  if (code === 'P1017') return true;
  if (/server has closed the connection/i.test(message)) return true;
  if (/kind:\s*Closed/i.test(message)) return true;
  if (/postgresql connection.*closed/i.test(message)) return true;

  return false;
}

export type PrismaRetryOptions = {
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withPrismaRetry<T>(
  run: () => Promise<T>,
  operation?: string,
  options: PrismaRetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryablePrismaError(error, operation)) {
        throw error;
      }
      await sleep(200 * attempt);
    }
  }

  throw lastError;
}
