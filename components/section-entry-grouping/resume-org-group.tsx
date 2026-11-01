import type { ReactNode } from 'react';

import { orgGroupHeaderLabel } from '@/lib/section-entry-grouping';

export function ResumeOrgGroup({
  name,
  location,
  children,
}: {
  name: string;
  location?: string | null;
  children: ReactNode;
}) {
  const label = orgGroupHeaderLabel(name, location);
  if (!label) return <>{children}</>;

  return (
    <div className="resume-org-group">
      <p className="resume-org-name">{label}</p>
      <div className="resume-org-roles">{children}</div>
    </div>
  );
}
