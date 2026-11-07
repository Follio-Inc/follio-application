/**
 * Read a job posting's requirements with a model. Postings arrive with the
 * whole page pasted, so the model's job is mostly to leave things out.
 * Results are cached per posting: the panel's live score and the writing
 * plan for the same posting share one call.
 */

import { createHash } from 'node:crypto';

import { executeAICall } from '@/lib/ai-client';
import { logger } from '@/lib/logger';

import { categoryNames } from '@/services/ai/skills/catalog';

import { parseJobRequirements } from './parse';
import { JOB_REQUIREMENT_LIMITS, type JobRequirement } from './types';

const log = logger.child({ source: 'job-requirements' });

const CACHE_LIMIT = 100;
const cache = new Map<string, JobRequirement[]>();
const inFlight = new Map<string, Promise<JobRequirement[] | null>>();

export const JOB_REQUIREMENTS_SYSTEM_PROMPT = `You read a job posting and list what the job asks a candidate to have.

People paste the whole page: the company story, mission, benefits, salary, perks, office locations, equal-opportunity and legal statements, privacy notices, and how to apply. Ignore all of that. List only what the candidate needs for this job.

Each item has a kind:
- "tool": a named technology, language, framework, platform, or product, e.g. Python, Kubernetes, Salesforce, Figma.
- "practice": a concrete skill or method, e.g. distributed systems, A/B testing, financial modeling, SEO.
- "domain": an industry or business area the candidate should know, e.g. payments, healthcare, B2B SaaS.
- "credential": a degree, certification, or license, e.g. Bachelor's in Computer Science, CPA.

Never list soft skills or traits (communication, teamwork, ownership, passion), years of experience, seniority, job titles, locations, work arrangements, or anything from the company, benefits, or legal text.

importance is "required" when the posting requires it or lists it under requirements or qualifications, and "preferred" when it says nice to have, bonus, preferred, or a plus.

term is the shortest name for the thing, written exactly as the posting writes it. Put one thing in each item: "Python or Go" is two items.

aliases are up to ${JOB_REQUIREMENT_LIMITS.maxAliases} other names a resume might use for exactly the same thing, e.g. "Postgres" for PostgreSQL, "k8s" for Kubernetes, "DBMS" for database management systems. Never a related but different thing: JavaScript is not Java, AWS is not GCP. Use [] when there are none.

broader is up to ${JOB_REQUIREMENT_LIMITS.maxBroader} broader skills the item belongs to, chosen from this list when one fits: ${categoryNames().join(', ')}. Use [] when none fits.

For a degree, write one item with kind "credential" and add "degree": { "level": "diploma" | "associate" | "bachelors" | "masters" | "doctorate" | null, "fields": string[], "orRelated": boolean }. level is the lowest level accepted, or null for any degree. fields are the fields named, e.g. ["Computer Science", "Engineering"], or a group like ["technical field"]. orRelated is true when it says "or a related field", "or equivalent", or similar. "BS/MS in Computer Science or related field" is one item: level "bachelors", fields ["Computer Science"], orRelated true. Other items have "degree": null.

Return JSON:
{ "requirements": [ { "term": string, "kind": "tool" | "practice" | "domain" | "credential", "importance": "required" | "preferred", "aliases": string[], "broader": string[], "degree": object | null } ] }

At most ${JOB_REQUIREMENT_LIMITS.maxItems} items, most important first. Return { "requirements": [] } when the text asks for nothing specific.`;

export function buildJobRequirementsUserPrompt(jobDescription: string): string {
  return `JOB POSTING
"""
${jobDescription.trim()}
"""`;
}

/** Bump when the prompt or the stored shape changes. */
const CACHE_VERSION = 2;

function cacheKey(jobDescription: string): string {
  const normalized = jobDescription.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(`${CACHE_VERSION}\u0000${normalized}`).digest('hex');
}

function remember(key: string, requirements: JobRequirement[]) {
  cache.delete(key);
  cache.set(key, requirements);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

async function extract(jobDescription: string): Promise<JobRequirement[] | null> {
  try {
    const result = await executeAICall<unknown>({
      stage: 'jobRequirements',
      taskType: 'extraction',
      temperature: 0,
      systemPrompt: JOB_REQUIREMENTS_SYSTEM_PROMPT,
      userPrompt: buildJobRequirementsUserPrompt(jobDescription),
      jsonMode: true,
    });
    const requirements = parseJobRequirements(result.data, jobDescription);
    if (!requirements) {
      log.warn('Job requirements were discarded');
      return null;
    }
    log.info('Job requirements ready', { count: requirements.length });
    return requirements;
  } catch (error) {
    log.error('Job requirements failed', error);
    return null;
  }
}

/** The posting's requirements, or null when the model is unavailable or unusable. */
export async function readJobRequirements(
  jobDescription: string
): Promise<JobRequirement[] | null> {
  const key = cacheKey(jobDescription);
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = extract(jobDescription)
    .then((requirements) => {
      if (requirements) remember(key, requirements);
      return requirements;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
