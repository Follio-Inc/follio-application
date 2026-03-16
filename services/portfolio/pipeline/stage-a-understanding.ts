/**
 * Portfolio AI Pipeline — Stage A: Profile Understanding
 *
 * Purpose: Infer who the person is, what kind of work they do,
 * what themes define them, and what makes them interesting.
 *
 * This stage is the foundation — all subsequent stages build on its output.
 * Uses the light model (GPT-4o-mini) since it's structured extraction.
 */

import { executeAICall } from '@/lib/ai-client';
import { computeDataRichness } from '@/services/portfolio/data-collector.service';

import type { CollectedProfileData, ProfileUnderstanding } from '@/types/portfolio';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are a professional portfolio analyst. Your job is to deeply understand a person's professional identity from their career data.

You will receive structured data about a person: their work history, education, skills, projects, writing, open source contributions, and connected accounts.

Your task is to produce a precise analysis of WHO this person is professionally. This is not a summary — it is a forensic understanding of their identity, strengths, and defining characteristics.

IMPORTANT RULES:
1. Base ALL conclusions on the provided data. Never invent or assume facts.
2. If data is sparse, acknowledge that — don't over-interpret thin data.
3. Consider ALL data sources together. A GitHub profile with strong open source changes the story vs. someone with no GitHub.
4. Detect hybrid identities (e.g., "engineer who writes", "designer who codes").
5. Career stage should be inferred from years of experience, title seniority, and scope of work.
6. "Unique angles" should be genuine differentiators, not generic platitudes.

Respond with ONLY valid JSON matching the requested schema.`;

// ============================================================================
// USER PROMPT BUILDER
// ============================================================================

function buildUserPrompt(data: CollectedProfileData): string {
  const richness = computeDataRichness(data);

  return `Analyze this person's professional identity and return a structured understanding.

## Person's Data

**Name:** ${data.basics.firstName || 'Unknown'} ${data.basics.lastName || ''}
**Headline:** ${data.basics.headline || 'Not provided'}
**Summary:** ${data.basics.summary || 'Not provided'}
**Location:** ${data.basics.location || 'Not provided'}

**Data Sources Available:** ${data.meta.activeSources.join(', ')}
**Overall Data Completeness:** ${(data.meta.completeness * 100).toFixed(0)}%

### Work Experience (${data.workExperiences.length} entries)
${
  data.workExperiences.length > 0
    ? data.workExperiences
        .map(
          (w) =>
            `- **${w.role}** at ${w.company} (${w.startDate}–${w.isCurrent ? 'Present' : w.endDate || 'Unknown'})${w.bullets.length > 0 ? '\n  ' + w.bullets.slice(0, 4).join('\n  ') : ''}`
        )
        .join('\n')
    : 'No work experience data.'
}

### Education (${data.education.length} entries)
${
  data.education.length > 0
    ? data.education
        .map(
          (e) =>
            `- ${e.degree || 'Degree'} in ${e.fieldOfStudy || 'Unknown field'} from ${e.institution} (${e.endDate || 'Unknown'})`
        )
        .join('\n')
    : 'No education data.'
}

### Skills (${data.skills.length} skills)
${data.skills.length > 0 ? data.skills.map((s) => s.name).join(', ') : 'No skills data.'}

### Projects (${data.projects.length} projects)
${
  data.projects.length > 0
    ? data.projects
        .slice(0, 8)
        .map(
          (p) =>
            `- **${p.title}**: ${p.description || p.shortDesc || 'No description'}${p.techStack.length > 0 ? ' [' + p.techStack.join(', ') + ']' : ''}${p.github ? ` (★${p.github.stars}, forks:${p.github.forks})` : ''}`
        )
        .join('\n')
    : 'No projects data.'
}

### Writing / Blog (${data.blogPosts.length} posts)
${
  data.blogPosts.length > 0
    ? data.blogPosts
        .slice(0, 5)
        .map(
          (b) =>
            `- "${b.title}" on ${b.platform || 'Unknown platform'}${b.tags.length > 0 ? ' [' + b.tags.join(', ') + ']' : ''}`
        )
        .join('\n')
    : 'No writing data.'
}

### GitHub Profile
${
  data.github
    ? `Username: ${data.github.username}
Public repos: ${data.github.publicRepos}, Stars: ${data.github.totalStars}, Followers: ${data.github.followers}
Top languages: ${data.github.primaryLanguages.join(', ') || 'Unknown'}
Bio: ${data.github.bio || 'Not set'}
Organizations: ${data.github.organizations.map((o) => o.login).join(', ') || 'None'}`
    : 'No GitHub data.'
}

### Awards (${data.awards.length}) / Certifications (${data.certifications.length})
${data.awards.map((a) => `- Award: ${a.title} by ${a.issuer || 'Unknown'}`).join('\n')}
${data.certifications.map((c) => `- Cert: ${c.name} by ${c.issuer}`).join('\n')}

### YouTube (${data.youtubeVideos.length} videos)
${
  data.youtubeVideos.length > 0
    ? data.youtubeVideos
        .slice(0, 3)
        .map((v) => `- "${v.title}"`)
        .join('\n')
    : 'No videos.'
}

### Data Richness Scores
${Object.entries(richness.sections)
  .map(([key, val]) => `- ${key}: ${(val * 100).toFixed(0)}%`)
  .join('\n')}

---

Return a JSON object with this EXACT structure:
{
  "primaryArchetype": "one of: engineer, designer, writer, researcher, founder, product-manager, data-scientist, devops-engineer, marketer, educator, consultant, creative, analyst, operator, student, career-changer",
  "secondaryArchetypes": ["array of applicable secondary archetypes from the same list"],
  "identitySummary": "One concise sentence summarizing who this person is (internal use, not displayed)",
  "definingThemes": ["3-6 key themes that define this person, e.g., 'distributed systems', 'design thinking', 'open source advocate'"],
  "careerStage": "one of: student, early-career, mid-career, senior, executive, independent",
  "uniqueAngles": ["2-4 genuine differentiators based on the data — what makes them stand out"],
  "domains": ["industries or domains they work in, e.g., 'fintech', 'healthcare', 'developer tools'"],
  "dataRichness": {
    "overall": 0.0-1.0,
    "sections": {
      "basics": 0.0-1.0,
      "experience": 0.0-1.0,
      "education": 0.0-1.0,
      "skills": 0.0-1.0,
      "projects": 0.0-1.0,
      "writing": 0.0-1.0,
      "github": 0.0-1.0,
      "awards": 0.0-1.0,
      "certifications": 0.0-1.0
    }
  }
}`;
}

// ============================================================================
// STAGE EXECUTOR
// ============================================================================

export async function executeProfileUnderstanding(
  data: CollectedProfileData
): Promise<ProfileUnderstanding> {
  const result = await executeAICall<Omit<ProfileUnderstanding, '_meta'>>({
    stage: 'profileUnderstanding',
    taskType: 'extraction',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(data),
  });

  return {
    ...result.data,
    _meta: result.meta,
  };
}
