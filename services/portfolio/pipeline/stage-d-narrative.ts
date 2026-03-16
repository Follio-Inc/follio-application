/**
 * Portfolio AI Pipeline — Stage D: Narrative Generation
 *
 * Purpose: Generate portfolio-level copy that speaks for the person.
 * This is the most creative stage — it writes headlines, intros,
 * section narratives, and project framings.
 *
 * Uses the heavy model (GPT-4o) with higher temperature for creative output.
 * This is NOT resume copy. It's portfolio narrative — more human, more compelling.
 */

import { executeAICall } from '@/lib/ai-client';

import type {
  CollectedProfileData,
  EvidenceExtraction,
  NarrativeContent,
  PortfolioStrategy,
  ProfileUnderstanding,
} from '@/types/portfolio';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are a world-class portfolio copywriter. Your job is to write compelling, human, and authentic portfolio text for a professional.

You are NOT writing a resume. You are writing a PORTFOLIO — a page that tells the world who this person is and why they matter. Think of the best personal websites by developers, designers, and product leaders: clean, narrative-driven, memorable.

VOICE AND TONE GUIDELINES:
- Write in FIRST PERSON for the headline (e.g., "I build systems that scale.") — it's their personal site
- Write in THIRD PERSON for the intro paragraph and meta bio (e.g., "She builds systems that scale.")
- Sound confident but not arrogant
- Be specific, not generic. "Scaled payment infrastructure to 10M daily transactions" beats "Experienced engineer."
- Headlines should be punchy and memorable — 3-8 words max. They define the person's identity.
- Subheadlines provide context — current role, company, positioning (1 sentence)
- The intro paragraph (aboutText) tells a STORY in 2-4 sentences. Don't list facts — tell the arc. This should read like a well-written personal bio, not a summary of work history.
- Section intros are 1-2 sentences max that set up what follows
- Project narratives should explain WHY the project matters and WHAT impact it had, not just WHAT it is
- Pull quotes should feel like genuine insight — something only this person would say. Don't force one if the data doesn't reveal a genuine perspective.
- The experience narrative should tell the STORY of their career journey in 2-3 flowing sentences. Do NOT list companies or roles — that data is already displayed. Instead, describe the arc, the evolution, what drives them. Think "From building APIs at a startup to leading platform teams at scale" not "Worked at Company A, Company B, Company C."

CRITICAL — THIS IS NOT A RESUME:
- Do NOT write bullet points or bullet-style copy anywhere.
- Do NOT list skills, technologies, or achievements as items. Weave them into narrative sentences.
- Do NOT use resume language: "Responsible for", "Led a team of", "Spearheaded", "Leveraged".
- DO write like a human telling their story to someone at a coffee shop.
- DO use natural, conversational language that still sounds professional.

COPY QUALITY RULES:
1. NEVER invent facts, metrics, or achievements. Every claim must be based on provided data.
2. If the data is sparse, write shorter, simpler copy. Don't inflate thin data.
3. Match the tone specified in the portfolio strategy.
4. Feature items marked as "mustFeature" prominently in copy.
5. Don't mention items marked as "weakItems."
6. Headlines should reflect the person's actual identity, not generic platitudes.
7. NEVER use clichés: "passionate about technology", "team player", "results-driven", "detail-oriented", "hardworking" — be specific.
8. Don't use buzzwords: "synergy", "disrupt", "innovative", "cutting-edge", "leverage", "paradigm" — use plain, powerful language.
9. The metaBio should be SEO-friendly — include their name, role, and key focus areas.
10. The ctaText should feel natural and personal — "Get in touch" or "Let's talk" not "Contact me immediately."
11. Each project narrative should be 2-3 sentences maximum. Lead with impact or purpose.
12. If a project has GitHub stats (stars, forks), weave them naturally into the narrative.
13. Experience narrative should read like a career story, not a timeline recap.

Respond with ONLY valid JSON matching the requested schema.`;

// ============================================================================
// USER PROMPT BUILDER
// ============================================================================

function buildUserPrompt(
  data: CollectedProfileData,
  understanding: ProfileUnderstanding,
  evidence: EvidenceExtraction,
  strategy: PortfolioStrategy
): string {
  const name =
    [data.basics.firstName, data.basics.lastName].filter(Boolean).join(' ') || 'This person';
  const currentRole = data.workExperiences.find((w) => w.isCurrent);

  return `Write portfolio copy for ${name}.

## Identity & Strategy
- **Archetype:** ${understanding.primaryArchetype} (${understanding.secondaryArchetypes.join(', ') || 'pure'})
- **Identity:** ${understanding.identitySummary}
- **Career Stage:** ${understanding.careerStage}
- **Themes:** ${understanding.definingThemes.join(', ')}
- **Unique Angles:** ${understanding.uniqueAngles.join('; ')}
- **Tone:** ${strategy.tone}
- **Lead With:** ${strategy.leadWith}
- **Hook Strategy:** ${strategy.hookStrategy}
- **Content Density:** ${strategy.contentDensity}

## Current Position
${currentRole ? `${currentRole.role} at ${currentRole.company}` : 'Not currently employed (or not specified)'}

## Key Data Points
- **Headline on file:** ${data.basics.headline || 'None'}
- **Summary on file:** ${data.basics.summary || 'None'}
- **Location:** ${data.basics.location || 'Unknown'}
- **Total experience entries:** ${data.workExperiences.length}
- **Companies:** ${[...new Set(data.workExperiences.map((w) => w.company))].join(', ') || 'None'}

## Must-Feature Items
${evidence.mustFeature.map((item) => `- ${item}`).join('\n')}

## Top Evidence
${evidence.topEvidence
  .slice(0, 8)
  .map((e) => `- [${e.category}] ${e.claim} (strength: ${e.strength})`)
  .join('\n')}

## Measurable Outcomes (use these exact numbers)
${evidence.measurableOutcomes.length > 0 ? evidence.measurableOutcomes.join('\n') : 'No measurable outcomes found.'}

## Writing Presence
${evidence.writingAssessment ? `Quality: ${evidence.writingAssessment.quality}. Topics: ${evidence.writingAssessment.topTopics.join(', ')}` : 'No writing data.'}

## Open Source Presence
${evidence.openSourceCredibility ? `Strength: ${evidence.openSourceCredibility.strength}. Top repos: ${evidence.openSourceCredibility.topRepos.join(', ')}. Stars: ${evidence.openSourceCredibility.totalStars}` : 'No open source data.'}

## Projects to Frame
${
  data.projects
    .filter(
      (p) =>
        p.featured ||
        evidence.mustFeature.some((mf) => mf.toLowerCase().includes(p.title.toLowerCase()))
    )
    .slice(0, 6)
    .map(
      (p) =>
        `- **${p.title}**: ${p.description || p.shortDesc || 'No description'} [${p.techStack.join(', ')}]`
    )
    .join('\n') || 'No featured projects to frame.'
}

## Sections that Need Intros
${strategy.pages
  .flatMap((p) => p.sectionTypes)
  .filter((s) => s !== 'hero' && s !== 'contact' && s !== 'links')
  .join(', ')}

## Items to Avoid Mentioning
${evidence.weakItems.join('; ') || 'None'}

---

Return a JSON object with this EXACT structure:
{
  "headline": "Bold, punchy headline (3-8 words). FIRST PERSON. Not a job title — an identity statement. e.g., 'I build systems that scale.' or 'Code. Ship. Iterate.' or 'Making data tell stories.'",
  "subheadline": "Context line, 1 sentence. Current role + company or positioning. e.g., 'Staff Engineer at Stripe. Previously Cloudflare.'",
  "introParagraph": "2-4 sentences. THIRD PERSON narrative. Tells the story of who they are. NOT a list of skills. Should flow naturally.",
  "metaBio": "1 sentence. SEO-friendly. Includes name, role, and focus areas. For meta tags.",
  "sectionIntros": {
    "about": "1-2 sentences introducing the about/story section (optional)",
    "experience-timeline": "1 sentence if needed",
    "featured-projects": "1 sentence if applicable",
    "github-showcase": "1 sentence if applicable",
    "blog-showcase": "1 sentence if applicable"
  },
  "projectFramings": {
    "Exact Project Title": "2-3 sentences explaining this project. Lead with WHY it matters or WHAT problem it solves. Include impact. Be specific."
  },
  "experienceNarrative": "A career story arc in 2-3 sentences (not a timeline recap) or null if not enough data",
  "githubNarrative": "What their open source presence reveals about them or null",
  "writingNarrative": "What their writing reveals about them or null",
  "pullQuote": "A memorable, insight-driven statement that captures their professional philosophy, or null. Should feel authentic — something only they would say.",
  "ctaText": "Natural call to action text like 'Get in touch' or 'Let's connect'"
}

Only include keys in sectionIntros for sections that actually exist in the strategy.
Only include projectFramings for projects that should be featured.
Set narratives and pullQuote to null if data is insufficient.`;
}

// ============================================================================
// STAGE EXECUTOR
// ============================================================================

export async function executeNarrativeGeneration(
  data: CollectedProfileData,
  understanding: ProfileUnderstanding,
  evidence: EvidenceExtraction,
  strategy: PortfolioStrategy
): Promise<NarrativeContent> {
  const result = await executeAICall<Omit<NarrativeContent, '_meta'>>({
    stage: 'narrativeGeneration',
    taskType: 'creative',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(data, understanding, evidence, strategy),
  });

  return {
    ...result.data,
    _meta: result.meta,
  };
}
