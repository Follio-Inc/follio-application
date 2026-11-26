/**
 * A small Postgres stand-in for the proposal persistence tests.
 *
 * Not a mock that returns canned values. It keeps rows, evaluates `where`
 * clauses, rolls transactions back, and — the part that matters — *executes*
 * the raw conditional UPDATE that `lib/resume-proposals/apply-target.ts`
 * builds, by parsing the real `Prisma.Sql` the real code produced and
 * applying it to the in-memory rows.
 *
 * That is why it exists. The safety claims in Phase 3B.1 are claims about SQL
 * semantics: that a compare-and-swap writes exactly one array element and only
 * while it still holds the reviewed text, and that a second concurrent apply
 * matches nothing. A mock returning `{ count: 1 }` would test none of that. An
 * interpreter that honours the WHERE clause tests all of it, including the
 * cases where the answer should be "zero rows changed".
 *
 * What it is not: Postgres. It does not model isolation levels, real locking,
 * or the exact instant a row lock is taken. It serialises transactions
 * outright, which is stricter than READ COMMITTED — so a test passing here
 * shows the *logic* is right, not that the database will behave this way under
 * every interleaving. The honest statement of the production guarantee is in
 * the service's own documentation; this file checks that the code implements
 * what that documentation describes.
 */

import type { Prisma } from '@prisma/client';

// ============================================================================
// ROWS
// ============================================================================

export interface FakeProfileRow {
  id: string;
  userId: string;
  isArchived: boolean;
  summary: string | null;
  updatedAt: Date;
}

export interface FakeExperienceRow {
  id: string;
  profileId: string;
  bullets: string[];
  updatedAt: Date;
}

export interface FakeProjectRow {
  id: string;
  profileId: string;
  description: string | null;
  highlights: string[];
  updatedAt: Date;
}

export interface FakeBatchRow {
  id: string;
  userId: string;
  profileId: string;
  mode: string;
  status: string;
  rootRunId: string | null;
  idempotencyKey: string | null;
  summary: string;
  openQuestions: string[];
  limitations: string[];
  revisionAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeProposalRow {
  id: string;
  batchId: string;
  userId: string;
  profileId: string;
  agentProposalId: string;
  agentRunId: string | null;
  targetRef: string;
  section: string;
  targetRecordId: string;
  fieldName: string;
  arrayIndex: number | null;
  originalText: string;
  proposedText: string;
  explanation: string;
  sourceEvidence: string[];
  keywordsAddressed: string[];
  uncertainties: string[];
  verificationStatus: string;
  verificationReason: string;
  deterministicIssues: unknown;
  revisionRound: number;
  decision: string;
  state: string;
  stateReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  decidedAt: Date | null;
  appliedAt: Date | null;
}

export interface FakeStore {
  users: Array<{ id: string; clerkId: string }>;
  profiles: FakeProfileRow[];
  experiences: FakeExperienceRow[];
  projects: FakeProjectRow[];
  batches: FakeBatchRow[];
  proposals: FakeProposalRow[];
}

export function emptyStore(): FakeStore {
  return { users: [], profiles: [], experiences: [], projects: [], batches: [], proposals: [] };
}

// ============================================================================
// WHERE MATCHING
// ============================================================================

/** The subset of Prisma `where` syntax these tests use. */
function matches(
  row: Record<string, unknown>,
  where: Record<string, unknown> | undefined
): boolean {
  if (!where) return true;

  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition === null) return value === null;
    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      const clause = condition as Record<string, unknown>;
      if ('in' in clause) return (clause.in as unknown[]).includes(value);
      if ('not' in clause) return value !== clause.not;
      return false;
    }
    return value === condition;
  });
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Put a snapshot back without replacing the object the service holds. */
function restore(store: FakeStore, snapshot: FakeStore): void {
  store.profiles.length = 0;
  store.profiles.push(...snapshot.profiles);
  store.experiences.length = 0;
  store.experiences.push(...snapshot.experiences);
  store.projects.length = 0;
  store.projects.push(...snapshot.projects);
  store.batches.length = 0;
  store.batches.push(...snapshot.batches);
  store.proposals.length = 0;
  store.proposals.push(...snapshot.proposals);
}

// ============================================================================
// RAW STATEMENT INTERPRETER
// ============================================================================

interface RawStatement {
  text: string;
  values: unknown[];
}

const UPDATE_PATTERN =
  /UPDATE\s+"(\w+)"\s+SET\s+"(\w+)"(?:\[(\d+)\])?\s*=\s*\$(\d+),\s*"updatedAt"\s*=\s*NOW\(\)\s+WHERE\s+([\s\S]+)$/;

const CONDITION_PATTERN = /"(\w+)"(?:\[(\d+)\])?\s*=\s*\$(\d+)/g;

/**
 * Execute one of the four statements `buildApplyStatement` can produce.
 *
 * Returns the number of rows changed, exactly as `$executeRaw` would: zero
 * when the WHERE did not hold, which is the case the staleness and
 * double-apply tests turn on.
 */
function executeRaw(store: FakeStore, statement: RawStatement): number {
  const parsed = UPDATE_PATTERN.exec(statement.text.replace(/\s+/g, ' ').trim());
  if (!parsed) {
    throw new Error(`fake-proposal-db cannot interpret: ${statement.text}`);
  }

  const [, table, column, rawSubscript, valuePlaceholder, whereClause] = parsed;
  const newValue = statement.values[Number(valuePlaceholder) - 1];
  const setIndex = rawSubscript ? Number(rawSubscript) - 1 : null;

  const conditions: Array<{ column: string; index: number | null; value: unknown }> = [];
  for (const match of whereClause.matchAll(CONDITION_PATTERN)) {
    conditions.push({
      column: match[1],
      index: match[2] ? Number(match[2]) - 1 : null,
      value: statement.values[Number(match[3]) - 1],
    });
  }

  const rows: Array<Record<string, unknown>> =
    table === 'Profile'
      ? (store.profiles as unknown as Array<Record<string, unknown>>)
      : table === 'WorkExperience'
        ? (store.experiences as unknown as Array<Record<string, unknown>>)
        : (store.projects as unknown as Array<Record<string, unknown>>);

  let changed = 0;

  for (const row of rows) {
    const holds = conditions.every((condition) => {
      const current = row[condition.column];
      if (condition.index === null) return current === condition.value;
      if (!Array.isArray(current)) return false;
      // Out of range is a miss, not a crash — that is exactly what Postgres
      // does for a subscript past the end of an array, and it is the
      // "bullet was removed" case.
      return current[condition.index] === condition.value;
    });

    if (!holds) continue;

    if (setIndex === null) {
      row[column] = newValue;
    } else {
      const array = row[column];
      if (!Array.isArray(array) || setIndex >= array.length) continue;
      array[setIndex] = newValue;
    }
    row.updatedAt = new Date();
    changed += 1;
  }

  return changed;
}

// ============================================================================
// THE CLIENT
// ============================================================================

export interface FakeDbOptions {
  /** Called before each write, so a test can make the database fail. */
  onWrite?: (model: string, operation: string) => void;
}

/**
 * Build a `db` double over a store.
 *
 * `$transaction` snapshots the whole store and restores it if the callback
 * throws, which is what lets the tests assert that a failed apply leaves both
 * the resume and the proposal exactly as they were.
 */
export function createFakeDb(store: FakeStore, options: FakeDbOptions = {}) {
  /** Serialises `$transaction` callbacks. See the note on `$transaction`. */
  let transactionQueue: Promise<unknown> = Promise.resolve();
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}_${++idCounter}`;

  const guard = (model: string, operation: string) => options.onWrite?.(model, operation);

  const client = {
    user: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        const row = store.users.find((user) => matches(user as never, where));
        return row ? clone(row) : null;
      },
    },

    profile: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const row = store.profiles.find((profile) => matches(profile as never, where));
        return row ? clone(row) : null;
      },
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        const row = store.profiles.find((profile) => matches(profile as never, where));
        if (!row) return null;
        // `select` always asks for the same shape in this service, so the
        // relations are attached unconditionally.
        return clone({
          ...row,
          workExperiences: store.experiences.filter((item) => item.profileId === row.id),
          projects: store.projects.filter((item) => item.profileId === row.id),
        });
      },
    },

    resumeProposalBatch: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        guard('resumeProposalBatch', 'create');
        const now = new Date();
        const row = {
          id: nextId('batch'),
          rootRunId: null,
          idempotencyKey: null,
          summary: '',
          openQuestions: [],
          limitations: [],
          revisionAttempts: 0,
          createdAt: now,
          updatedAt: now,
          ...data,
        } as unknown as FakeBatchRow;

        if (
          row.idempotencyKey &&
          store.batches.some(
            (batch) =>
              batch.profileId === row.profileId && batch.idempotencyKey === row.idempotencyKey
          )
        ) {
          const error = new Error('Unique constraint failed') as Error & { code: string };
          error.code = 'P2002';
          throw error;
        }

        store.batches.push(row);
        return clone(row);
      },
      findFirst: async ({
        where,
        include,
      }: {
        where: Record<string, unknown>;
        include?: Record<string, unknown>;
      }) => {
        const row = store.batches.find((batch) => matches(batch as never, where));
        if (!row) return null;
        return clone(
          include?.proposals
            ? { ...row, proposals: store.proposals.filter((item) => item.batchId === row.id) }
            : row
        );
      },
      findMany: async ({
        where,
        take,
        include,
      }: {
        where: Record<string, unknown>;
        take?: number;
        include?: Record<string, unknown>;
        orderBy?: unknown;
      }) => {
        const rows = store.batches
          .filter((batch) => matches(batch as never, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take ?? 50);
        return clone(
          rows.map((row) =>
            include?.proposals
              ? { ...row, proposals: store.proposals.filter((item) => item.batchId === row.id) }
              : row
          )
        );
      },
    },

    resumeEditProposal: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        guard('resumeEditProposal', 'create');
        const now = new Date();
        const row = {
          id: nextId('proposal'),
          agentRunId: null,
          explanation: '',
          sourceEvidence: [],
          keywordsAddressed: [],
          uncertainties: [],
          verificationReason: '',
          deterministicIssues: [],
          revisionRound: 0,
          decision: 'NONE',
          stateReason: null,
          createdAt: now,
          updatedAt: now,
          decidedAt: null,
          appliedAt: null,
          ...data,
        } as unknown as FakeProposalRow;

        if (
          store.proposals.some(
            (item) => item.batchId === row.batchId && item.targetRef === row.targetRef
          )
        ) {
          const error = new Error('Unique constraint failed') as Error & { code: string };
          error.code = 'P2002';
          throw error;
        }

        store.proposals.push(row);
        return clone(row);
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const row = store.proposals.find((proposal) => matches(proposal as never, where));
        return row ? clone(row) : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        guard('resumeEditProposal', 'updateMany');
        let count = 0;
        for (const row of store.proposals) {
          if (!matches(row as never, where)) continue;
          Object.assign(row, data, { updatedAt: new Date() });
          count += 1;
        }
        return { count };
      },
    },

    $executeRaw: async (statement: Prisma.Sql) => {
      guard('raw', 'execute');
      const raw = statement as unknown as RawStatement;
      return executeRaw(store, raw);
    },

    /**
     * Serialised, which is stricter than any real isolation level.
     *
     * Two concurrent transactions are run one after the other rather than
     * interleaved, because the alternative here is worse than unrealistic: a
     * snapshot taken by the second transaction before the first commits would
     * undo the first on rollback, which no database does. Serialising keeps
     * rollback honest. The cost is that this cannot demonstrate behaviour
     * under interleaving — the production guarantee rests on the conditional
     * UPDATE being a single statement, which is what the raw interpreter
     * above actually exercises.
     */
    $transaction: async <T>(
      callback: (tx: unknown) => Promise<T>,
      _options?: unknown
    ): Promise<T> => {
      const run = async (): Promise<T> => {
        const snapshot = clone(store);
        try {
          return await callback(client);
        } catch (error) {
          // Restored in place: the service holds a reference to `store`
          // through the closure, so replacing the object would be invisible
          // to it.
          restore(store, snapshot);
          throw error;
        }
      };

      const queued = transactionQueue.then(run, run);
      // Keep the chain alive whichever way this transaction ended.
      transactionQueue = queued.then(
        () => undefined,
        () => undefined
      );
      return queued;
    },
  };

  return client;
}
