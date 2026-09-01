import type { NormalizedResumeData } from '@/services/import/resume-ai.service';

export type ResumeReaderSourceKind = 'upload' | 'fixture';

export type ResumeReaderFixture = {
  id: string;
  label: string;
  description: string;
  source: 'pool' | 'upload';
};

export type ResumeReaderCatalog = {
  fixtures: ResumeReaderFixture[];
  defaults: {
    fixtureId: string | null;
    maxBytes: number;
    aiAvailable: boolean;
    saveToProfile: false;
  };
};

export type ResumeReaderSummary = {
  name: string | null;
  headline: string | null;
  email: string | null;
  location: string | null;
  experiences: number;
  educations: number;
  skills: number;
  projects: number;
  links: number;
  certifications: number;
  confidence: number;
  model: string;
  processingTimeMs: number;
};

export type ResumeReaderRunResult = {
  ok: boolean;
  error?: string;
  message?: string;
  durationMs: number;
  source: {
    kind: ResumeReaderSourceKind;
    label: string;
    fixtureId?: string;
  };
  aiAvailable: boolean;
  /** Always false — this lab never writes a Follio profile. */
  savedToProfile: false;
  summary?: ResumeReaderSummary;
  data?: NormalizedResumeData;
};
