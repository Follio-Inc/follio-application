/**
 * Local development and the production database must stay apart.
 *
 * follio.me and `next dev` use different Clerk apps. The same email gets a
 * different Clerk user id in each. If both apps open one database, signing in
 * locally looks like "this account was deleted" and the live profile is erased.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function databaseHost(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null;
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return null;
  }
}

export function isLocalDatabaseUrl(databaseUrl: string | undefined): boolean {
  const host = databaseHost(databaseUrl);
  return host !== null && LOCAL_HOSTS.has(host);
}

export type DatabaseTargetEnv = {
  nodeEnv?: string;
  databaseUrl?: string;
  allowRemoteDatabase?: string;
};

/**
 * Block `next dev` (and local Prisma scripts) from opening a remote database.
 * Production deploys are unchanged. Set ALLOW_REMOTE_DATABASE=true only for a
 * deliberate investigation — orphan deletion stays disabled in that case.
 */
export function remoteDatabaseBlockedReason(env: DatabaseTargetEnv): string | null {
  if (env.nodeEnv === 'production') return null;
  if (!env.databaseUrl) return null;
  if (env.allowRemoteDatabase === 'true') return null;
  if (isLocalDatabaseUrl(env.databaseUrl)) return null;

  return (
    'Refusing to connect: this process is not production, but DATABASE_URL is not the local Docker database. ' +
    'Point DATABASE_URL and DIRECT_URL at postgresql://postgres:postgres@localhost:5432/follio in both .env and .env.local. ' +
    'A localhost app on the production database can delete live profiles.'
  );
}

/**
 * Deleting an "orphaned" account is safe on the local database, and in the
 * production deployment that owns the live database. Anywhere else, a Clerk
 * 404 can mean "wrong Clerk app", not "user deleted".
 */
export function canPurgeOrphanedAccount(env: DatabaseTargetEnv): boolean {
  if (env.nodeEnv === 'production') return true;
  return isLocalDatabaseUrl(env.databaseUrl);
}
