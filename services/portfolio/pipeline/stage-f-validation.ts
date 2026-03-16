/**
 * Portfolio AI Pipeline — Stage F: Validation / Grounding
 *
 * Purpose: Check every claim in the generated narrative content
 * against the source data. Flag or modify anything that appears
 * hallucinated, exaggerated, or unsupported.
 *
 * This is the safety net. Nothing invented gets through.
 * Uses the light model — this is systematic checking, not creative work.
 */

import { executeAICall } from '@/lib/ai-client';
import { logger } from '@/lib/logger';

import type { CollectedProfileData, NarrativeContent, ValidationReport } from '@/types/portfolio';

const validationLogger = logger.child({ source: 'portfolio-validation' });

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are a fact-checker for professional portfolios. Your job is to verify that every claim in the generated portfolio text is supported by the source data.

You will receive:
1. The ORIGINAL SOURCE DATA — the ground truth
2. The GENERATED NARRATIVE — text written by an AI copywriter

Your job:
- Check every factual claim in the narrative against the source data
- Flag any claim that is NOT directly supported by the data
- Suggest modifications for unsupported claims (soften, generalize, or remove)
- Score overall trustworthiness

GROUNDING RULES:
1. Job titles, companies, dates — must match source data EXACTLY
2. Metrics/numbers — must appear in the source data (bullets, descriptions)
3. Technologies/skills — must be in the skills list or project tech stacks
4. Degrees/institutions — must match education data
5. Project names/descriptions — must match project data
6. Adjectives like "led", "built", "scaled" — should be supported by bullet points
7. Inferred themes and narrative framing — acceptable if clearly derived from the data pattern
8. Generic claims ("passionate about X") — flag as ungrounded unless explicitly stated in summary

SEVERITY LEVELS:
- high: Complete fabrication (invented metric, fake company, wrong title)
- medium: Exaggeration or unsupported specific claim
- low: Minor inference or stylistic stretch that's reasonable

A portfolio PASSES validation if there are no high-severity warnings and overall score > 0.7.

Respond with ONLY valid JSON matching the requested schema.`;

// ============================================================================
// USER PROMPT BUILDER
// ============================================================================

function buildUserPrompt(data: CollectedProfileData, narrative: NarrativeContent): string {
  return `Validate this generated portfolio narrative against the source data.

## SOURCE DATA (Ground Truth)

### Name & Basic Info
- Name: ${data.basics.firstName || ''} ${data.basics.lastName || ''}
- Headline: ${data.basics.headline || 'Not provided'}
- Summary: ${data.basics.summary || 'Not provided'}
- Location: ${data.basics.location || 'Not provided'}

### Work Experience
${data.workExperiences
  .map(
    (
      w
    ) => `- ${w.role} at ${w.company} (${w.startDate}–${w.isCurrent ? 'Present' : w.endDate || '?'})
  Bullets: ${w.bullets.join(' | ') || 'None'}`
  )
  .join('\n')}

### Education
${data.education.map((e) => `- ${e.degree || '?'} in ${e.fieldOfStudy || '?'} from ${e.institution}`).join('\n') || 'None'}

### Skills
${data.skills.map((s) => s.name).join(', ') || 'None'}

### Projects
${data.projects.map((p) => `- ${p.title}: ${p.description || p.shortDesc || 'No desc'} [${p.techStack.join(', ')}]${p.github ? ` (★${p.github.stars})` : ''}`).join('\n') || 'None'}

### GitHub
${data.github ? `User: ${data.github.username}, Repos: ${data.github.publicRepos}, Stars: ${data.github.totalStars}, Followers: ${data.github.followers}` : 'No GitHub data.'}

### Blog Posts
${data.blogPosts.map((b) => `- "${b.title}" on ${b.platform || '?'}`).join('\n') || 'None'}

### Awards
${data.awards.map((a) => `- ${a.title} by ${a.issuer || '?'}`).join('\n') || 'None'}

### Certifications
${data.certifications.map((c) => `- ${c.name} by ${c.issuer}`).join('\n') || 'None'}

---

## GENERATED NARRATIVE (To Validate)

**Headline:** ${narrative.headline}
**Subheadline:** ${narrative.subheadline}
**Intro Paragraph:** ${narrative.introParagraph}
**Meta Bio:** ${narrative.metaBio}
**Experience Narrative:** ${narrative.experienceNarrative || 'None'}
**GitHub Narrative:** ${narrative.githubNarrative || 'None'}
**Writing Narrative:** ${narrative.writingNarrative || 'None'}
**Pull Quote:** ${narrative.pullQuote || 'None'}
**CTA Text:** ${narrative.ctaText}

**Section Intros:**
${
  Object.entries(narrative.sectionIntros || {})
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n') || 'None'
}

**Project Framings:**
${
  Object.entries(narrative.projectFramings || {})
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n') || 'None'
}

---

Return a JSON object with this EXACT structure:
{
  "overallScore": 0.0-1.0,
  "claimValidations": [
    {
      "claim": "The specific claim being checked",
      "location": "Where in the narrative (e.g., 'headline', 'introParagraph', 'projectFramings.ProjectName')",
      "isGrounded": true/false,
      "sourceRef": "What source data supports it (or null if ungrounded)",
      "confidence": 0.0-1.0
    }
  ],
  "warnings": [
    {
      "severity": "low/medium/high",
      "message": "What's wrong",
      "location": "Where in the narrative",
      "suggestion": "How to fix it or null"
    }
  ],
  "modifications": [
    {
      "original": "The original problematic text",
      "modified": "Suggested replacement text",
      "reason": "Why it was changed",
      "location": "Where in the narrative"
    }
  ],
  "passed": true/false
}

Be thorough. Check every factual claim. Be strict on numbers and specific claims.
Mark "passed": true only if overallScore > 0.7 and no high-severity warnings exist.`;
}

// ============================================================================
// POST-VALIDATION: Apply Modifications
// ============================================================================

/**
 * Apply validation modifications to the narrative content.
 * Only applies modifications for high and medium severity warnings.
 */
export function applyValidationFixes(
  narrative: NarrativeContent,
  report: ValidationReport
): NarrativeContent {
  if (report.passed && report.modifications.length === 0) {
    return narrative;
  }

  const fixed = { ...narrative };

  for (const mod of report.modifications) {
    // Check each narrative field for the original text and replace it
    const narrativeFields: (keyof NarrativeContent)[] = [
      'headline',
      'subheadline',
      'introParagraph',
      'metaBio',
      'experienceNarrative',
      'githubNarrative',
      'writingNarrative',
      'pullQuote',
      'ctaText',
    ];

    for (const field of narrativeFields) {
      const value = fixed[field];
      if (typeof value === 'string' && value.includes(mod.original)) {
        (fixed as Record<string, unknown>)[field] = value.replace(mod.original, mod.modified);
      }
    }

    // Check section intros
    if (fixed.sectionIntros) {
      for (const [key, value] of Object.entries(fixed.sectionIntros)) {
        if (value && value.includes(mod.original)) {
          fixed.sectionIntros[key as keyof typeof fixed.sectionIntros] = value.replace(
            mod.original,
            mod.modified
          );
        }
      }
    }

    // Check project framings
    if (fixed.projectFramings) {
      for (const [key, value] of Object.entries(fixed.projectFramings)) {
        if (value.includes(mod.original)) {
          fixed.projectFramings[key] = value.replace(mod.original, mod.modified);
        }
      }
    }
  }

  validationLogger.info('Applied validation fixes to narrative', {
    modificationsApplied: report.modifications.length,
    highSevWarnings: report.warnings.filter((w) => w.severity === 'high').length,
    overallScore: report.overallScore,
  });

  return fixed;
}

// ============================================================================
// STAGE EXECUTOR
// ============================================================================

export async function executeValidation(
  data: CollectedProfileData,
  narrative: NarrativeContent
): Promise<ValidationReport> {
  const result = await executeAICall<Omit<ValidationReport, '_meta'>>({
    stage: 'validation',
    taskType: 'extraction',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(data, narrative),
  });

  const report: ValidationReport = {
    ...result.data,
    _meta: result.meta,
  };

  // Log validation results
  validationLogger.info('Validation complete', {
    overallScore: report.overallScore,
    passed: report.passed,
    claimsChecked: report.claimValidations.length,
    warnings: report.warnings.length,
    highSevWarnings: report.warnings.filter((w) => w.severity === 'high').length,
    modifications: report.modifications.length,
  });

  return report;
}
