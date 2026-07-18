/**
 * Attached-source inventory for agents.
 *
 * Source-agnostic: whatever is on the profile (resume-derived rows, GitHub,
 * Medium/blog posts, LinkedIn link, photos, …) is reported here. Adding
 * Substack later should only require the importer to persist BlogPosts —
 * this inventory picks them up automatically.
 */

import type { CollectedProfileData } from '@/types/portfolio';

export type AttachedSourceKind =
  | 'resume'
  | 'github'
  | 'writing'
  | 'linkedin'
  | 'youtube'
  | 'photos'
  | 'links'
  | 'other';

export interface AttachedSourceSummary {
  kind: AttachedSourceKind;
  /** Human label, e.g. "Medium / blog posts" */
  label: string;
  /** True when the profile has usable items from this source. */
  attached: boolean;
  itemCount: number;
  /** Optional platform hints (medium, substack, …). */
  platforms?: string[];
  notes?: string[];
}

export function listAttachedSources(data: CollectedProfileData): AttachedSourceSummary[] {
  const writingPlatforms = [
    ...new Set(data.blogPosts.map((b) => (b.platform || '').toLowerCase()).filter(Boolean)),
  ];

  const hasResumeShaped =
    data.workExperiences.length > 0 ||
    data.education.length > 0 ||
    data.skills.length > 0 ||
    data.meta.activeSources.includes('RESUME');

  const githubProjectCount = data.projects.filter(
    (p) => !!p.github || p.source === 'GITHUB'
  ).length;

  const linkedInLinks = data.links.filter(
    (l) => l.type === 'LINKEDIN' || /linkedin\.com/i.test(l.url)
  );

  const sources: AttachedSourceSummary[] = [
    {
      kind: 'resume',
      label: 'Resume / career profile',
      attached: hasResumeShaped,
      itemCount:
        data.workExperiences.length +
        data.education.length +
        data.skills.length +
        data.projects.filter((p) => p.source !== 'GITHUB').length,
      notes: [
        `${data.workExperiences.length} experiences`,
        `${data.education.length} education`,
        `${data.skills.length} skills`,
      ],
    },
    {
      kind: 'github',
      label: 'GitHub',
      attached: !!data.github || githubProjectCount > 0,
      itemCount: githubProjectCount + (data.github ? 1 : 0),
      notes: [
        data.github
          ? `Profile @${data.github.username} (★${data.github.totalStars})`
          : 'No aggregate GitHub profile row',
        `${githubProjectCount} GitHub-linked projects`,
      ],
    },
    {
      kind: 'writing',
      label: 'Writing (Medium, Substack, blogs)',
      attached: data.blogPosts.length > 0,
      itemCount: data.blogPosts.length,
      platforms: writingPlatforms.length > 0 ? writingPlatforms : undefined,
      notes:
        data.blogPosts.length === 0
          ? ['No blog posts attached — skip writing narrative']
          : data.blogPosts.slice(0, 5).map((b) => `"${b.title}" (${b.platform || 'blog'})`),
    },
    {
      kind: 'linkedin',
      label: 'LinkedIn',
      attached: linkedInLinks.length > 0,
      itemCount: linkedInLinks.length,
      notes: linkedInLinks.map((l) => l.url),
    },
    {
      kind: 'youtube',
      label: 'YouTube',
      attached: data.youtubeVideos.length > 0,
      itemCount: data.youtubeVideos.length,
    },
    {
      kind: 'photos',
      label: 'Photos',
      attached: !!data.basics.avatarUrl || data.photos.length > 0,
      itemCount: data.photos.length + (data.basics.avatarUrl ? 1 : 0),
      notes: ['Photos are for display — do not invent visual descriptions in copy'],
    },
    {
      kind: 'links',
      label: 'Links',
      attached: data.links.length > 0,
      itemCount: data.links.length,
    },
  ];

  return sources;
}
