/**
 * Snap View Generation Service
 *
 * Two-path generation pipeline for the recruiter-focused Snap View:
 *
 * 1. **AI Path** (primary) — Sends full profile data to GPT-4o, which
 *    distills it into a concise, impactful snap view with professional
 *    tagline, career highlights, skill clusters, and recruiter brief.
 *
 * 2. **Algorithmic Path** (fallback) — Computes snap view data from raw
 *    profile using heuristics. Used when AI is unavailable or as an
 *    instant-load fallback before AI data arrives.
 *
 * The AI path produces significantly better output: smarter taglines,
 * impact-focused highlights instead of raw bullet points, meaningful
 * skill clustering, and a compelling recruiter pitch.
 */

import { executeAICall, isAIAvailable } from '@/lib/ai-client';
import { logger } from '@/lib/logger';
import {
  buildCareerTimeline,
  buildEducation,
  buildKeyProjects,
  buildSkillClusters,
  buildTopSkills,
  computeAlgorithmicSnapView,
  computeStats,
} from '@/lib/snap-view-utils';
import type { PublicProfile } from '@/types';
import type {
  SnapCareerEntry,
  SnapEducationEntry,
  SnapProject,
  SnapSkillCluster,
  SnapViewData,
} from '@/types/snap-view';

const snapLogger = logger.child({ source: 'snap-view-service' });

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate snap view data from a public profile.
 * Attempts AI generation first, falls back to algorithmic computation.
 */
export async function generateSnapViewData(profile: PublicProfile): Promise<SnapViewData> {
  if (isAIAvailable()) {
    try {
      snapLogger.info('Generating AI-powered snap view', { handle: profile.handle });
      return await generateWithAI(profile);
    } catch (error) {
      snapLogger.error('AI snap view generation failed, falling back to algorithmic', error, {
        handle: profile.handle,
      });
    }
  }

  snapLogger.info('Using algorithmic snap view generation', { handle: profile.handle });
  return computeAlgorithmicSnapView(profile);
}

// ============================================================================
// AI GENERATION
// ============================================================================

const SNAP_SYSTEM_PROMPT = `You are an expert technical recruiter and career analyst who creates
concise, impactful candidate snapshots for hiring managers.

Your job: Transform raw resume data into a structured snap view that lets a recruiter
evaluate a candidate in under 30 seconds.

CRITICAL RULES:
1. Be SPECIFIC and QUANTITATIVE. Use numbers, percentages, scale metrics.
2. Prioritize IMPACT over responsibilities. "Led" not "Responsible for".
3. Every highlight must be a single sentence, under 15 words.
4. The recruiter brief must answer: "Why should we interview this person?"
5. Skill clusters should have clear domain names (Frontend, Backend, Cloud, Data, etc.)
6. Pick the 3 MOST impressive/relevant projects — quality over quantity.
7. The tagline should be a selling pitch, not a job title repetition.
8. Condense education to essentials: degree abbreviation, field, school, year.
9. For career timeline, show ALL positions but keep highlights razor-sharp.
10. Use active voice throughout. No passive constructions.

OUTPUT FORMAT: Return a JSON object matching this exact schema:
{
  "tagline": "One compelling professional tagline (not the headline)",
  "careerTimeline": [
    {
      "role": "Job Title",
      "company": "Company Name",
      "period": "Mon YYYY → Mon YYYY or Present",
      "highlight": "One-line impact statement under 15 words",
      "isCurrent": true/false
    }
  ],
  "education": [
    {
      "degree": "MS Computer Science",
      "institution": "University Name",
      "year": "2019",
      "distinction": "Optional: GPA or honors"
    }
  ],
  "skillClusters": [
    {
      "category": "Domain Name",
      "skills": ["Skill1", "Skill2", "Skill3"]
    }
  ],
  "keyProjects": [
    {
      "name": "Project Name",
      "impact": "One-line impact with metrics if available",
      "tech": ["Tech1", "Tech2"]
    }
  ],
  "recruiterBrief": "2-3 sentence pitch for hiring managers",
  "certifications": ["Short cert names"],
  "awards": ["Short award names"]
}`;

/** Build the user prompt with serialized profile data */
function buildUserPrompt(profile: PublicProfile): string {
  const workExperiences = (profile.workExperiences ?? []).map((w) => ({
    role: w.role,
    company: w.company,
    location: w.location,
    startDate: w.startDate,
    endDate: w.endDate,
    isCurrent: w.isCurrent,
    bullets: w.bullets,
    metrics: w.metrics,
    tags: w.tags,
  }));

  const educations = (profile.educations ?? []).map((e) => ({
    degree: e.degree,
    fieldOfStudy: e.fieldOfStudy,
    institution: e.institution,
    startDate: e.startDate,
    endDate: e.endDate,
    gpa: e.gpa,
    honors: e.honors,
    activities: e.activities,
  }));

  const skills = (profile.skills ?? []).map((s) => ({
    name: s.name,
    level: s.level,
    yearsOfExp: s.yearsOfExp,
  }));

  const skillGroups = (profile.skillGroups ?? []).map((g) => ({
    name: g.name,
    skills: g.skills.map((s) => s.name),
  }));

  const projects = (profile.projects ?? []).map((p) => ({
    title: p.title,
    description: p.description,
    techStack: p.techStack,
    repoUrl: p.repoUrl,
    githubStars: p.githubStars,
    githubForks: p.githubForks,
    githubLanguage: p.githubLanguage,
    githubTopics: p.githubTopics,
    featured: p.featured,
  }));

  const certifications = (profile.certifications ?? []).map((c) => ({
    name: c.name,
    issuer: c.issuer,
    issueDate: c.issueDate,
  }));

  const awards = (profile.awards ?? []).map((a) => ({
    title: a.title,
    issuer: a.issuer,
    date: a.date,
  }));

  const profileData = {
    fullName: `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim(),
    headline: profile.headline,
    summary: profile.summary,
    location: profile.location,
    workExperiences,
    educations,
    skills,
    skillGroups,
    projects,
    certifications,
    awards,
  };

  return `Analyze this candidate's profile and generate a structured snap view:\n\n${JSON.stringify(profileData, null, 2)}`;
}

interface AISnapViewResponse {
  tagline: string;
  careerTimeline: SnapCareerEntry[];
  education: SnapEducationEntry[];
  skillClusters: SnapSkillCluster[];
  keyProjects: SnapProject[];
  recruiterBrief: string;
  certifications: string[];
  awards: string[];
}

async function generateWithAI(profile: PublicProfile): Promise<SnapViewData> {
  const stats = computeStats(profile);

  const result = await executeAICall<AISnapViewResponse>({
    stage: 'snapViewGeneration',
    taskType: 'strategy',
    systemPrompt: SNAP_SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(profile),
    jsonMode: true,
  });

  const ai = result.data;

  snapLogger.info('AI snap view generated', {
    handle: profile.handle,
    tokensUsed: result.meta.tokensUsed,
    durationMs: result.meta.durationMs,
  });

  return {
    generatedAt: new Date().toISOString(),
    tagline: ai.tagline || '',
    stats,
    careerTimeline:
      ai.careerTimeline?.length > 0 ? ai.careerTimeline : buildCareerTimeline(profile),
    education: ai.education?.length > 0 ? ai.education : buildEducation(profile),
    skillClusters: ai.skillClusters?.length > 0 ? ai.skillClusters : buildSkillClusters(profile),
    keyProjects: ai.keyProjects?.length > 0 ? ai.keyProjects : buildKeyProjects(profile),
    recruiterBrief: ai.recruiterBrief || '',
    certifications: ai.certifications ?? [],
    awards: ai.awards ?? [],
    topSkills: buildTopSkills(profile),
    isAIGenerated: true,
  };
}
