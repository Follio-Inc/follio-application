/**
 * Live QA — types for the AI-assisted pathway runner in the developer portal.
 * Intent-based journeys against a live Follio instance; no product imports.
 */

export type LiveQaArea =
  | 'Public'
  | 'Auth'
  | 'Onboarding'
  | 'Builder'
  | 'Designer'
  | 'Share'
  | 'Multi-resume'
  | 'Cover letter'
  | 'Links';

export type LiveQaStability = 'stable' | 'experimental';

export type LiveQaFixtureKind = 'none' | 'resume-pdf' | 'blank-persona';

export type LiveQaPathway = {
  id: string;
  title: string;
  description: string;
  area: LiveQaArea;
  /** Relative to live-qa/ — Playwright spec that implements this pathway */
  spec: string;
  requiresAuth: boolean;
  fixtureKind: LiveQaFixtureKind;
  stability: LiveQaStability;
  /** High-level intent steps shown in the UI (not selectors) */
  intents: string[];
  tags: string[];
};

export type LiveQaResumeFixture = {
  id: string;
  label: string;
  description: string;
  /** Absolute or repo-relative path to PDF */
  filename: string;
  source: 'pool' | 'upload';
};

export type LiveQaPersonaFixture = {
  id: string;
  label: string;
  description: string;
  filename: string;
};

export type LiveQaCatalog = {
  pathways: LiveQaPathway[];
  resumes: LiveQaResumeFixture[];
  personas: LiveQaPersonaFixture[];
  defaults: {
    baseUrl: string;
    storageStateConfigured: boolean;
    aiTriageAvailable: boolean;
  };
};

export type LiveQaRunRequest = {
  pathwayIds: string[];
  resumeFixtureId?: string;
  personaFixtureId?: string;
  /** Optional absolute path override for a one-off PDF (server-side upload) */
  customResumePath?: string;
  baseUrl?: string;
  headed?: boolean;
  triageWithAi?: boolean;
};

export type LiveQaPathwayResult = {
  pathwayId: string;
  ok: boolean;
  durationMs: number;
  summary: string;
  error?: string;
  screenshotPaths: string[];
  triage?: LiveQaTriageResult | null;
};

export type LiveQaTriageResult = {
  provider: 'anthropic' | 'openai' | 'none';
  likelyCause: string;
  suggestedFix: string;
  flakyLikelihood: 'low' | 'medium' | 'high';
  notes: string;
};

export type LiveQaRunResult = {
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  baseUrl: string;
  pathwayIds: string[];
  results: LiveQaPathwayResult[];
  stdout: string;
  stderr: string;
  artifactsDir: string | null;
};
