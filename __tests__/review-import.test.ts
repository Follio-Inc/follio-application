import { describe, expect, it } from 'vitest';

import {
  mergeImportedBlogPosts,
  mergeImportedProjects,
  normalizeReviewBlogPost,
  normalizeReviewProject,
  projectDedupeKey,
} from '@/lib/onboarding/review-import';

describe('review-import helpers', () => {
  it('normalizes GitHub projects with smart visibility defaults', () => {
    const pinned = normalizeReviewProject({
      title: 'follio',
      description: 'A polished portfolio product with a clear roadmap and shipped outcomes.',
      repoUrl: 'https://github.com/acme/follio',
      ghStars: 12,
      ghForks: 3,
      ghPinned: true,
      ghOwner: 'acme',
      ghRepo: 'follio',
    });

    expect(pinned.source).toBe('GITHUB');
    expect(pinned.isVisible).toBe(true);
    expect(pinned.showOnResume).toBe(true);
    expect(pinned.showReadme).toBe(true);
    expect(pinned.showStats).toBe(true);
  });

  it('maps resume project name to title', () => {
    const fromResume = normalizeReviewProject(
      {
        name: 'Portfolio Builder',
        description: 'Built a resume-to-portfolio product.',
      },
      { forceSource: 'RESUME' }
    );

    expect(fromResume.title).toBe('Portfolio Builder');
    expect(fromResume.source).toBe('RESUME');
    expect(fromResume.isVisible).toBe(true);
  });

  it('hides low-quality repo names by default', () => {
    const low = normalizeReviewProject({
      title: 'hello-world',
      repoUrl: 'https://github.com/acme/hello-world',
      ghStars: 0,
    });
    expect(low.isVisible).toBe(false);
    expect(low.showOnPortfolio).toBe(false);
  });

  it('dedupes projects by owner/repo and url', () => {
    expect(projectDedupeKey({ ghOwner: 'Acme', ghRepo: 'Follio', title: 'Follio' })).toBe(
      'gh:acme/follio'
    );

    const existing = [
      normalizeReviewProject({
        title: 'Follio',
        repoUrl: 'https://github.com/acme/follio',
        ghOwner: 'acme',
        ghRepo: 'follio',
      }),
    ];
    const incoming = [
      normalizeReviewProject({
        title: 'Follio App',
        repoUrl: 'https://github.com/acme/follio/',
        ghOwner: 'acme',
        ghRepo: 'follio',
      }),
      normalizeReviewProject({
        title: 'Other',
        repoUrl: 'https://github.com/acme/other',
        ghOwner: 'acme',
        ghRepo: 'other',
      }),
    ];

    const merged = mergeImportedProjects(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged.map((p) => p.ghRepo)).toEqual(['follio', 'other']);
  });

  it('seeds technologies from language and topics when empty', () => {
    const project = normalizeReviewProject({
      title: 'ml-kit',
      repoUrl: 'https://github.com/acme/ml-kit',
      ghLanguage: 'Python',
      ghTopics: ['machine-learning', 'Python'],
    });
    expect(project.technologies).toEqual(['Python', 'machine-learning']);
  });

  it('normalizes and dedupes blog posts by url', () => {
    const post = normalizeReviewBlogPost({
      title: 'Shipping portfolios',
      url: 'https://medium.com/@you/shipping',
      platform: 'medium',
    });
    expect(post.source).toBe('MEDIUM');
    expect(post.tags).toEqual([]);

    const merged = mergeImportedBlogPosts(
      [{ url: 'https://medium.com/@you/shipping/' }],
      [
        post,
        normalizeReviewBlogPost({
          title: 'New post',
          url: 'https://medium.com/@you/new',
        }),
      ]
    );
    expect(merged).toHaveLength(2);
  });
});
