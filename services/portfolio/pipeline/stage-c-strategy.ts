/**
 * Portfolio AI Pipeline — Stage C: Portfolio Strategy
 *
 * Purpose: Decide the overall portfolio structure — how many pages,
 * what sections, what order, what tone, and what to emphasize.
 *
 * This is the "creative director" stage. It decides the architecture
 * of the portfolio based on understanding + evidence.
 * Uses the heavy model (GPT-4o) since these are judgment calls.
 */

import { executeAICall } from '@/lib/ai-client';

import type {
  CollectedProfileData,
  EvidenceExtraction,
  PortfolioStrategy,
  ProfileUnderstanding,
} from '@/types/portfolio';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are a portfolio strategist. Given a person's professional analysis and their strongest evidence, decide the optimal structure for their portfolio.

You are making ARCHITECTURAL decisions about the portfolio:
- How many pages (1 = single scroll, 2+ = multi-page mini-site)
- What sections go on each page
- What order creates the best narrative flow
- How dense the content should be
- What the tone should be
- What should lead the page (headline hook strategy)

RULES:
1. SINGLE PAGE if the person has limited data (< 3 rich sections). Don't create empty pages.
2. MULTI-PAGE only if there's enough content to justify separate pages (e.g., 5+ strong projects warrant a projects page, 3+ blog posts warrant a writing page).
3. A page with fewer than 3 meaningful items should NOT exist as a separate page — fold its content into the home page.
4. The HOME page should always be a highlight reel — best of everything, with links to deep-dive pages.
5. Section order matters. Lead with the person's strongest content. An engineer with amazing projects should lead with projects, not education.
6. Tone should match the archetype and career stage. A student's portfolio reads differently from a VP's.
7. The "hookStrategy" is the most important field — it defines the first thing visitors read. Make it count.

SECTION TYPES YOU CAN USE:
hero, about, experience-timeline, experience-highlights, featured-projects, all-projects, skills-overview, skills-detailed, education, certifications, awards, github-showcase, blog-showcase, youtube-showcase, publications, contact, links, stats-bar, testimonial-quote, featured-writing

PAGE SLUGS: Use "home" for the primary page. Other common slugs: "projects", "writing", "experience", "about"

Respond with ONLY valid JSON matching the requested schema.`;

// ============================================================================
// USER PROMPT BUILDER
// ============================================================================

function buildUserPrompt(
  data: CollectedProfileData,
  understanding: ProfileUnderstanding,
  evidence: EvidenceExtraction
): string {
  // Count meaningful items per section
  const counts = {
    experience: data.workExperiences.length,
    education: data.education.length,
    skills: data.skills.length,
    projects: data.projects.length,
    blogPosts: data.blogPosts.length,
    videos: data.youtubeVideos.length,
    awards: data.awards.length,
    certs: data.certifications.length,
    hasGitHub: !!data.github,
    hasAvatar: !!data.basics.avatarUrl,
  };

  return `Decide the optimal portfolio structure for this person.

## Identity
- **Name:** ${data.basics.firstName || ''} ${data.basics.lastName || ''}
- **Archetype:** ${understanding.primaryArchetype} (also: ${understanding.secondaryArchetypes.join(', ') || 'none'})
- **Identity:** ${understanding.identitySummary}
- **Career Stage:** ${understanding.careerStage}
- **Themes:** ${understanding.definingThemes.join(', ')}
- **Unique Angles:** ${understanding.uniqueAngles.join('; ')}

## Data Richness
${Object.entries(understanding.dataRichness.sections)
  .map(([k, v]) => `- ${k}: ${(v * 100).toFixed(0)}%`)
  .join('\n')}

## Content Counts
- Work experiences: ${counts.experience}
- Education: ${counts.education}
- Skills: ${counts.skills}
- Projects: ${counts.projects}
- Blog posts: ${counts.blogPosts}
- YouTube videos: ${counts.videos}
- Awards: ${counts.awards}
- Certifications: ${counts.certs}
- GitHub profile: ${counts.hasGitHub ? 'Yes' : 'No'}
- Has photo: ${counts.hasAvatar ? 'Yes' : 'No'}

## Strongest Evidence
Must-feature items: ${evidence.mustFeature.join('; ')}
Top evidence: ${evidence.topEvidence
    .slice(0, 5)
    .map((e) => `${e.claim} (${e.category}, strength:${e.strength})`)
    .join('; ')}
Weak items to omit: ${evidence.weakItems.join('; ')}

${evidence.writingAssessment ? `Writing quality: ${evidence.writingAssessment.quality}` : 'No writing data.'}
${evidence.openSourceCredibility ? `Open source: ${evidence.openSourceCredibility.strength}` : 'No open source data.'}

---

Return a JSON object with this EXACT structure:
{
  "pageCount": 1 or more,
  "pages": [
    {
      "slug": "home",
      "label": "Home",
      "purpose": "Brief description of this page's role",
      "sectionTypes": ["hero", "about", "featured-projects", "skills-overview", "contact"],
      "isPrimary": true,
      "minimumItemsRequired": 0
    }
  ],
  "contentDensity": "one of: minimal, moderate, rich",
  "leadWith": "one of: narrative, evidence, projects, experience",
  "tone": "one of: professional, bold, warm, technical, creative, academic, minimal",
  "hookStrategy": "A description of what the hero section hook should communicate (this guides narrative generation)"
}

IMPORTANT:
- Every portfolio must have exactly one page with isPrimary: true and slug: "home"
- Every home page must start with "hero" section type
- Every portfolio must end with "contact" on the home page
- The sectionTypes array defines the ORDER sections appear on that page
- Only include section types where there is actual data to show
- Don't add "github-showcase" if there's no GitHub data
- Don't add "blog-showcase" if there are no blog posts
- Don't add "youtube-showcase" if there are no videos
- Don't add "awards" or "certifications" if none exist`;
}

// ============================================================================
// STAGE EXECUTOR
// ============================================================================

export async function executePortfolioStrategy(
  data: CollectedProfileData,
  understanding: ProfileUnderstanding,
  evidence: EvidenceExtraction
): Promise<PortfolioStrategy> {
  const result = await executeAICall<Omit<PortfolioStrategy, '_meta'>>({
    stage: 'portfolioStrategy',
    taskType: 'strategy',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(data, understanding, evidence),
  });

  // Validate: ensure at least one primary page exists
  const strategy = result.data;
  const hasPrimary = strategy.pages.some((p) => p.isPrimary);
  if (!hasPrimary && strategy.pages.length > 0) {
    strategy.pages[0].isPrimary = true;
    strategy.pages[0].slug = 'home';
  }

  // Ensure hero is first on the primary page
  const primaryPage = strategy.pages.find((p) => p.isPrimary);
  if (primaryPage && primaryPage.sectionTypes[0] !== 'hero') {
    primaryPage.sectionTypes = ['hero', ...primaryPage.sectionTypes.filter((s) => s !== 'hero')];
  }

  return {
    ...strategy,
    _meta: result.meta,
  };
}
