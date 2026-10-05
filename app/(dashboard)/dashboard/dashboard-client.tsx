'use client';

import { DashboardResumesSection, type DashboardResumeItem } from './dashboard-resumes-section';

export interface DashboardData {
  resumes: DashboardResumeItem[];
  activeProfileId: string | null;
  primaryProfileId: string | null;
}

interface DashboardClientProps {
  data: DashboardData;
}

/**
 * Home is the resume library. There is no separate Follio document —
 * each resume opens as a traditional resume or as its own Follio view.
 */
export function DashboardClient({ data }: DashboardClientProps) {
  const { resumes, activeProfileId, primaryProfileId } = data;

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Resumes</h1>
      <p className="max-w-xl text-sm text-muted-foreground">
        Each resume opens as a traditional resume or a Follio view.
      </p>
      <DashboardResumesSection
        initialResumes={resumes}
        initialActiveProfileId={activeProfileId}
        initialPrimaryProfileId={primaryProfileId}
      />
    </div>
  );
}
