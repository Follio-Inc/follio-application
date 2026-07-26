import { isPortfolioEnabled } from '@/lib/features';
import { ROOT_DOMAIN } from '@/lib/url';

import type { DevtoolsStatus } from './types';

export function collectDevtoolsStatus(pathnameHint: string | null = null): DevtoolsStatus {
  return {
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    nextRuntime:
      typeof (globalThis as { EdgeRuntime?: string }).EdgeRuntime === 'string' ? 'edge' : 'nodejs',
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    rootDomain: ROOT_DOMAIN,
    features: {
      portfolio: isPortfolioEnabled(),
      subdomain: process.env.NEXT_PUBLIC_SUBDOMAIN_ENABLED === 'true',
    },
    pathnameHint,
  };
}
