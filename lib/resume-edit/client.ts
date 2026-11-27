/**
 * Browser calls for AI resume edits. Errors come back as readable messages.
 */

import type { WorkExperience } from '@prisma/client';

import type { JobRequirement } from '@/services/ai/job-requirements/types';
import type { ExpertRead } from '@/services/ai/judge/types';

import type { ChangeOutcome } from './document';
import type { ResumeEditBrief, ResumeEditSessionView } from './types';

export interface ResumeEditPatch {
  headline?: string | null;
  summary?: string | null;
  workExperiences?: WorkExperience[];
}

export interface ResumeEditResponse {
  session: ResumeEditSessionView;
  outcomes: Record<string, ChangeOutcome>;
  patch: ResumeEditPatch;
}

const FALLBACK: Record<number, string> = {
  429: "You've used today's AI edits. Try again tomorrow.",
  503: 'AI editing is unavailable right now.',
};

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('You appear to be offline. Check your connection and try again.');
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload as { error: unknown }).error
        : null;
    const message =
      error && typeof error === 'object' && 'message' in error
        ? (error as { message: unknown }).message
        : error;
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message
        : (FALLBACK[response.status] ?? 'Something went wrong. Try again in a moment.')
    );
  }
  return payload as T;
}

export function requestResumeEdits(
  brief: ResumeEditBrief,
  signal?: AbortSignal
): Promise<{ session: ResumeEditSessionView }> {
  return request('/api/resume-edits', { method: 'POST', body: JSON.stringify(brief), signal });
}

export function listResumeEdits(): Promise<{ sessions: ResumeEditSessionView[] }> {
  return request('/api/resume-edits', { method: 'GET' });
}

export function applyResumeEdits(
  sessionId: string,
  body: { apply: Array<{ id: string; text: string }>; reject: string[] }
): Promise<ResumeEditResponse> {
  return request(`/api/resume-edits/${encodeURIComponent(sessionId)}/apply`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** What a posting asks for, without its company, benefits, and legal text. */
export function requestJobRequirements(
  jobDescription: string,
  signal?: AbortSignal
): Promise<{ requirements: JobRequirement[] }> {
  return request('/api/job-requirements', {
    method: 'POST',
    body: JSON.stringify({ jobDescription }),
    signal,
  });
}

/** A recruiter's read of `resumeText` against one posting. */
export function requestJobFit(
  input: { resumeText: string; jobDescription: string },
  signal?: AbortSignal
): Promise<{ read: ExpertRead }> {
  return request('/api/job-fit', { method: 'POST', body: JSON.stringify(input), signal });
}

export function revertResumeEdits(
  sessionId: string,
  changeIds: string[] | null
): Promise<ResumeEditResponse> {
  return request(`/api/resume-edits/${encodeURIComponent(sessionId)}/revert`, {
    method: 'POST',
    body: JSON.stringify({ changeIds }),
  });
}
