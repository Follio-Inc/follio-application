import { describe, expect, it } from 'vitest';

import {
  canPurgeOrphanedAccount,
  isLocalDatabaseUrl,
  remoteDatabaseBlockedReason,
} from '@/lib/database-target';

const LOCAL = 'postgresql://postgres:postgres@localhost:5432/follio';
const REMOTE = 'postgresql://user:pass@ep-example.us-east-1.aws.neon.tech/neondb?sslmode=require';

describe('database target', () => {
  it('treats localhost as the local database', () => {
    expect(isLocalDatabaseUrl(LOCAL)).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:5432/follio')).toBe(true);
    expect(isLocalDatabaseUrl(REMOTE)).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
  });

  it('blocks a non-production process from opening a remote database', () => {
    expect(remoteDatabaseBlockedReason({ nodeEnv: 'development', databaseUrl: REMOTE })).toMatch(
      /local Docker database/
    );
    expect(remoteDatabaseBlockedReason({ nodeEnv: 'development', databaseUrl: LOCAL })).toBeNull();
    expect(remoteDatabaseBlockedReason({ nodeEnv: 'production', databaseUrl: REMOTE })).toBeNull();
    expect(
      remoteDatabaseBlockedReason({
        nodeEnv: 'development',
        databaseUrl: REMOTE,
        allowRemoteDatabase: 'true',
      })
    ).toBeNull();
  });

  it('purges orphaned accounts only on the local database or in production', () => {
    expect(canPurgeOrphanedAccount({ nodeEnv: 'development', databaseUrl: LOCAL })).toBe(true);
    expect(canPurgeOrphanedAccount({ nodeEnv: 'test', databaseUrl: LOCAL })).toBe(true);
    expect(canPurgeOrphanedAccount({ nodeEnv: 'production', databaseUrl: REMOTE })).toBe(true);
    expect(canPurgeOrphanedAccount({ nodeEnv: 'development', databaseUrl: REMOTE })).toBe(false);
    expect(
      canPurgeOrphanedAccount({
        nodeEnv: 'development',
        databaseUrl: REMOTE,
        allowRemoteDatabase: 'true',
      })
    ).toBe(false);
  });
});
