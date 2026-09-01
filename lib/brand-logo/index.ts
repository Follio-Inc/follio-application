/**
 * Brand logo service — resolves a company or school name to its official logo.
 *
 * Note: `./fetch` is not re-exported because it pulls in `sharp`. Server-only
 * callers import it directly from '@/lib/brand-logo/fetch'.
 */
export { domainCandidates, domainFromUrl, resolveBrandDomains } from './domain';
export type { BrandKind } from './domain';
export { activeProviders } from './providers';
export { universityDomain } from './universities';
export type { LogoProvider } from './providers';
export { brandLogoSrc, brandMonogram } from './src';
