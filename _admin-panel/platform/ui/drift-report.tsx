import { cn } from '@/lib/utils';

import type {
  MapEntryProposal,
  ProposalCertainty,
  TestDraftProposal,
} from '../drift/proposal-types';
import type {
  DriftCategoryRow,
  DriftCount,
  DriftEntry,
  DriftFindingGroup,
  DriftSeverity,
  DriftSignalView,
  DriftView,
} from '../drift/view-types';

/**
 * The drift scan, in the browser (PLATFORM_TODO item 17).
 *
 * A server component that renders a prop. It imports the view's **types**
 * only, so the scanner — which walks the repository and loads the TypeScript
 * compiler — cannot follow it into a browser bundle. The route runs the scan
 * and passes the view down.
 *
 * Read-only, by item 17. There is no button here: nothing accepts a
 * suggestion, edits the coverage map, quarantines or deletes. Those are items
 * 18 and 19. A browser refresh re-runs the scan, which is the only "action"
 * this page has.
 *
 * Item 19's destructive panel arrives through a slot, as the Test Console's
 * runners do: it is a client component and this stays a server one, and a
 * control that removes a file has no business being rendered by the same
 * function that lists informational gaps.
 *
 * Item 18 added the proposals: review-only drafts of the edit a person might
 * make, hanging off the finding they belong to, plus draft unit tests for
 * features the map lists no test for. There is still no button. A proposal is
 * text — the exact field, the exact reference, the evidence, and what is still
 * open — and the page says on every one of them that nothing has been applied.
 * Applying anything is a person's job in an editor; quarantine and delete are
 * item 19.
 *
 * Three tiers, because conflating them is what makes a drift report useless:
 * a **contradiction** is a term in the scanner's own `ok` and is why the scan
 * fails; an **inconsistency** is the map or the catalog naming something that
 * is not there, which the scan does not currently fail on and which says so;
 * a **gap** is something real that nothing claims, recorded and never a
 * defect. The verdict at the top is the scanner's `ok`, printed as it came.
 */

const SEVERITY_LABELS: Record<DriftSeverity, string> = {
  contradiction: 'Fails the scan',
  inconsistency: 'Does not fail the scan',
  gap: 'Recorded gap',
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

function Count({ count, tone }: { count: DriftCount; tone?: 'bad' | 'warn' }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{count.label}</p>
      <p
        className={cn(
          'mt-0.5 text-base font-semibold tabular-nums',
          tone === 'bad' && count.value > 0 && 'text-red-600 dark:text-red-400',
          tone === 'warn' && count.value > 0 && 'text-amber-600 dark:text-amber-500'
        )}
      >
        {count.value}
      </p>
      {count.hint !== undefined && (
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{count.hint}</p>
      )}
    </div>
  );
}

const CERTAINTY_LABELS: Record<ProposalCertainty, string> = {
  certain: 'evidence names the target',
  ambiguous: 'several targets fit',
  unresolved: 'no target in the report',
};

const ACTION_LABELS: Record<MapEntryProposal['action'], string> = {
  add: 'Add',
  move: 'Move',
  remove: 'Remove',
};

/** Lines a person would read and then type themselves. Never executed. */
function Preview({ lines }: { lines: string[] }) {
  return (
    <pre className="mt-2 overflow-x-auto whitespace-pre rounded bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
      {lines.join('\n')}
    </pre>
  );
}

function Evidence({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;

  return (
    <div className="mt-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="mt-0.5 space-y-0.5">
        {lines.map((line) => (
          <li key={line} className="text-[11px] leading-relaxed text-muted-foreground">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MapEntryProposalBlock({ proposal }: { proposal: MapEntryProposal }) {
  return (
    <details className="rounded-lg border border-sky-500/30 bg-sky-500/5">
      <summary className="cursor-pointer px-3 py-2">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
            Proposed map entry
          </span>
          <span className="text-xs font-semibold">
            {ACTION_LABELS[proposal.action]} <code className="font-mono">{proposal.field}</code>
            {proposal.featureId !== null && (
              <>
                {' '}
                on <code className="font-mono">{proposal.featureId}</code>
              </>
            )}
            {proposal.action !== 'add' && proposal.fromFeatureId !== null && (
              <>
                {' '}
                from <code className="font-mono">{proposal.fromFeatureId}</code>
              </>
            )}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {proposal.certainty} — {CERTAINTY_LABELS[proposal.certainty]}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            not applied
          </span>
        </span>
      </summary>

      <div className="border-t px-3 py-2">
        <Evidence title="Why" lines={proposal.evidence} />

        {proposal.candidates.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Candidates — pick one by hand
            </p>
            <ul className="mt-0.5 space-y-1">
              {proposal.candidates.map((candidate) => (
                <li key={candidate.target} className="text-[11px] text-muted-foreground">
                  <code className="font-mono text-foreground">{candidate.target}</code>
                  {candidate.evidence.length > 0 && <> — {candidate.evidence.join('; ')}</>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Suggested edit to <code className="font-mono">{proposal.editFile}</code>
        </p>
        <Preview lines={proposal.preview} />

        {proposal.needsDecision !== null && (
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-500">
            Still open: {proposal.needsDecision}
          </p>
        )}
      </div>
    </details>
  );
}

function TestDraftBlock({ draft }: { draft: TestDraftProposal }) {
  return (
    <details className="rounded-lg border border-sky-500/30 bg-sky-500/5">
      <summary className="cursor-pointer px-3 py-2">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
            Draft test
          </span>
          <code className="font-mono text-xs font-semibold">{draft.featureId}</code>
          <span className="text-xs text-muted-foreground">
            {draft.featureName} · {draft.category}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            not written
          </span>
        </span>
      </summary>

      <div className="border-t px-3 py-2">
        <Evidence title="Why" lines={draft.evidence} />
        <Evidence title="Left for a person" lines={draft.placeholders} />

        <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Suggested path <code className="font-mono">{draft.suggestedPath}</code>
        </p>
        <pre className="mt-1 max-h-96 overflow-auto whitespace-pre rounded bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {draft.draft}
        </pre>
      </div>
    </details>
  );
}

function EntryRow({ entry }: { entry: DriftEntry }) {
  return (
    <li className="border-t px-4 py-2 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <code className="font-mono text-xs text-foreground">{entry.label}</code>
        {entry.detail !== null && (
          <span className="text-xs text-muted-foreground">{entry.detail}</span>
        )}
      </div>
      {entry.evidence.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {entry.evidence.map((item) => (
            <li key={item} className="font-mono text-[11px] leading-relaxed text-muted-foreground">
              {item}
            </li>
          ))}
        </ul>
      )}

      {entry.proposals.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {entry.proposals.map((proposal) => (
            <MapEntryProposalBlock key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
    </li>
  );
}

function FindingGroup({ group }: { group: DriftFindingGroup }) {
  const total = group.entries.length + group.omitted;
  // Failures are open; recorded gaps are one click away. A page that opens
  // with forty green-adjacent lists buries the one that matters.
  const open = group.severity !== 'gap';

  return (
    <details
      open={open}
      className={cn(
        'rounded-lg border',
        group.severity === 'contradiction' && 'border-red-500/40 bg-red-500/5',
        group.severity === 'inconsistency' && 'border-amber-500/40 bg-amber-500/5',
        group.severity === 'gap' && 'bg-background'
      )}
    >
      <summary className="cursor-pointer px-4 py-2">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold">{group.title}</span>
          <span className="text-sm tabular-nums text-muted-foreground">({total})</span>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              group.severity === 'contradiction' && 'bg-red-500/10 text-red-700 dark:text-red-400',
              group.severity === 'inconsistency' &&
                'bg-amber-500/10 text-amber-700 dark:text-amber-500',
              group.severity === 'gap' && 'bg-muted text-muted-foreground'
            )}
          >
            {SEVERITY_LABELS[group.severity]}
          </span>
        </span>
        <span className="mt-1 block max-w-3xl text-xs text-muted-foreground">{group.note}</span>
        {group.notActionable !== null && (
          <span className="mt-1 block max-w-3xl text-[11px] text-muted-foreground">
            No proposal: {group.notActionable}
          </span>
        )}
      </summary>

      <ul className="border-t">
        {group.entries.map((entry) => (
          <EntryRow key={`${entry.label}:${entry.detail ?? ''}`} entry={entry} />
        ))}
      </ul>

      {group.omitted > 0 && (
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          {group.omitted} more not shown. The full list is in{' '}
          <code className="font-mono">npm run platform:scan</code>.
        </p>
      )}
    </details>
  );
}

function CategoryTable({ rows, counts }: { rows: DriftCategoryRow[]; counts: DriftCount[] }) {
  const largest = counts.find((count) => count.label === 'Large');

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-left text-xs">
        <thead className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">Size</th>
            <th className="px-3 py-2 text-right font-medium">Features</th>
            <th className="px-3 py-2 text-right font-medium">Shipped</th>
            <th className="px-3 py-2 text-right font-medium">Flagged</th>
            <th className="px-3 py-2 text-right font-medium">Unshipped</th>
            <th className="px-3 py-2 text-right font-medium">Deprecated</th>
            <th className="px-3 py-2 text-right font-medium">With tests</th>
            <th className="px-3 py-2 text-right font-medium">With pathway</th>
            <th className="px-3 py-2 text-right font-medium">With lab</th>
            <th className="px-3 py-2 text-right font-medium">Contradictions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.category} className="border-t">
              <td className="px-3 py-2 font-medium">{row.category}</td>
              <td className="px-3 py-2 text-muted-foreground">{row.size}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.features}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.shipped}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.flagged}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.unshipped}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.deprecated}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.featuresWithTests}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.featuresWithPathway}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.featuresWithLab}</td>
              <td
                className={cn(
                  'px-3 py-2 text-right tabular-nums',
                  row.contradictions > 0 && 'font-semibold text-red-600 dark:text-red-400'
                )}
              >
                {row.contradictions}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.some((row) => row.regroup !== null) && (
        <div className="border-t px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Advisory regroup suggestions
          </p>
          <ul className="mt-1 space-y-0.5">
            {rows
              .filter((row) => row.regroup !== null)
              .map((row) => (
                <li key={row.category} className="text-[11px] text-muted-foreground">
                  <span className="font-medium">{row.category}</span>: {row.regroup}
                </li>
              ))}
          </ul>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Advisory only: nothing in this signal fails the scan, and no category is regrouped from
            this page.
            {largest !== undefined &&
              largest.hint !== undefined &&
              ` A category is called large ${largest.hint}.`}
          </p>
        </div>
      )}
    </div>
  );
}

function SignalSection({
  signal,
  categories,
  categoryCounts,
}: {
  signal: DriftSignalView;
  categories: DriftCategoryRow[];
  categoryCounts: DriftCount[];
}) {
  const contradictions = signal.groups.filter((group) => group.severity === 'contradiction');
  const inconsistencies = signal.groups.filter((group) => group.severity === 'inconsistency');
  const gaps = signal.groups.filter((group) => group.severity === 'gap');

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{signal.title}</h3>
          <code className="font-mono text-[11px] text-muted-foreground">{signal.signal}</code>
          {signal.healthy ? (
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              No disagreement
            </span>
          ) : (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                contradictions.length > 0
                  ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-500'
              )}
            >
              {contradictions.length > 0 ? 'Contradiction' : 'Inconsistency'}
            </span>
          )}
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{signal.checks}</p>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {signal.counts.map((count) => (
          <Count
            key={count.label}
            count={count}
            tone={
              count.hint?.includes('this is drift')
                ? 'bad'
                : count.label === 'Unclaimed' || count.label === 'Orphan'
                  ? 'warn'
                  : undefined
            }
          />
        ))}
      </div>

      {signal.healthy && <p className="mt-3 text-sm text-muted-foreground">{signal.healthyNote}</p>}

      {(contradictions.length > 0 || inconsistencies.length > 0) && (
        <div className="mt-3 space-y-2">
          {[...contradictions, ...inconsistencies].map((group) => (
            <FindingGroup key={group.id} group={group} />
          ))}
        </div>
      )}

      {gaps.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Recorded gaps — not drift
          </p>
          <div className="mt-1 space-y-2">
            {gaps.map((group) => (
              <FindingGroup key={group.id} group={group} />
            ))}
          </div>
        </div>
      )}

      {signal.signal === 'category-health' && categories.length > 0 && (
        <CategoryTable rows={categories} counts={categoryCounts} />
      )}
    </section>
  );
}

export function DriftReportView({
  view,
  quarantinePanel,
  changePanel,
}: {
  view: DriftView;
  /** Item 19's destructive panel, when the route supplies one. */
  quarantinePanel?: React.ReactNode;
  /**
   * The Drift-intelligence change analysis, when the route supplies one.
   *
   * A slot, like the quarantine panel: it ships JavaScript and asks the server
   * a question on click, while everything above it stays server-rendered. The
   * findings above are unaffected by whether it is passed.
   */
  changePanel?: React.ReactNode;
}) {
  const { summary } = view;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Drift</h2>
          <Pill>Read-only</Pill>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The same scan{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run platform:scan</code> runs,
          read in the browser. Every count and every finding below comes from the scanner&rsquo;s
          own typed report — this page re-derives nothing and changes nothing. Proposing map entries
          is PLATFORM_TODO item 18; quarantine and delete are item 19.
        </p>
      </header>

      <section
        className={cn(
          'rounded-xl border px-5 py-4',
          view.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
        )}
      >
        <h3 className="text-sm font-semibold">
          {view.ok
            ? 'No drift found — the repository matches the coverage map'
            : `Drift found in ${summary.signalsWithContradictions} of ${summary.signals} signals`}
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {view.ok
            ? 'Nothing the scanner treats as a contradiction is outstanding. The gaps below are recorded on purpose: they are things the product does not have yet, not things that are wrong.'
            : 'A contradiction means the coverage map and the repository disagree about something that cannot be true of both. Each one is listed under the signal that found it.'}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Scanned at {view.scannedAt} · took {view.durationMs} ms · measured around this
          page&rsquo;s own call, since the report carries no timestamp of its own. Reload to scan
          again.
        </p>
      </section>

      <section>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Count count={{ label: 'Signals', value: summary.signals }} />
          <Count
            count={{
              label: 'Clean signals',
              value: summary.healthySignals,
              hint: 'no disagreement found',
            }}
          />
          <Count
            count={{
              label: 'Signals with a contradiction',
              value: summary.signalsWithContradictions,
            }}
            tone="bad"
          />
          <Count
            count={{
              label: 'Contradictions',
              value: summary.contradictions,
              hint: 'these fail the scan',
            }}
            tone="bad"
          />
          <Count
            count={{
              label: 'Inconsistencies',
              value: summary.inconsistencies,
              hint: 'disagreements the scan does not fail on',
            }}
            tone="warn"
          />
          <Count count={{ label: 'Gaps', value: summary.gaps, hint: 'recorded, not drift' }} />
        </div>
        <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
          Counts are of the findings below. A list longer than {view.entryCap} entries says how many
          it left out rather than cutting silently.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Proposals</h3>
          <Pill>Review only</Pill>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {view.proposals.total === 0
            ? 'Nothing to propose. A proposal appears under a finding when the report carries evidence to act on, and beside a feature the map lists no test for.'
            : 'Each one describes an edit a person would make by hand. Nothing here has been applied: the coverage map is not written to, no file is created, and there is no button that would do either. Proposing is as far as this page goes — quarantine and delete are item 19.'}
        </p>

        {view.proposals.total > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Count count={{ label: 'Proposals', value: view.proposals.total }} />
            <Count count={{ label: 'Map entries', value: view.proposals.mapEntries }} />
            <Count count={{ label: 'Draft tests', value: view.proposals.testDrafts }} />
            <Count
              count={{
                label: 'Target named',
                value: view.proposals.certain,
                hint: 'evidence names it',
              }}
            />
            <Count
              count={{
                label: 'Ambiguous',
                value: view.proposals.ambiguous,
                hint: 'candidates listed',
              }}
              tone="warn"
            />
            <Count
              count={{
                label: 'Needs a decision',
                value: view.proposals.needingDecision,
                hint: 'not a finished fix',
              }}
              tone="warn"
            />
          </div>
        )}
      </section>

      <div className="space-y-4">
        {view.signals.map((signal) => (
          <SignalSection
            key={signal.signal}
            signal={signal}
            categories={view.categories}
            categoryCounts={view.categoryCounts}
          />
        ))}
      </div>

      {changePanel}

      {quarantinePanel}

      {view.testDrafts.length > 0 && (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Draft tests</h3>
            <span className="text-sm tabular-nums text-muted-foreground">
              ({view.testDrafts.length})
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            One per feature the coverage map lists no unit test for. Every case in a draft is{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">it.todo</code>, so it reports as
            a todo and never as a pass — a draft that asserted something plausible would claim
            coverage nobody has written. Nothing is written to{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">__tests__/</code>: copy it there
            yourself if it is a useful start.
          </p>

          <div className="mt-3 space-y-1.5">
            {view.testDrafts.map((draft) => (
              <TestDraftBlock key={draft.id} draft={draft} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
