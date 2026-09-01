import type { FollioLink } from './types';

export type SplitFollioLinks = {
  github: FollioLink | null;
  linkedin: FollioLink | null;
  elsewhere: FollioLink[];
};

/**
 * GitHub and LinkedIn sit beside Resume on the Follio. Remaining links stay in
 * the Elsewhere row so the same platform is not listed twice.
 */
export function splitFollioLinks(links: FollioLink[]): SplitFollioLinks {
  const github = links.find((link) => link.kind === 'github') ?? null;
  const linkedin = links.find((link) => link.kind === 'linkedin') ?? null;
  const promoted = new Set([github?.id, linkedin?.id].filter((id): id is string => Boolean(id)));

  return {
    github,
    linkedin,
    elsewhere: links.filter((link) => !promoted.has(link.id)),
  };
}
