import { db } from '@/lib/db';
import { isPortfolioEnabled } from '@/lib/features';

import type { HealthCheck, HealthReport, HealthStatus } from './types';

function worstStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  return 'ok';
}

function envPresence(name: string, required: boolean): HealthCheck {
  const present = Boolean(process.env[name]?.trim());
  if (present) {
    return {
      id: `env:${name}`,
      label: name,
      status: 'ok',
      detail: 'set',
    };
  }
  return {
    id: `env:${name}`,
    label: name,
    status: required ? 'fail' : 'warn',
    detail: required ? 'missing (required)' : 'missing (optional)',
  };
}

async function checkDatabase(): Promise<HealthCheck> {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return {
      id: 'database',
      label: 'Database',
      status: 'ok',
      detail: `reachable (${Date.now() - started}ms)`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return {
      id: 'database',
      label: 'Database',
      status: 'fail',
      detail: message.slice(0, 200),
    };
  }
}

/**
 * Collects non-secret health signals for the overlay.
 * Never returns env values — presence only.
 */
export async function collectHealthReport(): Promise<HealthReport> {
  const checks: HealthCheck[] = [
    await checkDatabase(),
    envPresence('DATABASE_URL', true),
    envPresence('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', true),
    envPresence('CLERK_SECRET_KEY', true),
    envPresence('NEXT_PUBLIC_APP_URL', false),
    envPresence('NEXT_PUBLIC_ROOT_DOMAIN', false),
    envPresence('OPENAI_API_KEY', false),
    envPresence('PDF_WORKER_URL', false),
    {
      id: 'feature:portfolio',
      label: 'Portfolio feature flag',
      status: 'ok',
      detail: isPortfolioEnabled() ? 'enabled' : 'disabled',
    },
    {
      id: 'runtime:node',
      label: 'Node.js',
      status: 'ok',
      detail: process.version,
    },
  ];

  return {
    overall: worstStatus(checks.map((c) => c.status)),
    checkedAt: new Date().toISOString(),
    checks,
  };
}
