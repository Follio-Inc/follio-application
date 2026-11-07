import { buildResumeHighlights, type ResumeHighlightKind } from '@/lib/resume/highlights';
import { cn } from '@/lib/utils';
import type { PublicProfile } from '@/types';

const KIND_LABEL: Record<ResumeHighlightKind, string> = {
  experience: 'Experience',
  project: 'Projects',
  education: 'Education',
  award: 'Awards',
  certification: 'Certifications',
};

interface HighlightViewProps {
  profile: PublicProfile;
  className?: string;
}

/**
 * The lines a reader would mark on the resume: outcomes under the role,
 * project, or school they came from. The yellow stroke is the point —
 * everything else stays quiet so the marks can be read in one pass.
 */
export function HighlightView({ profile, className }: HighlightViewProps) {
  const { name, headline, lead, tenure, groups } = buildResumeHighlights(profile);
  const hasMarks = groups.length > 0;

  return (
    <article className={cn('resume-highlights', className)}>
      <header>
        <div className="flex items-baseline gap-2.5">
          <p className="text-eyebrow">Highlights</p>
          {tenure ? (
            <p className="text-[13px] tabular-nums text-muted-foreground">{tenure}</p>
          ) : null}
        </div>

        <h1 className="text-display mt-3 text-[2rem] text-foreground sm:text-[2.35rem]">{name}</h1>

        {headline ? (
          <p className="mt-2 max-w-prose text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            {headline}
          </p>
        ) : null}

        {lead ? (
          <p
            className={cn(
              'max-w-prose text-pretty',
              hasMarks
                ? 'mt-4 text-[15px] leading-7 text-foreground/80'
                : 'mt-8 text-[1.0625rem] leading-8 text-foreground'
            )}
          >
            {hasMarks ? lead : <mark className="resume-highlight-stroke">{lead}</mark>}
          </p>
        ) : null}
      </header>

      {hasMarks ? (
        <div className="mt-12">
          {groups.map((group, index) => {
            const kindChanged = index === 0 || groups[index - 1]?.kind !== group.kind;
            const headingId = `${group.id}-heading`;
            return (
              <section
                key={group.id}
                aria-labelledby={group.heading ? headingId : undefined}
                aria-label={group.heading ? undefined : group.lines[0]}
                className={cn(kindChanged ? (index === 0 ? '' : 'mt-12') : 'mt-8')}
              >
                {kindChanged ? <h2 className="text-eyebrow">{KIND_LABEL[group.kind]}</h2> : null}
                <div className={cn(kindChanged && 'mt-4')}>
                  {group.heading ? (
                    <h3
                      id={headingId}
                      className="text-[15px] font-medium leading-6 text-foreground"
                    >
                      {group.heading}
                    </h3>
                  ) : null}
                  {group.meta ? (
                    <p
                      className={cn(
                        'text-[13px] leading-5 text-muted-foreground',
                        group.heading && 'mt-0.5'
                      )}
                    >
                      {group.meta}
                    </p>
                  ) : null}
                  <ul
                    className={cn(
                      'list-none space-y-3 pl-0',
                      (group.heading || group.meta) && 'mt-3'
                    )}
                  >
                    {group.lines.map((line, lineIndex) => (
                      <li
                        key={`${group.id}-${lineIndex}`}
                        className="max-w-prose text-[1.0625rem] leading-8 text-foreground"
                      >
                        <mark className="resume-highlight-stroke">{line}</mark>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {!hasMarks && !lead ? (
        <p className="mt-10 rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
          Highlights show up when experience, projects, or education include outcomes.
        </p>
      ) : null}
    </article>
  );
}
