'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';
import type { KeywordMatch } from '@/services/ai/evaluate/types';
import { expertBand, type ExpertRead } from '@/services/ai/judge/types';

type KeywordSource = 'job' | 'resume';

function KeywordList({
  label,
  terms,
  tone,
}: {
  label: string;
  terms: string[];
  tone: 'present' | 'absent';
}) {
  const toneClass =
    tone === 'present'
      ? 'border-emerald-700/15 bg-emerald-500/10 text-emerald-950 dark:text-emerald-50'
      : 'border-rose-700/15 bg-rose-500/10 text-rose-950 dark:text-rose-50';
  const headingClass =
    tone === 'present'
      ? 'text-emerald-800 dark:text-emerald-200'
      : 'text-rose-800 dark:text-rose-200';

  return (
    <div className="min-w-0">
      <h4 className={cn('text-xs font-medium', headingClass)}>
        {label}
        <span className="ml-1.5 tabular-nums text-muted-foreground">{terms.length}</span>
      </h4>
      {terms.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">None</p>
      ) : (
        <ul aria-label={label} className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {terms.map((term, index) => (
            <li
              key={`${term}-${index}`}
              className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', toneClass)}
            >
              {term}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Two scores after a match: exact keyword overlap, and a recruiter's read.
 * The keyword toggle swaps which document is the source of the list.
 */
export function MatchMetrics({
  keywords,
  expert,
}: {
  keywords: KeywordMatch;
  expert: ExpertRead | null;
}) {
  const [source, setSource] = useState<KeywordSource>('job');
  const fromJob = source === 'job';
  const present = fromJob ? keywords.presentOnResume : keywords.presentInJob;
  const absent = fromJob ? keywords.missingFromResume : keywords.onlyOnResume;
  const total = present.length + absent.length;
  const coverage = total === 0 ? null : Math.round((100 * present.length) / total);
  const sentence =
    total === 0
      ? fromJob
        ? 'No distinct keywords in the job description.'
        : 'No distinct keywords on the resume.'
      : fromJob
        ? `${present.length} of ${total} job keywords are on the resume.`
        : `${present.length} of ${total} resume keywords are in the job.`;

  return (
    <section
      aria-label="Match scores"
      className="mb-3 grid max-h-[min(24rem,42%)] shrink-0 gap-3 overflow-y-auto lg:grid-cols-2"
    >
      <article className="min-w-0 rounded-2xl border border-border/70 bg-background px-4 py-3 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            ATS keywords
          </h3>
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {coverage == null ? (
              <span className="text-base font-medium text-muted-foreground">—</span>
            ) : (
              <>
                {coverage}
                <span className="text-sm font-medium text-muted-foreground">%</span>
              </>
            )}
          </p>
        </div>
        <p className="mt-1 text-sm leading-5 text-foreground">{sentence}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          A keyword counts when the same word is on the other side. React.js counts as React.
        </p>
        <div
          role="group"
          aria-label="Which keywords to list"
          className="mt-3 inline-flex rounded-full border border-border/80 p-0.5"
        >
          {(
            [
              ['job', 'From the job'],
              ['resume', 'From the resume'],
            ] as const
          ).map(([value, label]) => {
            const selected = source === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => setSource(value)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  selected
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {total > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <KeywordList
              label={fromJob ? 'On the resume' : 'In the job'}
              terms={present}
              tone="present"
            />
            <KeywordList
              label={fromJob ? 'Missing from the resume' : 'Only on the resume'}
              terms={absent}
              tone="absent"
            />
          </div>
        ) : null}
      </article>

      <article className="min-w-0 rounded-2xl border border-border/70 bg-background px-4 py-3 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Expert read
          </h3>
          {expert ? (
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {expert.score}
              <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                {expertBand(expert.score)}
              </span>
            </p>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">Unavailable</p>
          )}
        </div>
        {expert ? (
          <>
            <p className="mt-1 text-sm leading-5 text-foreground">{expert.summary}</p>
            {expert.notes.length > 0 ? (
              <ul className="mt-3 space-y-2.5">
                {expert.notes.map((note) => (
                  <li key={note.label}>
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {note.label}
                    </p>
                    <p className="mt-0.5 text-sm leading-5 text-foreground">{note.note}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            The recruiter read did not come back. Keyword match is still exact.
          </p>
        )}
      </article>
    </section>
  );
}
