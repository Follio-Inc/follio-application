/**
 * Snap View Agent
 *
 * Workflow agent that distills a public profile into a recruiter-focused
 * snap view. Uses one AI step when available; falls back to algorithmic
 * computation. Product callers keep using `generateSnapViewData`.
 */

import { executeAICall, isAIAvailable } from '@/lib/ai-client';
import { runAgent } from '@/lib/agents';
import {
  buildCareerTimeline,
  buildEducation,
  buildKeyProjects,
  buildSkillClusters,
  buildTopSkills,
  computeAlgorithmicSnapView,
  computeStats,
} from '@/lib/snap-view-utils';

import type { AgentContext, AgentRunResult, WorkflowAgentDefinition } from '@/types/agents';
import type { PublicProfile } from '@/types';
import type {
  SnapCareerEntry,
  SnapEducationEntry,
  SnapProject,
  SnapSkillCluster,
  SnapViewData,
} from '@/types/snap-view';

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

/** Build the user prompt with serialized profile data (exported for tests). */
export function buildSnapViewUserPrompt(profile: PublicProfile): string {
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

function mergeAiSnap(profile: PublicProfile, ai: AISnapViewResponse): SnapViewData {
  return {
    generatedAt: new Date().toISOString(),
    tagline: ai.tagline || '',
    stats: computeStats(profile),
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

export const snapViewAgent: WorkflowAgentDefinition<PublicProfile, SnapViewData> = {
  kind: 'workflow',
  id: 'snap-view',
  version: 'agent-v1',
  steps: [
    {
      id: 'generate-ai-snap',
      description: 'Distill profile into recruiter snap view',
      run: async (memory) => {
        const profile = memory.get<PublicProfile>('__input');
        if (!profile) {
          throw new Error('Snap view agent missing profile input');
        }

        if (!isAIAvailable()) {
          memory.set('aiSnap', null);
          return;
        }

        const result = await executeAICall<AISnapViewResponse>({
          stage: 'snapViewGeneration',
          taskType: 'strategy',
          systemPrompt: SNAP_SYSTEM_PROMPT,
          userPrompt: buildSnapViewUserPrompt(profile),
          jsonMode: true,
        });

        memory.set('aiSnap', result.data);
        memory.set('aiMeta', result.meta);
      },
    },
  ],
  finalize: (memory, profile) => {
    const ai = memory.get<AISnapViewResponse | null>('aiSnap');
    if (ai) {
      return mergeAiSnap(profile, ai);
    }
    return computeAlgorithmicSnapView(profile);
  },
  fallback: (profile) => computeAlgorithmicSnapView(profile),
};

export async function runSnapViewAgent(
  profile: PublicProfile,
  ctx: AgentContext = {}
): Promise<AgentRunResult<SnapViewData>> {
  return runAgent(snapViewAgent, profile, {
    ...ctx,
    profileId: profile.id,
    budget: {
      maxSteps: 4,
      maxDurationMs: 60_000,
      ...ctx.budget,
    },
  });
}
