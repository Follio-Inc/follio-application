/**
 * Developer module access gates.
 *
 * Page + APIs always require admin auth (enforced in app shims).
 * Extra gates below limit dangerous local-only actions (Vitest spawn).
 */

export type DeveloperGateInput = {
  nodeEnv?: string;
  enabledFlag?: string;
};

/** Health / smoke / catalog — allowed for admins everywhere. */
export function isDeveloperModuleReadable(): boolean {
  return true;
}

/**
 * Spawning Vitest is local-only.
 * - Hard ban in production (cannot override)
 * - Outside production: requires DEVTOOLS_ENABLED=true
 * - test env: allowed for unit tests
 */
export function canRunDeveloperSuites({
  nodeEnv = process.env.NODE_ENV,
  enabledFlag = process.env.DEVTOOLS_ENABLED,
}: DeveloperGateInput = {}): boolean {
  if (nodeEnv === 'production') return false;
  if (nodeEnv === 'test') return true;
  return enabledFlag === 'true';
}

export function assertCanRunDeveloperSuites(input?: DeveloperGateInput): void {
  if (!canRunDeveloperSuites(input)) {
    throw new DeveloperSuitesDisabledError();
  }
}

export class DeveloperSuitesDisabledError extends Error {
  readonly status = 403;

  constructor() {
    super('Test suites are only available locally with DEVTOOLS_ENABLED=true');
    this.name = 'DeveloperSuitesDisabledError';
  }
}

/** @deprecated Use canRunDeveloperSuites — kept for transitional tests */
export function isDevtoolsEnabled(input?: DeveloperGateInput): boolean {
  return canRunDeveloperSuites(input);
}

/** @deprecated Use assertCanRunDeveloperSuites */
export function assertDevtoolsEnabled(input?: DeveloperGateInput): void {
  assertCanRunDeveloperSuites(input);
}

/** @deprecated Use DeveloperSuitesDisabledError */
export class DevtoolsDisabledError extends DeveloperSuitesDisabledError {
  constructor() {
    super();
    this.name = 'DevtoolsDisabledError';
  }
}
