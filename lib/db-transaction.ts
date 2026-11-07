/**
 * Prisma interactive transactions default to 5 seconds. On a remote Postgres
 * connection (Neon), a handful of sequential writes can exceed that and Prisma
 * aborts with P2028 ("Transaction already closed"). Callers then show a generic
 * failure such as "Failed to create resume".
 *
 * Use these options for every interactive or sequential `$transaction` that
 * does user-facing work.
 */
export const interactiveTransactionOptions = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;
