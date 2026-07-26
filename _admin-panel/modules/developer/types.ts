export type HealthStatus = 'ok' | 'warn' | 'fail';

export type HealthCheck = {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
};

export type HealthReport = {
  overall: HealthStatus;
  checkedAt: string;
  checks: HealthCheck[];
};

export type DevtoolsStatus = {
  nodeEnv: string;
  nextRuntime: string;
  appUrl: string | null;
  rootDomain: string | null;
  features: Record<string, boolean>;
  pathnameHint: string | null;
};

export type TestSuiteId = string;

export type TestSuite = {
  id: TestSuiteId;
  label: string;
  description: string;
  /** Vitest file globs relative to repo root */
  patterns: string[];
};

export type TestRunResult = {
  suiteId: TestSuiteId;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
};

export type SmokeItem = {
  id: string;
  area: string;
  title: string;
  href: string;
  verify: string;
};

export type QuickLink = {
  id: string;
  label: string;
  href: string;
  group: string;
};
