/**
 * Template Copy Generation Service
 *
 * Generates AI-written copy for a template portfolio.
 * This is the ONLY AI step in the template pipeline — much simpler
 * than the old 6-stage orchestrator.
 *
 * What AI writes:
 *   - Hero headline + subtext
 *   - About section title + body
 *   - Contact section title + subtext
 *   - Primary CTA label
 *   - SEO title + description
 *
 * What AI does NOT do:
 *   - Generate code, HTML, or CSS
 *   - Select templates (that's done by default / user choice)
 *   - Choose which sections to show
 *   - Write project descriptions (those come from profile data)
 */

import { executeAICall } from '@/lib/ai-client';
import { logger } from '@/lib/logger';

import type {
  RequiredTemplateCopyField,
  TemplateCopy,
  TemplateProfileData,
} from '@/lib/portfolio/templates/types';

const copyLogger = logger.child({ source: 'template-copy-service' });

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are a professional portfolio copywriter. Your job is to write compelling, concise copy for a developer's portfolio website.

RULES:
1. Be CONCISE. Every word must earn its place.
2. Be AUTHENTIC. Write in a way that sounds like the person, not a generic template.
3. Be GROUNDED. Only reference skills, experience, and achievements that appear in the provided data. NEVER invent.
4. Be PROFESSIONAL but WARM. This is a portfolio, not a corporate resume.
5. NEVER use buzzwords like "passionate", "rockstar", "ninja", "guru", "synergy".
6. NEVER use filler phrases like "results-driven", "detail-oriented", "team player".
7. Keep the hero headline BOLD and SHORT (under 10 words).
8. The about text should be 2-3 sentences maximum.
9. CTA labels should be action-oriented with an arrow suffix.

OUTPUT FORMAT: Return valid JSON matching the exact schema below. No markdown, no code blocks.`;

// ============================================================================
// USER PROMPT BUILDER
// ============================================================================

function buildUserPrompt(profile: TemplateProfileData): string {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Anonymous';
  const headline = profile.headline || 'Professional';
  const location = profile.location || '';
  const summary = profile.summary || '';

  // Compute experience context
  const experienceYears = computeYearsFromExperiences(profile.workExperiences);
  const currentRole = profile.workExperiences.find((e) => e.isCurrent);
  const topCompanies = profile.workExperiences
    .slice(0, 3)
    .map((e) => e.company)
    .join(', ');

  // Compute skills context
  const topSkills = profile.skills
    .filter((s) => s.isVisible)
    .slice(0, 10)
    .map((s) => s.name)
    .join(', ');

  // Compute project context
  const projectCount = profile.projects.filter((p) => p.isVisible && p.showOnPortfolio).length;
  const topProjects = profile.projects
    .filter((p) => p.isVisible && p.showOnPortfolio)
    .slice(0, 3)
    .map((p) => p.title)
    .join(', ');

  // Education context
  const latestEdu = profile.educations.filter((e) => e.isVisible)[0];
  const eduStr = latestEdu
    ? `${latestEdu.degree || ''} ${latestEdu.fieldOfStudy ? `in ${latestEdu.fieldOfStudy}` : ''} from ${latestEdu.institution}`.trim()
    : '';

  const prompt = `Write portfolio copy for this person:

NAME: ${name}
HEADLINE: ${headline}
LOCATION: ${location}
SUMMARY: ${summary}
${experienceYears > 0 ? `YEARS OF EXPERIENCE: ~${experienceYears}` : ''}
${currentRole ? `CURRENT ROLE: ${currentRole.role} at ${currentRole.company}` : ''}
${topCompanies ? `COMPANIES: ${topCompanies}` : ''}
${topSkills ? `KEY SKILLS: ${topSkills}` : ''}
${projectCount > 0 ? `PROJECTS: ${projectCount} total. Notable: ${topProjects}` : ''}
${eduStr ? `EDUCATION: ${eduStr}` : ''}
${profile.github ? `GITHUB: ${profile.github.publicRepos} repos, ${profile.github.totalStars} stars, ${profile.github.followers} followers` : ''}

Return JSON with these exact fields:
{
  "heroHeadline": "Bold, short headline (e.g. 'I'm ${profile.firstName || 'a'} ${inferRole(headline)}' or similar)",
  "heroSubtext": "One brief sentence introducing them",
  "aboutTitle": "Friendly greeting title (e.g. 'Nice to meet you, I'm ${profile.firstName || name}')",
  "aboutText": "2-3 sentences about their background and what they do. Reference real data only.",
  "contactTitle": "A call-to-action heading (e.g. 'Let's build something together')",
  "contactSubtext": "One sentence inviting contact",
  "primaryCtaLabel": "CTA button text with arrow (e.g. 'View My Work →')",
  "seoTitle": "${name} — ${headline} Portfolio",
  "seoDescription": "SEO meta description, ~150 chars, factual"
}`;

  return prompt;
}

// ============================================================================
// GENERATION
// ============================================================================

/**
 * Default fallback copy when AI is unavailable or fails.
 * Never shows a broken page — always has sensible defaults.
 */
export function getDefaultCopy(profile: TemplateProfileData): TemplateCopy {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Anonymous';
  const headline = profile.headline || 'Professional';

  return {
    heroHeadline: `I'm ${profile.firstName || name}`,
    heroSubtext: headline,
    aboutTitle: `Nice to meet you, I'm ${name}`,
    aboutText: profile.summary || `${headline} with a passion for building great things.`,
    contactTitle: "Let's work together",
    contactSubtext: "I'm always open to new opportunities and collaborations.",
    primaryCtaLabel: 'View My Work →',
    seoTitle: `${name} — ${headline}`,
    seoDescription:
      `Portfolio of ${name}, ${headline}. ${profile.location ? `Based in ${profile.location}.` : ''}`.trim(),
  };
}

/**
 * Generate AI-written copy for a template portfolio.
 *
 * Falls back to sensible defaults if AI fails or is unavailable.
 */
export async function generateTemplateCopy(
  profile: TemplateProfileData
): Promise<{ copy: TemplateCopy; isAIGenerated: boolean }> {
  try {
    const userPrompt = buildUserPrompt(profile);

    const result = await executeAICall<TemplateCopy>({
      stage: 'narrativeGeneration',
      taskType: 'creative',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 1024,
      temperature: 0.5,
      jsonMode: true,
    });

    // Validate all fields are present
    const copy = result.data;
    const requiredFields: RequiredTemplateCopyField[] = [
      'heroHeadline',
      'heroSubtext',
      'aboutTitle',
      'aboutText',
      'contactTitle',
      'contactSubtext',
      'primaryCtaLabel',
      'seoTitle',
      'seoDescription',
    ];

    for (const field of requiredFields) {
      if (!copy[field] || typeof copy[field] !== 'string') {
        copyLogger.warn(`AI copy missing field: ${field}, using default`);
        const defaults = getDefaultCopy(profile);
        copy[field] = defaults[field];
      }
    }

    copyLogger.info('Template copy generated via AI', {
      tokensUsed: result.meta.tokensUsed,
      durationMs: result.meta.durationMs,
    });

    return { copy, isAIGenerated: true };
  } catch (error) {
    copyLogger.error('Failed to generate AI copy, using defaults', error);
    return { copy: getDefaultCopy(profile), isAIGenerated: false };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function computeYearsFromExperiences(
  experiences: Array<{ startDate: string | null; isCurrent: boolean }>
): number {
  if (experiences.length === 0) return 0;

  let earliest: Date | null = null;
  for (const exp of experiences) {
    if (!exp.startDate) continue;
    try {
      const d = new Date(exp.startDate);
      if (!isNaN(d.getTime()) && (!earliest || d < earliest)) {
        earliest = d;
      }
    } catch {
      // skip
    }
  }

  if (!earliest) return 0;
  return Math.max(
    1,
    Math.floor((Date.now() - earliest.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  );
}

function inferRole(headline: string): string {
  const lower = headline.toLowerCase();
  if (lower.includes('frontend') || lower.includes('front-end') || lower.includes('front end')) {
    return 'Frontend Developer';
  }
  if (lower.includes('backend') || lower.includes('back-end') || lower.includes('back end')) {
    return 'Backend Developer';
  }
  if (lower.includes('fullstack') || lower.includes('full-stack') || lower.includes('full stack')) {
    return 'Full Stack Developer';
  }
  if (lower.includes('software engineer') || lower.includes('swe')) {
    return 'Software Engineer';
  }
  if (lower.includes('data scientist') || lower.includes('data science')) {
    return 'Data Scientist';
  }
  if (lower.includes('designer') || lower.includes('ux') || lower.includes('ui')) {
    return 'Designer';
  }
  if (lower.includes('devops') || lower.includes('sre') || lower.includes('infrastructure')) {
    return 'DevOps Engineer';
  }
  if (lower.includes('mobile') || lower.includes('ios') || lower.includes('android')) {
    return 'Mobile Developer';
  }
  // Default: extract first meaningful title
  const parts = headline.split(/[|,·—–-]/);
  return parts[0]?.trim() || 'Developer';
}
