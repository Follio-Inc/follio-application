/**
 * Portfolio AI Pipeline — Stage B: Evidence Extraction
 *
 * Purpose: Identify the strongest proof points, measurable outcomes,
 * standout projects, writing quality, technical credibility, and
 * leadership signals from the collected data.
 *
 * This stage determines what's worth featuring prominently vs.
 * what should be secondary or omitted.
 */

import { executeAICall } from '@/lib/ai-client';

import type {
  CollectedProfileData,
  EvidenceExtraction,
  ProfileUnderstanding,
} from '@/types/portfolio';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are a portfolio evidence analyst. Given a person's professional data and a prior analysis of their identity, your job is to identify the STRONGEST proof points in their career.

Think like a hiring manager, investor, or professional peer evaluating this person's public portfolio. What stands out? What proves their claims? What's impressive?

CRITICAL RULES:
1. Every piece of evidence must reference actual data you were given. No fabrication.
2. Rate evidence strength honestly — not everything is strong.
3. "mustFeature" items should be genuinely impressive, not just "they have a GitHub."
4. "weakItems" are things that would look worse if shown prominently (e.g., a project with no description, a company with no achievements listed).
5. For writing assessment, only evaluate if blog posts are present.
6. For open source assessment, only evaluate if GitHub data is present.
7. Measurable outcomes should use exact numbers from the data, never invent metrics.
8. Be specific in evidence claims. Not "has experience" but "led infrastructure team at Stripe for 3 years."

Respond with ONLY valid JSON matching the requested schema.`;

// ============================================================================
// USER PROMPT BUILDER
// ============================================================================

function buildUserPrompt(data: CollectedProfileData, understanding: ProfileUnderstanding): string {
  return `Extract the strongest evidence and proof points for this person's portfolio.

## Prior Analysis
- **Archetype:** ${understanding.primaryArchetype} (also: ${understanding.secondaryArchetypes.join(', ') || 'none'})
- **Identity:** ${understanding.identitySummary}
- **Career Stage:** ${understanding.careerStage}
- **Defining Themes:** ${understanding.definingThemes.join(', ')}
- **Unique Angles:** ${understanding.uniqueAngles.join('; ')}

## Work Experience
${
  data.workExperiences.length > 0
    ? data.workExperiences
        .map(
          (w) =>
            `**${w.role}** at ${w.company} (${w.startDate}–${w.isCurrent ? 'Present' : w.endDate || '?'})
  Bullets: ${w.bullets.length > 0 ? w.bullets.join(' | ') : 'None'}
  Tags: ${w.tags.join(', ') || 'None'}`
        )
        .join('\n\n')
    : 'No work experience.'
}

## Projects (${data.projects.length})
${
  data.projects.length > 0
    ? data.projects
        .map(
          (p) =>
            `**${p.title}** ${p.featured ? '[FEATURED]' : ''}
  ${p.description || p.shortDesc || 'No description'}
  Tech: ${p.techStack.join(', ') || 'Unknown'}
  Highlights: ${p.highlights.join('; ') || 'None'}
  ${p.github ? `GitHub: ★${p.github.stars} forks:${p.github.forks} lang:${p.github.language || '?'} pinned:${p.github.isPinned}` : ''}`
        )
        .join('\n\n')
    : 'No projects.'
}

## Writing (${data.blogPosts.length} posts)
${
  data.blogPosts.length > 0
    ? data.blogPosts
        .map(
          (b) =>
            `"${b.title}" on ${b.platform || '?'} — ${b.excerpt?.substring(0, 150) || 'No excerpt'}
  Tags: ${b.tags.join(', ') || 'None'} | Claps: ${b.claps ?? 'N/A'} | ReadTime: ${b.readTimeMin ?? '?'}min`
        )
        .join('\n')
    : 'No writing.'
}

## GitHub
${
  data.github
    ? `Repos: ${data.github.publicRepos} | Stars: ${data.github.totalStars} | Followers: ${data.github.followers}
Languages: ${data.github.primaryLanguages.join(', ')}
Orgs: ${data.github.organizations.map((o) => o.login).join(', ') || 'None'}`
    : 'No GitHub.'
}

## Awards (${data.awards.length})
${data.awards.map((a) => `- ${a.title} by ${a.issuer || '?'}`).join('\n') || 'None'}

## Certifications (${data.certifications.length})
${data.certifications.map((c) => `- ${c.name} by ${c.issuer}`).join('\n') || 'None'}

## Skills (${data.skills.length})
${data.skills.map((s) => s.name).join(', ') || 'None'}

---

Return a JSON object with this EXACT structure:
{
  "topEvidence": [
    {
      "claim": "Specific evidence statement grounded in data",
      "sourceRef": "Which data field this comes from (e.g., 'workExperience[0].bullets[2]')",
      "strength": 0.0-1.0,
      "category": "one of: impact, technical, leadership, creative, academic, community"
    }
  ],
  "measurableOutcomes": ["Exact metrics/numbers found in the data, with context"],
  "technicalCredibility": [
    {
      "type": "one of: tech-depth, breadth, open-source, scale, recognition",
      "description": "What specifically shows this credibility",
      "strength": 0.0-1.0
    }
  ],
  "leadershipSignals": ["Specific leadership/impact evidence from the data"],
  "writingAssessment": null or {
    "hasWriting": true,
    "quality": "one of: exceptional, strong, adequate, limited",
    "topTopics": ["main topics they write about"],
    "bestPieces": ["titles of their strongest writing"]
  },
  "openSourceCredibility": null or {
    "hasOpenSource": true,
    "strength": "one of: exceptional, strong, moderate, minimal",
    "topRepos": ["names of their strongest repos"],
    "totalStars": number,
    "contributionLevel": "Brief description of their contribution pattern"
  },
  "mustFeature": ["Items that MUST be featured prominently — use exact titles/names from data"],
  "weakItems": ["Items that should be de-emphasized — use exact titles/names and explain why"]
}

Return 5-12 items in topEvidence, prioritized by strength. Be specific and honest.`;
}

// ============================================================================
// STAGE EXECUTOR
// ============================================================================

export async function executeEvidenceExtraction(
  data: CollectedProfileData,
  understanding: ProfileUnderstanding
): Promise<EvidenceExtraction> {
  const result = await executeAICall<Omit<EvidenceExtraction, '_meta'>>({
    stage: 'evidenceExtraction',
    taskType: 'extraction',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(data, understanding),
  });

  return {
    ...result.data,
    _meta: result.meta,
  };
}
