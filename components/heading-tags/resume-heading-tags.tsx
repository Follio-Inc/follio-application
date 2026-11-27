import type { CSSProperties, ReactNode } from 'react';

import { headingTagStyle, type HeadingTag } from '@/lib/heading-tags';

export function ResumeHeadingTags({ tags }: { tags: HeadingTag[] }) {
  if (tags.length === 0) return null;

  return (
    <span className="resume-heading-tags">
      {tags.map((tag) => (
        <span
          key={tag.label}
          className="resume-heading-tag"
          style={headingTagStyle(tag) as CSSProperties}
        >
          {tag.label}
        </span>
      ))}
    </span>
  );
}

export function ResumeEntryTitle({ children, tags }: { children: ReactNode; tags: HeadingTag[] }) {
  return (
    <div className="resume-entry-title-row">
      {children}
      <ResumeHeadingTags tags={tags} />
    </div>
  );
}

export function ResumeDurationTag({ label }: { label?: string | null }) {
  if (!label) return null;
  return <span className="resume-section-tag">{label}</span>;
}

export function ResumeEntrySubtitle({
  children,
  duration,
}: {
  children?: ReactNode;
  duration?: string | null;
}) {
  if (!duration) return children ? <>{children}</> : null;

  return (
    <div className="resume-entry-subtitle-row">
      {children}
      <ResumeDurationTag label={duration} />
    </div>
  );
}
