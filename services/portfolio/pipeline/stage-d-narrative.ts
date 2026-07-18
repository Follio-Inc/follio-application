/**
 * Portfolio AI Pipeline — Stage D: Narrative Generation
 *
 * Purpose: Generate portfolio-level copy that speaks for the person.
 * Uses section writing policies + optional quality assessment so experience,
 * projects, writing, and GitHub are handled with different rules.
 */

import { executeAICall } from '@/lib/ai-client';
import {
  formatPolicyForPrompt,
  getSectionPolicy,
  type PortfolioSectionPolicyId,
} from '@/services/agents/portfolio/policies';
import { listAttachedSources } from '@/services/agents/portfolio/sources';

import type { AssessedItem } from '@/services/agents/portfolio/assess';
import type {
  CollectedProfileData,
  EvidenceExtraction,
  NarrativeContent,
  PortfolioStrategy,
  ProfileUnderstanding,
} from '@/types/portfolio';

/** Optional agent/runtime context that deepens Stage D beyond strategy alone. */
export interface NarrativeGenerationContext {
  focusNotes?: string;
  /** Pre-computed project quality assessments (from assess_content_quality). */
  projectAssessments?: AssessedItem[];
  /** Pre-computed experience quality assessments. */
  experienceAssessments?: AssessedItem[];
  /** Override attached-source detection when already known. */
  attachedSourceKinds?: string[];
}

const NARRATIVE_POLICY_IDS: PortfolioSectionPolicyId[] = [
  'hero',
  'about',
  'experience',
  'projects',
  'writing',
  'github',
  'contact',
];

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are a world-class portfolio copywriter. Your job is to write compelling, human, and authentic portfolio text for a professional.

You are NOT writing a resume. You are writing a PORTFOLIO — a page that tells the world who this person is and why they matter. Think of the best personal websites by developers, designers, and product leaders: clean, narrative-driven, memorable.

SECTION POLICIES (mandatory):
You will receive per-section writing policies (hero, about, experience, projects, writing, github, contact).
Follow each policy's goal, rules, and thin-data strategy exactly. Do not apply experience rules to projects or vice versa.

VOICE AND TONE GUIDELINES:
- Write in FIRST PERSON for the headline (e.g., "I build systems that scale.") — it's their personal site
- Write in THIRD PERSON for the intro paragraph and meta bio (e.g., "She builds systems that scale.")
- Sound confident but not arrogant
- Be specific, not generic. "Scaled payment infrastructure to 10M daily transactions" beats "Experienced engineer."
- Headlines should be punchy and memorable — 3-8 words max. They define the person's identity.
- Subheadlines provide context — current role, company, positioning (1 sentence)
- The intro paragraph (aboutText) tells a STORY in 2-4 sentences. Don't list facts — tell the arc. This should read like a well-written personal bio, not a summary of work history.
- Section intros are 1-2 sentences max that set up what follows
- Project narratives should explain WHY the project matters and WHAT impact it had, not just WHAT it is — unless the project is thin/empty, in which case follow the thin-data strategy and assessment strategy for that project
- Pull quotes should feel like genuine insight — something only this person would say. Don't force one if the data doesn't reveal a genuine perspective.
- The experience narrative should tell the STORY of their career journey in 2-3 flowing sentences. Do NOT list companies or roles — that data is already displayed. Instead, describe the arc, the evolution, what drives them.

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
11. Each project narrative should be 2-3 sentences maximum (1–2 if thin/empty per policy).
12. If a project has GitHub stats (stars, forks), weave them naturally into the narrative only when present.
13. Experience narrative should read like a career story, not a timeline recap.
14. If writing sources are NOT attached, set writingNarrative to null and omit blog-showcase intros.
15. If GitHub is NOT attached, set githubNarrative to null and omit github-showcase intros.

Respond with ONLY valid JSON matching the requested schema.`;

// ============================================================================
// USER PROMPT BUILDER (exported for tests)
// ============================================================================

export function buildNarrativeUserPrompt(
  data: CollectedProfileData,
  understanding: ProfileUnderstanding,
  evidence: EvidenceExtraction,
  strategy: PortfolioStrategy,
  context: NarrativeGenerationContext = {}
): string {
  const name =
    [data.basics.firstName, data.basics.lastName].filter(Boolean).join(' ') || 'This person';
  const currentRole = data.workExperiences.find((w) => w.isCurrent);

  const attachedKinds =
    context.attachedSourceKinds ??
    listAttachedSources(data)
      .filter((s) => s.attached)
      .map((s) => s.kind);
  const hasWriting = attachedKinds.includes('writing');
  const hasGithub = attachedKinds.includes('github');

  const policiesBlock = NARRATIVE_POLICY_IDS.map((id) =>
    formatPolicyForPrompt(getSectionPolicy(id))
  ).join('\n\n');

  const projectAssessmentByTitle = new Map(
    (context.projectAssessments ?? []).map((a) => [a.title.toLowerCase(), a])
  );

  const projectsToFrame = selectProjectsToFrame(data, evidence, projectAssessmentByTitle);

  return `Write portfolio copy for ${name}.

## Attached sources (only use these)
${attachedKinds.length > 0 ? attachedKinds.join(', ') : 'none detected'}
- Writing attached: ${hasWriting ? 'yes' : 'no — set writingNarrative to null'}
- GitHub attached: ${hasGithub ? 'yes' : 'no — set githubNarrative to null'}
${context.focusNotes ? `\n## Agent focus notes\n${context.focusNotes}` : ''}

## Section writing policies (follow exactly)
${policiesBlock}

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

## Experience quality (for experienceNarrative — not per-role bullets)
${formatExperienceAssessments(context.experienceAssessments)}

## Must-Feature Items
${evidence.mustFeature.map((item) => `- ${item}`).join('\n') || 'None'}

## Top Evidence
${evidence.topEvidence
  .slice(0, 8)
  .map((e) => `- [${e.category}] ${e.claim} (strength: ${e.strength})`)
  .join('\n')}

## Measurable Outcomes (use these exact numbers)
${evidence.measurableOutcomes.length > 0 ? evidence.measurableOutcomes.join('\n') : 'No measurable outcomes found.'}

## Writing Presence
${
  hasWriting
    ? evidence.writingAssessment
      ? `Quality: ${evidence.writingAssessment.quality}. Topics: ${evidence.writingAssessment.topTopics.join(', ')}`
      : `Attached posts: ${data.blogPosts
          .slice(0, 5)
          .map((b) => `"${b.title}" (${b.platform || 'blog'})`)
          .join('; ')}`
    : 'No writing source attached — writingNarrative must be null.'
}

## Open Source Presence
${
  hasGithub
    ? evidence.openSourceCredibility
      ? `Strength: ${evidence.openSourceCredibility.strength}. Top repos: ${evidence.openSourceCredibility.topRepos.join(', ')}. Stars: ${evidence.openSourceCredibility.totalStars}`
      : data.github
        ? `User: ${data.github.username}, Repos: ${data.github.publicRepos}, Stars: ${data.github.totalStars}, Languages: ${data.github.primaryLanguages.join(', ')}`
        : 'GitHub projects present without aggregate profile — speak only from project-level stats.'
    : 'No GitHub source attached — githubNarrative must be null.'
}

## Projects to Frame
For each project, follow its quality strategy. Use Exact Project Title as the JSON key.
${projectsToFrame || 'No featured projects to frame.'}

## Sections that Need Intros
${strategy.pages
  .flatMap((p) => p.sectionTypes)
  .filter((s) => {
    if (s === 'hero' || s === 'contact' || s === 'links') return false;
    if (!hasWriting && (s === 'blog-showcase' || s === 'featured-writing')) return false;
    if (!hasGithub && s === 'github-showcase') return false;
    return true;
  })
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
    "github-showcase": "1 sentence if applicable — omit key if GitHub not attached",
    "blog-showcase": "1 sentence if applicable — omit key if writing not attached"
  },
  "projectFramings": {
    "Exact Project Title": "Follow that project's quality strategy. Rich: polish 2-3 sentences. Thin/empty: 1-2 factual sentences from title/tech/readme/stats only — never invent a product story."
  },
  "experienceNarrative": "A career story arc in 2-3 sentences (not a timeline recap) or null if not enough data",
  "githubNarrative": "What their open source presence reveals about them, or null if GitHub not attached",
  "writingNarrative": "What their writing reveals about them, or null if writing not attached",
  "pullQuote": "A memorable, insight-driven statement that captures their professional philosophy, or null. Should feel authentic — something only they would say.",
  "ctaText": "Natural call to action text like 'Get in touch' or 'Let's connect'"
}

Only include keys in sectionIntros for sections that actually exist in the strategy and whose sources are attached.
Only include projectFramings for projects listed above.
Set narratives and pullQuote to null if data is insufficient.`;
}

function formatExperienceAssessments(assessments: AssessedItem[] | undefined): string {
  if (!assessments || assessments.length === 0) {
    return 'No per-role assessment provided — keep experienceNarrative as a high-level arc only.';
  }
  return assessments
    .slice(0, 8)
    .map((a) => `- ${a.title} [${a.quality}]: ${a.strategy}`)
    .join('\n');
}

function selectProjectsToFrame(
  data: CollectedProfileData,
  evidence: EvidenceExtraction,
  assessmentByTitle: Map<string, AssessedItem>
): string {
  const selected = data.projects
    .map((p, index) => ({ project: p, index }))
    .filter(({ project: p }) => {
      const assessment = assessmentByTitle.get(p.title.toLowerCase());
      const must =
        p.featured ||
        evidence.mustFeature.some((mf) => mf.toLowerCase().includes(p.title.toLowerCase()));
      // Include thin/empty assessed projects so the model can synthesize carefully
      const needsCare =
        assessment && (assessment.quality === 'thin' || assessment.quality === 'empty');
      return must || needsCare || p.github?.isPinned || (p.github?.stars ?? 0) >= 5;
    })
    .slice(0, 8);

  // Fallback: top projects by presence of description / stars
  const list =
    selected.length > 0
      ? selected
      : data.projects.slice(0, 6).map((project, index) => ({ project, index }));

  if (list.length === 0) return '';

  return list
    .map(({ project: p }) => {
      const assessment = assessmentByTitle.get(p.title.toLowerCase());
      const quality = assessment?.quality ?? 'unknown';
      const strategy =
        assessment?.strategy ??
        'Polish existing description if present; otherwise write a minimal factual blurb from title + tech only.';
      const readmePreview = p.github?.readme
        ? p.github.readme.replace(/\s+/g, ' ').trim().slice(0, 220)
        : null;
      return `- **${p.title}** [quality=${quality}]
  Description: ${p.description || p.shortDesc || '(none)'}
  Tech: ${p.techStack.join(', ') || 'n/a'}
  Highlights: ${p.highlights.join('; ') || 'none'}
  GitHub: ${
    p.github
      ? `★${p.github.stars} forks:${p.github.forks} lang:${p.github.language || '?'} pinned:${p.github.isPinned}`
      : 'n/a'
  }
  README excerpt: ${readmePreview || 'n/a'}
  Strategy: ${strategy}`;
    })
    .join('\n\n');
}

// ============================================================================
// STAGE EXECUTOR
// ============================================================================

export async function executeNarrativeGeneration(
  data: CollectedProfileData,
  understanding: ProfileUnderstanding,
  evidence: EvidenceExtraction,
  strategy: PortfolioStrategy,
  context: NarrativeGenerationContext = {}
): Promise<NarrativeContent> {
  const result = await executeAICall<Omit<NarrativeContent, '_meta'>>({
    stage: 'narrativeGeneration',
    taskType: 'creative',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildNarrativeUserPrompt(data, understanding, evidence, strategy, context),
  });

  const narrative = {
    ...result.data,
    _meta: result.meta,
  };

  // Hard guard: never invent writing/github narratives when sources aren't attached
  const attachedKinds =
    context.attachedSourceKinds ??
    listAttachedSources(data)
      .filter((s) => s.attached)
      .map((s) => s.kind);

  if (!attachedKinds.includes('writing')) {
    narrative.writingNarrative = null;
  }
  if (!attachedKinds.includes('github')) {
    narrative.githubNarrative = null;
  }

  return narrative;
}
