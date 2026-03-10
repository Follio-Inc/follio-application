/**
 * Portfolio Composition Engine
 *
 * Transforms AI pipeline outputs into the final PortfolioPlan —
 * the contract between the backend and the frontend renderer.
 *
 * This is pure logic, no AI calls. It maps:
 * - Strategy → page/section structure
 * - Narrative → section content
 * - Design Brief → style tokens + component variants
 * - Collected Data → populated content payloads
 * - Evidence → featured vs. secondary decisions
 *
 * Every output is a valid, renderable PortfolioPlan.
 */

import { logger } from '@/lib/logger';

import type {
  AboutContent,
  AwardListContent,
  BlogShowcaseContent,
  CertificationListContent,
  CollectedProfileData,
  ContactSectionContent,
  DesignBrief,
  EducationListContent,
  EvidenceExtraction,
  ExperienceHighlightsContent,
  ExperienceTimelineContent,
  FooterConfig,
  GenerationMeta,
  GitHubShowcaseContent,
  HeroContent,
  LinksSectionContent,
  NarrativeContent,
  NavigationConfig,
  PageLayout,
  PipelineDebugInfo,
  PortfolioComponentType,
  PortfolioPage,
  PortfolioPlan,
  PortfolioSection,
  PortfolioSectionType,
  PortfolioStrategy,
  PortfolioStyle,
  ProfileUnderstanding,
  ProjectGridContent,
  ProjectShowcaseContent,
  PullQuoteContent,
  SEOConfig,
  SkillsDisplayContent,
  StatsBarContent,
  ValidationReport,
  YouTubeShowcaseContent,
} from '@/types/portfolio';

const composerLogger = logger.child({ source: 'portfolio-composer' });

// ============================================================================
// COMPOSITION INPUT
// ============================================================================

export interface CompositionInput {
  collectedData: CollectedProfileData;
  understanding: ProfileUnderstanding;
  evidence: EvidenceExtraction;
  strategy: PortfolioStrategy;
  narrative: NarrativeContent;
  designBrief: DesignBrief;
  validation: ValidationReport;
  pipelineDebug: PipelineDebugInfo;
  generationMeta: GenerationMeta;
  portfolioId: string;
  version: number;
}

// ============================================================================
// MAIN COMPOSITION FUNCTION
// ============================================================================

/**
 * Compose a complete PortfolioPlan from all pipeline outputs.
 * This is the bridge between AI decisions and the renderer.
 */
export function composePortfolioPlan(input: CompositionInput): PortfolioPlan {
  const { collectedData, strategy, narrative, designBrief, generationMeta, portfolioId, version } =
    input;
  const handle = collectedData.meta.handle;

  composerLogger.info('Composing portfolio plan', {
    handle,
    pageCount: strategy.pages.length,
    theme: designBrief.colorTheme,
  });

  // Build style
  const style: PortfolioStyle = {
    colorTheme: designBrief.colorTheme,
    typeScale: designBrief.typeScale,
    animationLevel: designBrief.animationLevel,
    density: designBrief.density,
  };

  // Build pages
  const pages = strategy.pages.map((pageStrategy) => composePage(pageStrategy, input));

  // Build navigation
  const navigation = composeNavigation(strategy, collectedData, pages);

  // Build footer
  const footer: FooterConfig = {
    variant: strategy.pageCount > 1 ? 'detailed' : 'simple',
    showBranding: true,
    showLinks: true,
  };

  // Build SEO
  const seo = composeSEO(collectedData, narrative);

  const plan: PortfolioPlan = {
    id: portfolioId,
    profileId: collectedData.meta.profileId,
    handle,
    version,
    style,
    pages,
    navigation,
    footer,
    seo,
    _pipeline: input.pipelineDebug,
    _generation: generationMeta,
  };

  composerLogger.info('Portfolio plan composed', {
    handle,
    pages: pages.length,
    totalSections: pages.reduce((sum, p) => sum + p.sections.length, 0),
  });

  return plan;
}

// ============================================================================
// PAGE COMPOSITION
// ============================================================================

function composePage(
  pageStrategy: PortfolioStrategy['pages'][number],
  input: CompositionInput
): PortfolioPage {
  const { designBrief } = input;

  const layout = mapLayoutPreference(designBrief.layoutPreference);

  const sections: PortfolioSection[] = [];
  let priority = 1;

  for (const sectionType of pageStrategy.sectionTypes) {
    const section = composeSection(sectionType, priority, input);
    if (section) {
      sections.push(section);
      priority++;
    }
  }

  return {
    slug: pageStrategy.slug,
    label: pageStrategy.label,
    isPrimary: pageStrategy.isPrimary,
    layout,
    sections,
  };
}

function mapLayoutPreference(pref: string): PageLayout {
  const layoutMap: Record<string, PageLayout> = {
    'single-column': 'single-column-flow',
    split: 'two-column-split',
    magazine: 'magazine-grid',
    asymmetric: 'alternating-blocks',
  };
  return layoutMap[pref] || 'single-column-flow';
}

// ============================================================================
// SECTION COMPOSITION
// ============================================================================

function composeSection(
  sectionType: PortfolioSectionType,
  priority: number,
  input: CompositionInput
): PortfolioSection | null {
  const { designBrief, narrative } = input;
  const variant = designBrief.sectionVariants[sectionType] || 'default';

  const content = composeSectionContent(sectionType, input);
  if (!content) return null;

  const sectionIntro = narrative.sectionIntros[sectionType] || undefined;

  return {
    id: `${sectionType}-${priority}`,
    component: mapSectionToComponent(sectionType),
    variant,
    content,
    priority,
    visible: true,
    intro: sectionIntro,
  };
}

function mapSectionToComponent(sectionType: PortfolioSectionType): PortfolioComponentType {
  const map: Record<PortfolioSectionType, PortfolioComponentType> = {
    hero: 'hero',
    about: 'about',
    'experience-timeline': 'experience-timeline',
    'experience-highlights': 'experience-highlights',
    'featured-projects': 'project-showcase',
    'all-projects': 'project-grid',
    'skills-overview': 'skills-display',
    'skills-detailed': 'skills-display',
    education: 'education-list',
    certifications: 'certification-list',
    awards: 'award-list',
    'github-showcase': 'github-showcase',
    'blog-showcase': 'blog-showcase',
    'youtube-showcase': 'youtube-showcase',
    publications: 'blog-showcase',
    contact: 'contact-section',
    links: 'links-section',
    'stats-bar': 'about',
    'testimonial-quote': 'pull-quote',
    'featured-writing': 'blog-showcase',
  };
  return map[sectionType] || 'about';
}

// ============================================================================
// CONTENT COMPOSERS (per section type)
// ============================================================================

function composeSectionContent(
  sectionType: PortfolioSectionType,
  input: CompositionInput
): PortfolioSection['content'] | null {
  const { collectedData, narrative, evidence, strategy } = input;

  switch (sectionType) {
    case 'hero':
      return composeHero(collectedData, narrative, strategy);
    case 'about':
      return composeAbout(collectedData, narrative, evidence);
    case 'stats-bar':
      return composeStatsBar(collectedData);
    case 'experience-timeline':
      return composeExperienceTimeline(collectedData, narrative);
    case 'experience-highlights':
      return composeExperienceHighlights(collectedData, narrative, evidence);
    case 'featured-projects':
      return composeProjectShowcase(collectedData, narrative, evidence);
    case 'all-projects':
      return composeProjectGrid(collectedData);
    case 'skills-overview':
    case 'skills-detailed':
      return composeSkills(collectedData);
    case 'education':
      return composeEducation(collectedData);
    case 'certifications':
      return composeCertifications(collectedData);
    case 'awards':
      return composeAwards(collectedData);
    case 'github-showcase':
      return composeGitHub(collectedData, narrative);
    case 'blog-showcase':
    case 'featured-writing':
    case 'publications':
      return composeBlogShowcase(collectedData, narrative);
    case 'youtube-showcase':
      return composeYouTube(collectedData);
    case 'contact':
      return composeContact(collectedData, narrative);
    case 'links':
      return composeLinks(collectedData);
    case 'testimonial-quote':
      return composePullQuote(narrative);
    default:
      return null;
  }
}

// ─── Hero ───

function composeHero(
  data: CollectedProfileData,
  narrative: NarrativeContent,
  strategy: PortfolioStrategy
): HeroContent {
  const hasProjectsPage = strategy.pages.some(
    (p) => !p.isPrimary && p.sectionTypes.some((s) => s.includes('project'))
  );

  return {
    type: 'hero',
    headline: narrative.headline,
    subheadline: narrative.subheadline,
    avatarUrl: data.basics.avatarUrl,
    showAvatar: !!data.basics.avatarUrl,
    ctaLabel: narrative.ctaText,
    ctaTarget: '#contact',
    secondaryCta: hasProjectsPage ? { label: 'View Projects', target: '/projects' } : undefined,
  };
}

// ─── About ───

function composeAbout(
  data: CollectedProfileData,
  narrative: NarrativeContent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _evidence: EvidenceExtraction
): AboutContent {
  const highlightFacts: string[] = [];

  // Derive highlight facts from evidence
  const yearsExp = calculateYearsExperience(data);
  if (yearsExp > 0) highlightFacts.push(`${Math.round(yearsExp)}+ years experience`);

  const uniqueCompanies = [...new Set(data.workExperiences.map((w) => w.company))];
  if (uniqueCompanies.length > 1) highlightFacts.push(`${uniqueCompanies.length} companies`);

  if (data.github?.totalStars && data.github.totalStars > 10) {
    highlightFacts.push(`${data.github.totalStars} GitHub stars`);
  }

  if (data.blogPosts.length > 0) {
    highlightFacts.push(`${data.blogPosts.length} published articles`);
  }

  if (data.projects.length > 3) {
    highlightFacts.push(`${data.projects.length}+ projects`);
  }

  return {
    type: 'about',
    text: narrative.introParagraph,
    highlightFacts: highlightFacts.slice(0, 5),
  };
}

// ─── Stats Bar ───

function composeStatsBar(data: CollectedProfileData): StatsBarContent | null {
  const stats: StatsBarContent['stats'] = [];

  const yearsExp = calculateYearsExperience(data);
  if (yearsExp > 0) {
    stats.push({ label: 'Years Experience', value: `${Math.round(yearsExp)}+`, icon: 'briefcase' });
  }

  if (data.projects.length > 0) {
    stats.push({ label: 'Projects', value: String(data.projects.length), icon: 'layers' });
  }

  if (data.github?.totalStars && data.github.totalStars > 0) {
    stats.push({ label: 'GitHub Stars', value: String(data.github.totalStars), icon: 'star' });
  }

  if (data.blogPosts.length > 0) {
    stats.push({ label: 'Articles', value: String(data.blogPosts.length), icon: 'pen-tool' });
  }

  if (stats.length < 2) return null;

  return { type: 'stats-bar', stats: stats.slice(0, 4) };
}

// ─── Experience Timeline ───

function composeExperienceTimeline(
  data: CollectedProfileData,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _narrative: NarrativeContent
): ExperienceTimelineContent | null {
  if (data.workExperiences.length === 0) return null;

  return {
    type: 'experience-timeline',
    experiences: data.workExperiences.map((w) => ({
      company: w.company,
      companyLogo: w.companyLogo,
      role: w.role,
      location: w.location,
      startDate: w.startDate,
      endDate: w.endDate,
      isCurrent: w.isCurrent,
      bullets: w.bullets,
      narrative: null,
    })),
  };
}

// ─── Experience Highlights ───

function composeExperienceHighlights(
  data: CollectedProfileData,
  narrative: NarrativeContent,
  evidence: EvidenceExtraction
): ExperienceHighlightsContent | null {
  if (data.workExperiences.length === 0) return null;

  const highlights = evidence.topEvidence
    .filter((e) => e.category === 'impact' || e.category === 'leadership')
    .slice(0, 4)
    .map((e) => {
      const matchingExp = data.workExperiences.find(
        (w) =>
          e.sourceRef.toLowerCase().includes(w.company.toLowerCase()) ||
          e.claim.toLowerCase().includes(w.company.toLowerCase())
      );
      return {
        company: matchingExp?.company || '',
        role: matchingExp?.role || '',
        highlight: e.claim,
      };
    })
    .filter((h) => h.company);

  if (highlights.length === 0) return null;

  return {
    type: 'experience-highlights',
    narrative: narrative.experienceNarrative || '',
    highlights,
  };
}

// ─── Projects ───

function composeProjectShowcase(
  data: CollectedProfileData,
  narrative: NarrativeContent,
  evidence: EvidenceExtraction
): ProjectShowcaseContent | null {
  const projects = data.projects.filter(
    (p) =>
      p.featured ||
      evidence.mustFeature.some((mf) => mf.toLowerCase().includes(p.title.toLowerCase()))
  );

  // If no featured projects, take the top projects by quality
  const displayProjects = projects.length > 0 ? projects.slice(0, 6) : data.projects.slice(0, 4);

  if (displayProjects.length === 0) return null;

  return {
    type: 'project-showcase',
    projects: displayProjects.map((p) => ({
      title: p.title,
      description: p.description || p.shortDesc || '',
      narrative: narrative.projectFramings[p.title] || null,
      url: p.url,
      repoUrl: p.repoUrl,
      imageUrl: p.imageUrl,
      techStack: p.techStack,
      highlights: p.highlights,
      github: p.github
        ? {
            stars: p.github.stars,
            forks: p.github.forks,
            language: p.github.language,
          }
        : undefined,
      isFeatured: p.featured,
    })),
  };
}

function composeProjectGrid(data: CollectedProfileData): ProjectGridContent | null {
  if (data.projects.length === 0) return null;

  return {
    type: 'project-grid',
    projects: data.projects.map((p) => ({
      title: p.title,
      shortDesc: p.shortDesc || p.description?.substring(0, 120) || '',
      url: p.url,
      techStack: p.techStack,
      github: p.github ? { stars: p.github.stars, language: p.github.language } : undefined,
    })),
  };
}

// ─── Skills ───

function composeSkills(data: CollectedProfileData): SkillsDisplayContent | null {
  if (data.skills.length === 0) return null;

  const grouped = data.skillGroups
    .map((g) => ({
      name: g.name,
      skills: data.skills
        .filter((s) => s.groupName === g.name)
        .map((s) => ({ name: s.name, level: s.level })),
    }))
    .filter((g) => g.skills.length > 0);

  const ungrouped = data.skills
    .filter((s) => !s.groupName)
    .map((s) => ({ name: s.name, level: s.level }));

  return {
    type: 'skills-display',
    groups: grouped,
    ungrouped,
  };
}

// ─── Education ───

function composeEducation(data: CollectedProfileData): EducationListContent | null {
  if (data.education.length === 0) return null;

  return {
    type: 'education-list',
    entries: data.education.map((e) => ({
      institution: e.institution,
      institutionLogo: e.institutionLogo,
      degree: e.degree,
      fieldOfStudy: e.fieldOfStudy,
      startDate: e.startDate,
      endDate: e.endDate,
      isCurrent: e.isCurrent,
      gpa: e.gpa,
      honors: e.honors,
      activities: e.activities,
    })),
  };
}

// ─── Certifications ───

function composeCertifications(data: CollectedProfileData): CertificationListContent | null {
  if (data.certifications.length === 0) return null;

  return {
    type: 'certification-list',
    entries: data.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer,
      issuerLogo: c.issuerLogo,
      credentialUrl: c.credentialUrl,
      issueDate: c.issueDate,
    })),
  };
}

// ─── Awards ───

function composeAwards(data: CollectedProfileData): AwardListContent | null {
  if (data.awards.length === 0) return null;

  return {
    type: 'award-list',
    entries: data.awards.map((a) => ({
      title: a.title,
      issuer: a.issuer,
      date: a.date,
      description: a.description,
    })),
  };
}

// ─── GitHub ───

function composeGitHub(
  data: CollectedProfileData,
  narrative: NarrativeContent
): GitHubShowcaseContent | null {
  if (!data.github) return null;

  const ghProjects = data.projects
    .filter((p) => p.github)
    .sort((a, b) => (b.github?.stars ?? 0) - (a.github?.stars ?? 0));

  const languageStats = data.github.languageStats || {};
  const languages = Object.entries(languageStats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, percentage]) => ({ name, percentage }));

  return {
    type: 'github-showcase',
    username: data.github.username,
    profileUrl: data.github.htmlUrl || `https://github.com/${data.github.username}`,
    avatarUrl: data.github.avatarUrl,
    bio: data.github.bio,
    narrative: narrative.githubNarrative,
    stats: {
      publicRepos: data.github.publicRepos,
      totalStars: data.github.totalStars,
      followers: data.github.followers,
    },
    languages,
    featuredRepos: ghProjects.slice(0, 6).map((p) => ({
      name: p.title,
      description: p.description,
      url: p.repoUrl || p.url || '',
      stars: p.github?.stars ?? 0,
      forks: p.github?.forks ?? 0,
      language: p.github?.language || null,
      isPinned: p.github?.isPinned ?? false,
    })),
    organizations: data.github.organizations,
  };
}

// ─── Blog ───

function composeBlogShowcase(
  data: CollectedProfileData,
  narrative: NarrativeContent
): BlogShowcaseContent | null {
  if (data.blogPosts.length === 0) return null;

  const featured = data.blogPosts.filter((b) => b.isFeatured);
  const others = data.blogPosts.filter((b) => !b.isFeatured);
  const sorted = [...featured, ...others].slice(0, 6);

  const platforms = [...new Set(data.blogPosts.map((b) => b.platform).filter(Boolean))];

  return {
    type: 'blog-showcase',
    narrative: narrative.writingNarrative,
    platform: platforms.length === 1 ? platforms[0] : null,
    posts: sorted.map((b) => ({
      title: b.title,
      url: b.url,
      excerpt: b.excerpt,
      thumbnail: b.thumbnail,
      publishedAt: b.publishedAt,
      readTimeMin: b.readTimeMin,
      tags: b.tags,
      isFeatured: b.isFeatured,
    })),
  };
}

// ─── YouTube ───

function composeYouTube(data: CollectedProfileData): YouTubeShowcaseContent | null {
  if (data.youtubeVideos.length === 0) return null;

  const channelTitle = data.youtubeVideos[0]?.title ? null : null; // TODO: get from YouTube data

  return {
    type: 'youtube-showcase',
    channelTitle,
    videos: data.youtubeVideos.slice(0, 6).map((v) => ({
      videoId: v.videoId,
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail,
      publishedAt: v.publishedAt,
      viewCount: v.viewCount,
      duration: v.duration,
    })),
  };
}

// ─── Contact ───

function composeContact(
  data: CollectedProfileData,
  narrative: NarrativeContent
): ContactSectionContent {
  return {
    type: 'contact',
    email: data.contact.email,
    phone: data.contact.phone,
    website: data.contact.website,
    ctaText: narrative.ctaText,
    location: data.basics.location,
  };
}

// ─── Links ───

function composeLinks(data: CollectedProfileData): LinksSectionContent | null {
  if (data.links.length === 0) return null;

  return {
    type: 'links',
    links: data.links.map((l) => ({
      type: l.type,
      url: l.url,
      label: l.label || l.type,
    })),
  };
}

// ─── Pull Quote ───

function composePullQuote(narrative: NarrativeContent): PullQuoteContent | null {
  if (!narrative.pullQuote) return null;

  return {
    type: 'pull-quote',
    quote: narrative.pullQuote,
    attribution: null,
  };
}

// ============================================================================
// NAVIGATION
// ============================================================================

function composeNavigation(
  strategy: PortfolioStrategy,
  data: CollectedProfileData,
  pages: PortfolioPage[]
): NavigationConfig {
  const userName =
    [data.basics.firstName, data.basics.lastName].filter(Boolean).join(' ') || 'Portfolio';

  if (pages.length <= 1) {
    return {
      variant: 'minimal-top',
      items: [],
      showLogo: true,
      userName,
    };
  }

  return {
    variant: 'full-top',
    items: pages.map((p) => ({
      label: p.label,
      slug: p.slug,
    })),
    showLogo: true,
    userName,
  };
}

// ============================================================================
// SEO
// ============================================================================

function composeSEO(data: CollectedProfileData, narrative: NarrativeContent): SEOConfig {
  const name = [data.basics.firstName, data.basics.lastName].filter(Boolean).join(' ');

  return {
    title: name ? `${name} — Portfolio` : 'Portfolio',
    description: narrative.metaBio,
    ogImage: data.basics.avatarUrl,
    keywords: [name, data.basics.headline, ...data.skills.slice(0, 5).map((s) => s.name)].filter(
      Boolean
    ) as string[],
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name,
      jobTitle: data.basics.headline || undefined,
      description: narrative.metaBio,
      image: data.basics.avatarUrl || undefined,
      url: `https://follio.com/u/${data.meta.handle}`,
      sameAs: data.links.map((l) => l.url),
    },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function calculateYearsExperience(data: CollectedProfileData): number {
  return data.workExperiences.reduce((total, exp) => {
    const start = new Date(exp.startDate);
    const end = exp.isCurrent ? new Date() : exp.endDate ? new Date(exp.endDate) : new Date();
    const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
    return total + Math.max(0, years);
  }, 0);
}
