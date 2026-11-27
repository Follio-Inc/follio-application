'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

import type {
  ActionResult,
  QuarantineCandidate,
  QuarantineRecord,
  QuarantineView,
} from '../drift/quarantine-types';

/**
 * Quarantine, then delete with approval (PLATFORM_TODO item 19).
 *
 * The only part of the Drift page that can change anything, and the only one
 * that ships JavaScript — item 17's signal view and item 18's proposals stay
 * server-rendered and read-only beside it. Keeping it a separate component is
 * the point: a destructive control should not be two pixels from a list of
 * informational gaps.
 *
 * Nothing here names a file. Quarantine posts a **candidate id** the server
 * derived; delete posts a **quarantine id** and the artifact's original path
 * typed back as approval. The server re-resolves both against a fresh scan or
 * the stored record, so a path in a request body would have nowhere to go.
 *
 * The flow is three deliberate clicks, not one: Quarantine, then Review
 * deletion, then — after typing the original path — Delete. The typed value is
 * checked on the server against the stored record; this component's own check
 * only decides whether the button is enabled, and a disabled button is not a
 * safety mechanism.
 *
 * Restore sits beside Delete, because a middle state you cannot leave is not a
 * middle state.
 */

const QUARANTINE_ROUTE = '/api/admin/platform/drift/quarantine';
const DELETE_ROUTE = '/api/admin/platform/drift/delete';
const RESTORE_ROUTE = '/api/admin/platform/drift/restore';

type Pending = { kind: 'quarantine' | 'delete' | 'restore'; id: string } | null;

function Outcome({ result }: { result: ActionResult }) {
  const good =
    result.outcome === 'quarantined' ||
    result.outcome === 'deleted' ||
    result.outcome === 'restored';

  return (
    <div
      className={cn(
        'mt-2 rounded-lg border px-3 py-2',
        good ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
      )}
      role="status"
    >
      <p className="flex flex-wrap items-baseline gap-2">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            good
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-500'
          )}
        >
          {result.outcome}
        </span>
        <span className="text-xs text-muted-foreground">{result.detail}</span>
      </p>
      {result.record !== null && (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {result.record.originalPath} · quarantine {result.record.id}
          {result.auditId !== null && <> · audit {result.auditId}</>}
        </p>
      )}
    </div>
  );
}

function Action({
  label,
  onClick,
  busy,
  tone,
  disabled,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  tone?: 'destructive';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={cn(
        'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
        tone === 'destructive'
          ? 'border-red-500/40 text-red-700 hover:bg-red-500/10 dark:text-red-400'
          : 'hover:bg-muted',
        'disabled:cursor-not-allowed disabled:opacity-60'
      )}
    >
      {busy ? 'Working…' : label}
    </button>
  );
}

export function DriftQuarantinePanel({ view }: { view: QuarantineView }) {
  const [pending, setPending] = useState<Pending>(null);
  const [results, setResults] = useState<Record<string, ActionResult>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const post = async (route: string, body: Record<string, string>, key: string) => {
    setError(null);
    try {
      const response = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as
        | ActionResult
        | { error?: string }
        | null;

      // A refusal comes back as 409 with a full result; it is rendered, not
      // thrown away, because "why it refused" is the useful part.
      if (payload !== null && 'outcome' in payload) {
        setResults((previous) => ({ ...previous, [key]: payload }));
        return;
      }
      setError(
        (payload as { error?: string } | null)?.error ??
          `The request failed with HTTP ${response.status}.`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be sent.');
    } finally {
      setPending(null);
    }
  };

  if (!view.canAct) {
    return (
      <section className="rounded-xl border border-dashed bg-card p-5">
        <h3 className="text-sm font-semibold">Retiring code is unavailable here</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{view.gateReason}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {view.candidates.length} {view.candidates.length === 1 ? 'candidate' : 'candidates'} and{' '}
          {view.audit.length} audit {view.audit.length === 1 ? 'entry' : 'entries'} are still listed
          below the proposals, read-only.
        </p>
      </section>
    );
  }

  const quarantine = (candidate: QuarantineCandidate) => {
    setPending({ kind: 'quarantine', id: candidate.id });
    void post(QUARANTINE_ROUTE, { candidateId: candidate.id }, candidate.id);
  };

  const remove = (record: QuarantineRecord) => {
    setPending({ kind: 'delete', id: record.id });
    void post(DELETE_ROUTE, { quarantineId: record.id, confirmation }, record.id);
  };

  const restore = (record: QuarantineRecord) => {
    setPending({ kind: 'restore', id: record.id });
    void post(RESTORE_ROUTE, { quarantineId: record.id }, record.id);
  };

  const held = view.records.filter((record) => record.state === 'quarantined');
  const closed = view.records.filter((record) => record.state !== 'quarantined');

  return (
    <section className="space-y-4 rounded-xl border border-red-500/20 bg-card p-5 shadow-sm">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Retire unreachable code</h3>
          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
            Destructive
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Two stages, never one. <strong>Quarantine</strong> moves a file out of the tree into{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{view.quarantineRoot}</code> and
          records where it came from; the build may fail afterwards where something still imports
          it, which is exactly what the middle state is for. <strong>Delete</strong> is a separate
          request that needs the artifact&rsquo;s original path typed back, checked on the server.
          Every attempt — including every refusal — is appended to{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{view.auditPath}</code>. Restoring
          puts a file back byte for byte.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
          Only files the scan <em>proves</em> nothing reaches are listed: an orphan module, a dead
          end whose importers are themselves orphans, a test whose every target is orphaned, and a
          Live QA spec no catalog entry names. A module something imports is never a candidate, even
          when nothing calls it.
        </p>
      </div>

      {error !== null && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-sm font-semibold">The request could not be made</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      <section>
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Eligible for quarantine ({view.candidates.length})
        </h4>
        {view.candidates.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing is eligible. The scan found no file it can prove is unreachable.
          </p>
        ) : (
          <ul className="mt-1 rounded-lg border bg-background">
            {view.candidates.map((candidate) => {
              const result = results[candidate.id];

              return (
                <li key={candidate.id} className="border-t px-4 py-3 first:border-t-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <code className="font-mono text-xs text-foreground">{candidate.path}</code>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {candidate.signal}.{candidate.group}
                    </span>
                    <span className="ml-auto">
                      <Action
                        label="Quarantine"
                        busy={pending?.kind === 'quarantine' && pending.id === candidate.id}
                        disabled={result !== undefined}
                        onClick={() => quarantine(candidate)}
                      />
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {candidate.evidence.map((line) => (
                      <li key={line} className="text-[11px] leading-relaxed text-muted-foreground">
                        {line}
                      </li>
                    ))}
                  </ul>
                  {result !== undefined && <Outcome result={result} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          In quarantine ({held.length})
        </h4>
        {held.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing is held. A quarantined artifact appears here with what has to happen before it
            can be deleted.
          </p>
        ) : (
          <ul className="mt-1 rounded-lg border bg-background">
            {held.map((record) => {
              const result = results[record.id];
              const open = reviewing === record.id;
              const matches = confirmation.trim() === record.originalPath;

              return (
                <li key={record.id} className="border-t px-4 py-3 first:border-t-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-500">
                      quarantined
                    </span>
                    <code className="font-mono text-xs text-foreground">{record.originalPath}</code>
                    <span className="text-[11px] text-muted-foreground">
                      {record.bytes} bytes · {record.quarantinedAt}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    quarantine {record.id} · sha256 {record.sha256.slice(0, 16)}… · from{' '}
                    {record.signal}.{record.group}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {record.approvalRequired}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Action
                      label={open ? 'Cancel review' : 'Review deletion'}
                      busy={false}
                      onClick={() => {
                        setReviewing(open ? null : record.id);
                        setConfirmation('');
                      }}
                    />
                    <Action
                      label="Restore"
                      busy={pending?.kind === 'restore' && pending.id === record.id}
                      onClick={() => restore(record)}
                    />
                  </div>

                  {open && (
                    <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
                      <p className="text-xs font-semibold">
                        Deleting this removes the quarantined file for good
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        The record and the audit line stay, so what was removed and why is still
                        answerable. Type the original path to approve:
                      </p>
                      <code className="mt-1 block font-mono text-[11px] text-foreground">
                        {record.originalPath}
                      </code>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={confirmation}
                          onChange={(event) => setConfirmation(event.target.value)}
                          aria-label="Original path, to approve the deletion"
                          placeholder={record.originalPath}
                          className="h-8 w-full max-w-md rounded-md border bg-background px-2 font-mono text-xs"
                        />
                        <Action
                          label="Delete"
                          tone="destructive"
                          busy={pending?.kind === 'delete' && pending.id === record.id}
                          disabled={!matches}
                          onClick={() => remove(record)}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        The server checks this against the stored record; the button being enabled
                        is only a convenience.
                      </p>
                    </div>
                  )}

                  {result !== undefined && <Outcome result={result} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Closed records ({closed.length})
          </h4>
          <ul className="mt-1 rounded-lg border bg-background">
            {closed.map((record) => (
              <li
                key={record.id}
                className="flex flex-wrap items-baseline gap-2 border-t px-4 py-2 first:border-t-0"
              >
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {record.state}
                </span>
                <code className="font-mono text-xs">{record.originalPath}</code>
                <span className="text-[11px] text-muted-foreground">
                  {record.deletedAt ?? record.restoredAt ?? record.quarantinedAt}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{record.id}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Audit trail ({view.audit.length})
        </h4>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Newest first, append-only. Refusals are recorded too — nothing here can be edited or
          removed from this page.
        </p>
        {view.audit.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing destructive has been attempted on this machine.
          </p>
        ) : (
          <ul className="mt-1 rounded-lg border bg-background">
            {view.audit.map((event) => (
              <li key={event.id} className="border-t px-4 py-2 first:border-t-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {event.at}
                  </span>
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      event.result === 'ok' && 'bg-muted text-muted-foreground',
                      event.result === 'refused' &&
                        'bg-amber-500/10 text-amber-700 dark:text-amber-500',
                      event.result === 'failed' && 'bg-red-500/10 text-red-700 dark:text-red-400'
                    )}
                  >
                    {event.action} · {event.result}
                  </span>
                  <code className="font-mono text-xs">{event.path}</code>
                  {event.approval !== null && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {event.approval}
                    </span>
                  )}
                </div>
                {event.reason !== null && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{event.reason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
