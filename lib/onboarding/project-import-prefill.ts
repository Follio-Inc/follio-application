/**
 * Prefill values for project-step platform imports from links the user
 * already shared (Links step, constellation import, etc.).
 */

export type PrefillLink = {
  type?: string | null;
  url?: string | null;
  label?: string | null;
};

export type ProjectImportSourceId = 'github' | 'medium' | 'substack' | 'devpost';

const SOURCE_MATCHERS: Record<
  ProjectImportSourceId,
  {
    types: string[];
    /** URL hostname / path hints when type is missing or OTHER */
    urlIncludes: string[];
    labels?: string[];
  }
> = {
  github: {
    types: ['GITHUB'],
    urlIncludes: ['github.com', 'github.io'],
  },
  medium: {
    types: ['MEDIUM'],
    urlIncludes: ['medium.com'],
  },
  substack: {
    types: ['SUBSTACK'],
    urlIncludes: ['substack.com'],
  },
  devpost: {
    types: ['DEVPOST', 'OTHER'],
    urlIncludes: ['devpost.com'],
    labels: ['devpost'],
  },
};

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function linkMatchesSource(link: PrefillLink, sourceId: ProjectImportSourceId): boolean {
  const matcher = SOURCE_MATCHERS[sourceId];
  const url = (link.url || '').trim().toLowerCase();
  const type = (link.type || '').toUpperCase();
  const label = (link.label || '').trim().toLowerCase();

  if (!url) return false;

  if (matcher.types.includes(type)) {
    // For OTHER (e.g. Devpost), require URL or label confirmation
    if (type === 'OTHER') {
      return (
        matcher.urlIncludes.some((hint) => url.includes(hint)) ||
        (matcher.labels?.some((l) => label === l || label.includes(l)) ?? false)
      );
    }
    return true;
  }

  if (matcher.urlIncludes.some((hint) => url.includes(hint))) {
    return true;
  }

  if (matcher.labels?.some((l) => label === l || label.includes(l))) {
    return true;
  }

  return false;
}

/**
 * Find the best previously shared URL/handle for a project import source.
 * Priority: matching existing link → optional known handle (e.g. GitHub profile).
 */
export function resolveProjectImportPrefill(
  sourceId: ProjectImportSourceId,
  existingLinks: PrefillLink[],
  options?: { knownHandle?: string | null }
): string {
  const match = existingLinks.find((link) => linkMatchesSource(link, sourceId));
  if (match?.url?.trim()) {
    return normalizeUrl(match.url);
  }

  const handle = options?.knownHandle?.trim();
  if (handle) {
    return handle.replace(/^@/, '');
  }

  return '';
}
