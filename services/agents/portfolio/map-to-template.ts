/**
 * Map AI pipeline outputs → TemplateCopy / TemplateAIEnrichment.
 * Shared by the portfolio agent and enhanced-generation service.
 */

import { computeDataRichness } from '@/services/portfolio/data-collector.service';

import type {
  TemplateAIEnrichment,
  TemplateCopy,
  TemplateProfileData,
  TemplateSectionType,
} from '@/lib/portfolio/templates/types';
import type {
  CollectedProfileData,
  EvidenceExtraction,
  NarrativeContent,
  ProfileUnderstanding,
  ValidationReport,
} from '@/types/portfolio';

export function mapNarrativeToTemplateCopy(
  narrative: NarrativeContent,
  data: CollectedProfileData,
  normalizedProfile: TemplateProfileData
): TemplateCopy {
  const name =
    [data.basics.firstName, data.basics.lastName].filter(Boolean).join(' ') || 'Portfolio';

  return {
    heroHeadline: narrative.headline,
    heroSubtext: narrative.subheadline,
    aboutTitle: buildAboutTitle(data),
    aboutText: narrative.introParagraph,
    contactTitle: 'Let\u2019s work together',
    contactSubtext: narrative.ctaText,
    primaryCtaLabel: inferCtaLabel(normalizedProfile),
    seoTitle: `${name} \u2014 ${data.basics.headline || 'Portfolio'}`,
    seoDescription: narrative.metaBio,
    sectionIntros: mapSectionIntros(narrative.sectionIntros),
    projectNarratives: narrative.projectFramings,
    experienceNarrative: narrative.experienceNarrative ?? null,
    githubNarrative: narrative.githubNarrative ?? null,
    writingNarrative: narrative.writingNarrative ?? null,
    pullQuote: narrative.pullQuote ?? null,
  };
}

export function buildEnrichmentFromParts(args: {
  understanding: ProfileUnderstanding;
  evidence: EvidenceExtraction;
  validation: ValidationReport;
  collected: CollectedProfileData;
  pipelineStart: number;
  totalInput: number;
  totalOutput: number;
  stagesRun: string[];
}): TemplateAIEnrichment {
  const {
    understanding,
    evidence,
    validation,
    collected,
    pipelineStart,
    totalInput,
    totalOutput,
    stagesRun,
  } = args;
  const richness = computeDataRichness(collected);

  return {
    archetype: understanding.primaryArchetype,
    secondaryArchetypes: understanding.secondaryArchetypes,
    careerStage: understanding.careerStage,
    definingThemes: understanding.definingThemes,
    uniqueAngles: understanding.uniqueAngles,
    domains: understanding.domains,
    mustFeature: evidence.mustFeature,
    weakItems: evidence.weakItems,
    highlightFacts: buildHighlightFacts(collected, evidence),
    stats: buildStats(collected),
    dataRichness: richness.overall,
    validationScore: validation.overallScore,
    _meta: {
      pipelineVersion: 'agent-v2',
      generatedAt: new Date().toISOString(),
      totalDurationMs: Date.now() - pipelineStart,
      totalTokensUsed: { input: totalInput, output: totalOutput },
      stagesRun,
    },
  };
}

function buildAboutTitle(data: CollectedProfileData): string {
  const name = [data.basics.firstName, data.basics.lastName].filter(Boolean).join(' ');
  return name ? `About ${name}` : 'About Me';
}

function inferCtaLabel(profile: TemplateProfileData): string {
  const hasProjects = profile.projects.filter((p) => p.isVisible && p.showOnPortfolio).length > 0;
  return hasProjects ? 'View My Work \u2192' : 'Get In Touch \u2192';
}

function mapSectionIntros(
  pipelineIntros: Partial<Record<string, string>> | undefined
): Partial<Record<TemplateSectionType, string>> | undefined {
  if (!pipelineIntros || Object.keys(pipelineIntros).length === 0) return undefined;

  const mapping: Record<string, TemplateSectionType> = {
    about: 'about',
    'experience-timeline': 'experience',
    'experience-highlights': 'experience',
    'featured-projects': 'projects',
    'all-projects': 'projects',
    'skills-overview': 'skills',
    'skills-detailed': 'skills',
    education: 'education',
    certifications: 'certifications',
    awards: 'awards',
    'github-showcase': 'github',
    'blog-showcase': 'blog',
    'featured-writing': 'blog',
    contact: 'contact',
  };

  const mapped: Partial<Record<TemplateSectionType, string>> = {};
  for (const [pipelineKey, text] of Object.entries(pipelineIntros)) {
    if (!text) continue;
    const templateKey = mapping[pipelineKey];
    if (templateKey && !mapped[templateKey]) {
      mapped[templateKey] = text;
    }
  }

  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function buildHighlightFacts(data: CollectedProfileData, evidence: EvidenceExtraction): string[] {
  const facts: string[] = [];
  const years = calculateYearsExperience(data);
  if (years > 0) facts.push(`${Math.round(years)}+ years experience`);

  const companies = [...new Set(data.workExperiences.map((w) => w.company))];
  if (companies.length > 1) facts.push(`${companies.length} companies`);

  if (data.github?.totalStars && data.github.totalStars > 10) {
    facts.push(`${data.github.totalStars} GitHub stars`);
  }
  if (data.blogPosts.length > 0) {
    facts.push(`${data.blogPosts.length} published articles`);
  }
  if (data.projects.length > 3) {
    facts.push(`${data.projects.length}+ projects`);
  }
  if (evidence.measurableOutcomes.length > 0) {
    facts.push(evidence.measurableOutcomes[0]);
  }
  return facts.slice(0, 5);
}

function buildStats(data: CollectedProfileData): Array<{ label: string; value: string }> {
  const stats: Array<{ label: string; value: string }> = [];
  const years = calculateYearsExperience(data);
  if (years > 0) stats.push({ label: 'Years Experience', value: `${Math.round(years)}+` });
  if (data.projects.length > 0) {
    stats.push({ label: 'Projects', value: String(data.projects.length) });
  }
  if (data.github?.totalStars && data.github.totalStars > 0) {
    stats.push({ label: 'GitHub Stars', value: String(data.github.totalStars) });
  }
  if (data.blogPosts.length > 0) {
    stats.push({ label: 'Articles', value: String(data.blogPosts.length) });
  }
  return stats.slice(0, 4);
}

function calculateYearsExperience(data: CollectedProfileData): number {
  return data.workExperiences.reduce((total, exp) => {
    const start = new Date(exp.startDate);
    const end = exp.isCurrent ? new Date() : exp.endDate ? new Date(exp.endDate) : new Date();
    const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
    return total + Math.max(0, years);
  }, 0);
}
