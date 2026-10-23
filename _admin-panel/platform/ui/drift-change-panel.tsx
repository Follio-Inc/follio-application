'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

import type { AffectedFeature, ChangeAnalysis, ChangedFile } from '../drift/change-types';

import { platformAction } from './action-styles';

/**
 * Recent change analysis (Drift intelligence, step 1).
 *
 * Sits beside item 17's drift findings without touching them: the signals stay
 * server-rendered and read-only, and this asks the server, on click, what the
 * latest commit touched.
 *
 * It sends **nothing**. The request has no body, no commit id and no range,
 * because the endpoint supports exactly one analysis. Everything rendered here
 * comes back from the server already resolved against the existing coverage
 * map — this component maps no path to a feature and looks up no test.
 *
 * What it deliberately does not do: recommend tests. Where a feature has no
 * attributed test or no pathway, it says so plainly and stops. A suggestion
 * here would be a guess wearing the coverage map's authority.
 */

const ANALYZE_ROUTE = '/api/admin/platform/drift/analyze';

/** Short, fixed labels for git's status codes. */
const STATUS_LABEL: Record<ChangedFile['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  'type-changed': 'T',
  other: '?',
};

const STATUS_TONE: Record<ChangedFile['status'], string> = {
  added: 'text-emerald-600 dark:text-emerald-400',
  modified: 'text-amber-600 dark:text-amber-400',
  deleted: 'text-rose-600 dark:text-rose-400',
  renamed: 'text-sky-600 dark:text-sky-400',
  copied: 'text-sky-600 dark:text-sky-400',
  'type-changed': 'text-muted-foreground',
  other: 'text-muted-foreground',
};

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function FileRow({ file }: { file: ChangedFile }) {
  return (
    <li className="flex gap-2 font-mono text-xs">
      <span
        className={cn('w-4 shrink-0 font-semibold', STATUS_TONE[file.status])}
        title={`${file.status} (${file.code})`}
      >
        {STATUS_LABEL[file.status]}
      </span>
      <span className="break-all">
        {file.previousPath !== null && (
          <>
            <span className="text-muted-foreground">{file.previousPath}</span>
            <span className="px-1 text-muted-foreground">&rarr;</span>
          </>
        )}
        {file.path}
      </span>
    </li>
  );
}

function FeatureBlock({ feature }: { feature: AffectedFeature }) {
  return (
    <li className="rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="text-sm font-semibold">{feature.name}</h5>
        <code className="font-mono text-xs text-muted-foreground">{feature.id}</code>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {feature.category}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {feature.featureStatus}
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Matched {feature.matchedPaths.length === 1 ? 'file' : 'files'} via{' '}
        {feature.matchedLocations.map((location, index) => (
          <span key={location}>
            {index > 0 && ', '}
            <code className="font-mono">{location}</code>
          </span>
        ))}
      </p>
      <ul className="mt-1 space-y-0.5">
        {feature.matchedPaths.map((path) => (
          <li key={path} className="break-all font-mono text-xs">
            {path}
          </li>
        ))}
      </ul>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <h6 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Attributed tests
          </h6>
          {feature.unitTests.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              The coverage map attributes no unit test to this feature.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {feature.unitTests.map((test) => (
                <li key={test} className="break-all font-mono text-xs">
                  {test}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h6 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Live QA
          </h6>
          {feature.pathways.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              This feature declares no Live QA pathway.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {feature.pathways.map((pathway) => (
                <li key={pathway.id} className="text-xs">
                  <code className="font-mono">{pathway.id}</code>
                  {pathway.title !== null ? (
                    <span className="text-muted-foreground"> — {pathway.title}</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      {' '}
                      — not in the Live QA catalog
                    </span>
                  )}
                  {pathway.spec !== null && (
                    <div className="break-all font-mono text-[11px] text-muted-foreground">
                      {pathway.spec}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {feature.labId !== null && (
        <p className="mt-2 text-xs text-muted-foreground">
          Lab: <code className="font-mono">{feature.labId}</code>
        </p>
      )}
    </li>
  );
}

export function DriftChangePanel() {
  const [analysis, setAnalysis] = useState<ChangeAnalysis | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setRunning(true);
    setError(null);
    try {
      // No body: the endpoint supports one analysis and takes no input.
      const response = await fetch(ANALYZE_ROUTE, { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as
        | ChangeAnalysis
        | { error?: string }
        | null;

      if (payload !== null && 'summary' in payload) {
        setAnalysis(payload);
        return;
      }

      setError(
        (payload as { error?: string } | null)?.error ??
          `The analysis could not be run (HTTP ${response.status}).`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be sent.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Test intelligence</h3>
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Read-only
        </span>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Analyse the latest code change to see which mapped features and existing tests may be
        affected. Features come from the coverage map and tests from each feature&rsquo;s own
        attribution — nothing here is inferred from filenames, and nothing is recommended. A changed
        file the map does not claim is listed as unmapped rather than guessed at.
      </p>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={running}
          className={platformAction({
            className: 'disabled:cursor-not-allowed disabled:opacity-60',
          })}
        >
          {running ? 'Analysing…' : 'Analyze latest commit'}
        </button>
      </div>

      {error !== null && (
        <div
          className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2"
          role="status"
        >
          <p className="text-sm">{error}</p>
        </div>
      )}

      {analysis !== null && (
        <div className="mt-5 space-y-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Latest analysis
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">{analysis.detail}</p>
          </div>

          {analysis.error !== null ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <p className="text-sm">
                <span className="font-medium">{analysis.error}</span> — nothing was analysed.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border bg-background px-3 py-2">
                  <div className="font-mono text-lg font-semibold">
                    {analysis.commit?.shortSha ?? '—'}
                  </div>
                  <div className="text-xs text-muted-foreground">Commit</div>
                </div>
                <Count label="Changed files" value={analysis.summary.changedFiles} />
                <Count label="Affected features" value={analysis.summary.affectedFeatures} />
                <Count label="Unmapped files" value={analysis.summary.unmappedFiles} />
              </div>

              {analysis.commit !== null && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Subject: </span>
                  {analysis.commit.subject}
                  {!analysis.commit.hasParent && (
                    <span className="text-muted-foreground">
                      {' '}
                      (first commit — every file counts as added)
                    </span>
                  )}
                </p>
              )}

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Changed files ({analysis.files.length})
                </h4>
                {analysis.files.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    git reports no file change for this commit.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-0.5">
                    {analysis.files.map((file) => (
                      <FileRow key={`${file.code}:${file.path}`} file={file} />
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Affected features ({analysis.features.length})
                </h4>
                {analysis.features.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    No changed file is claimed by a coverage-map feature, so the map names nothing
                    to re-test. That is a mapping gap, not a guarantee the change is safe.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {analysis.features.map((feature) => (
                      <FeatureBlock key={feature.id} feature={feature} />
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Unmapped changes ({analysis.unmapped.length})
                </h4>
                {analysis.unmapped.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Every changed file is claimed by the coverage map.
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      No feature declares these paths, so the Platform knows no coverage for them.
                    </p>
                    <ul className="mt-2 space-y-0.5">
                      {analysis.unmapped.map((path) => (
                        <li key={path} className="break-all font-mono text-xs">
                          {path}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
