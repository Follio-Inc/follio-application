/**
 * Portfolio AI Pipeline — Stage E: Design Brief
 *
 * Purpose: Generate structured visual direction for the renderer.
 * Picks color theme, typography, animation level, layout preferences,
 * and section-specific component variants from a bounded vocabulary.
 *
 * The AI picks from a FIXED set of options — it cannot invent new
 * themes or styles. This ensures every choice maps to tested CSS.
 */

import { executeAICall } from '@/lib/ai-client';

import type {
  CollectedProfileData,
  DesignBrief,
  EvidenceExtraction,
  NarrativeContent,
  PortfolioSectionType,
  PortfolioStrategy,
  ProfileUnderstanding,
} from '@/types/portfolio';

// ============================================================================
// VALID OPTIONS (the bounded vocabulary)
// ============================================================================

const VALID_COLOR_THEMES = [
  'slate-professional',
  'warm-earth',
  'cool-ocean',
  'deep-night',
  'clean-minimal',
  'bold-contrast',
  'soft-sage',
  'rich-plum',
  'sunset-warm',
  'arctic-frost',
  'forest-green',
  'coral-energy',
  'indigo-depth',
  'sand-neutral',
  'rose-elegant',
] as const;

const VALID_TYPE_SCALES = ['editorial', 'technical', 'compact', 'spacious'] as const;
const VALID_ANIMATION_LEVELS = ['none', 'subtle', 'moderate'] as const;
const VALID_DENSITIES = ['airy', 'balanced', 'dense'] as const;
const VALID_LAYOUTS = ['single-column', 'split', 'magazine', 'asymmetric'] as const;

/**
 * Component variants per section type.
 * Each component offers 2-5 variants the AI can choose from.
 */
const COMPONENT_VARIANTS: Record<string, string[]> = {
  hero: ['centered', 'split', 'minimal', 'bold', 'editorial'],
  about: ['narrative', 'factual', 'timeline-intro', 'card'],
  'experience-timeline': ['detailed', 'compact', 'cards'],
  'experience-highlights': ['narrative', 'metrics-focused', 'company-logos'],
  'featured-projects': ['large-cards', 'image-heavy', 'technical', 'minimal'],
  'all-projects': ['grid', 'list', 'compact-grid'],
  'skills-overview': ['tag-cloud', 'categorized-grid', 'minimal-list'],
  'skills-detailed': ['proficiency-bars', 'categorized-detailed', 'grouped-tags'],
  education: ['timeline', 'cards', 'compact'],
  certifications: ['grid', 'list', 'badges'],
  awards: ['highlight-cards', 'list', 'compact'],
  'github-showcase': ['full-profile', 'repo-cards', 'contribution-summary', 'minimal'],
  'blog-showcase': ['medium-style', 'card-grid', 'list', 'featured-single'],
  'youtube-showcase': ['video-grid', 'featured-player', 'compact-list'],
  contact: ['simple', 'cta-focused', 'multi-channel'],
  links: ['grid', 'list', 'icon-row'],
  'stats-bar': ['inline', 'cards', 'minimal'],
  'pull-quote': ['centered', 'sidebar', 'accent-block'],
};

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are a portfolio design director. Given everything known about a person and their portfolio strategy, make visual design decisions.

You must select from FIXED OPTIONS. You cannot invent new themes, variants, or layout types.

DESIGN PHILOSOPHY:
1. Match the visual style to the person's archetype and tone:
   - Engineers: clean, technical, structured layouts → "slate-professional", "deep-night", "technical" type scale
   - Designers/Creatives: bold colors, editorial layout → "coral-energy", "rich-plum", "editorial" type scale
   - Writers: warm, readable, spacious → "warm-earth", "soft-sage", "editorial" type scale
   - Founders/Leaders: bold, high-contrast → "bold-contrast", "indigo-depth", "spacious" type scale
   - Students: clean, fresh, approachable → "clean-minimal", "arctic-frost", "compact" type scale
   - Academics: structured, dignified → "slate-professional", "forest-green", "editorial" type scale

2. Animation should be SUBTLE by default. Only use "moderate" if the person is a creative/designer.

3. Density should match data volume:
   - Sparse data → "airy" (more breathing room)
   - Rich data → "balanced" or "dense"

4. Layout preference:
   - Single column for narrative-heavy, focused portfolios
   - Split for portfolios with a sidebar element
   - Magazine for visually rich portfolios (lots of images/projects)
   - Asymmetric for creative/bold portfolios

5. Section variants should match the tone:
   - "technical" tone → "technical" project cards, "proficiency-bars" skills
   - "warm" tone → "narrative" about section, "large-cards" projects
   - "bold" tone → "bold" hero, "highlight-cards" awards

Respond with ONLY valid JSON matching the requested schema.`;

// ============================================================================
// USER PROMPT BUILDER
// ============================================================================

function buildUserPrompt(
  data: CollectedProfileData,
  understanding: ProfileUnderstanding,
  evidence: EvidenceExtraction,
  strategy: PortfolioStrategy,
  narrative: NarrativeContent
): string {
  // Collect all section types across all pages
  const allSectionTypes = strategy.pages.flatMap((p) => p.sectionTypes);
  const uniqueSectionTypes = [...new Set(allSectionTypes)];

  return `Choose visual design direction for this portfolio.

## Person
- **Name:** ${data.basics.firstName || ''} ${data.basics.lastName || ''}
- **Archetype:** ${understanding.primaryArchetype}
- **Career Stage:** ${understanding.careerStage}
- **Has Photo:** ${!!data.basics.avatarUrl}

## Strategy
- **Tone:** ${strategy.tone}
- **Content Density:** ${strategy.contentDensity}
- **Lead With:** ${strategy.leadWith}
- **Page Count:** ${strategy.pageCount}

## Data Volume
- Experiences: ${data.workExperiences.length}
- Projects: ${data.projects.length} (${data.projects.filter((p) => p.imageUrl).length} with images)
- Blog posts: ${data.blogPosts.length}
- Videos: ${data.youtubeVideos.length}
- Has GitHub: ${!!data.github}
- Skills: ${data.skills.length}

## Evidence Strengths
- Has measurable outcomes: ${evidence.measurableOutcomes.length > 0}
- Has strong writing: ${evidence.writingAssessment?.quality === 'exceptional' || evidence.writingAssessment?.quality === 'strong'}
- Has strong open source: ${evidence.openSourceCredibility?.strength === 'exceptional' || evidence.openSourceCredibility?.strength === 'strong'}
- Has pull quote: ${!!narrative.pullQuote}

## Sections Needing Variants
${uniqueSectionTypes.map((s) => `- ${s}: variants available: [${(COMPONENT_VARIANTS[s] || ['default']).join(', ')}]`).join('\n')}

## Valid Options

COLOR THEMES: ${VALID_COLOR_THEMES.join(', ')}
TYPE SCALES: ${VALID_TYPE_SCALES.join(', ')}
ANIMATION LEVELS: ${VALID_ANIMATION_LEVELS.join(', ')}
CONTENT DENSITIES: ${VALID_DENSITIES.join(', ')}
LAYOUT PREFERENCES: ${VALID_LAYOUTS.join(', ')}

---

Return a JSON object with this EXACT structure:
{
  "colorTheme": "one of the valid color themes",
  "typeScale": "one of the valid type scales",
  "animationLevel": "one of the valid animation levels",
  "density": "one of the valid content densities",
  "layoutPreference": "one of the valid layout preferences",
  "emphasis": {
    "highlightedSections": ["section types that should get extra visual weight"],
    "useHeroVisual": true/false,
    "showMetrics": true/false,
    "usePullQuotes": true/false
  },
  "sectionVariants": {
    "hero": "variant name from the available list",
    "about": "variant name",
    ...one entry for each section type in the strategy
  }
}

IMPORTANT: Only include sectionVariants for sections that appear in the portfolio strategy.
Every variant value MUST be from the available list for that section type.`;
}

// ============================================================================
// VALIDATION
// ============================================================================

/** Ensure all AI-chosen values are from the valid vocabulary. */
function validateDesignBrief(brief: DesignBrief): DesignBrief {
  // Validate color theme
  if (!VALID_COLOR_THEMES.includes(brief.colorTheme as (typeof VALID_COLOR_THEMES)[number])) {
    brief.colorTheme = 'slate-professional'; // Safe default
  }

  // Validate type scale
  if (!VALID_TYPE_SCALES.includes(brief.typeScale as (typeof VALID_TYPE_SCALES)[number])) {
    brief.typeScale = 'editorial';
  }

  // Validate animation level
  if (
    !VALID_ANIMATION_LEVELS.includes(
      brief.animationLevel as (typeof VALID_ANIMATION_LEVELS)[number]
    )
  ) {
    brief.animationLevel = 'subtle';
  }

  // Validate density
  if (!VALID_DENSITIES.includes(brief.density as (typeof VALID_DENSITIES)[number])) {
    brief.density = 'balanced';
  }

  // Validate layout preference
  if (!VALID_LAYOUTS.includes(brief.layoutPreference as (typeof VALID_LAYOUTS)[number])) {
    brief.layoutPreference = 'single-column';
  }

  // Validate section variants
  if (brief.sectionVariants) {
    for (const [sectionType, variant] of Object.entries(brief.sectionVariants)) {
      const validVariants = COMPONENT_VARIANTS[sectionType];
      const key = sectionType as PortfolioSectionType;
      if (validVariants && !validVariants.includes(variant)) {
        brief.sectionVariants[key] = validVariants[0]; // Default to first variant
      }
    }
  }

  return brief;
}

// ============================================================================
// STAGE EXECUTOR
// ============================================================================

export async function executeDesignBrief(
  data: CollectedProfileData,
  understanding: ProfileUnderstanding,
  evidence: EvidenceExtraction,
  strategy: PortfolioStrategy,
  narrative: NarrativeContent
): Promise<DesignBrief> {
  const result = await executeAICall<Omit<DesignBrief, '_meta'>>({
    stage: 'designBrief',
    taskType: 'strategy',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(data, understanding, evidence, strategy, narrative),
  });

  const validated = validateDesignBrief({ ...result.data, _meta: result.meta });

  return validated;
}

/** Exported for testing and reuse. */
export {
  COMPONENT_VARIANTS,
  VALID_ANIMATION_LEVELS,
  VALID_COLOR_THEMES,
  VALID_DENSITIES,
  VALID_LAYOUTS,
  VALID_TYPE_SCALES,
};
