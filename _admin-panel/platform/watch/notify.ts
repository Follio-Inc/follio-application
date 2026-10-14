/**
 * Telling someone a test started failing (PLATFORM_TODO item 26).
 *
 * ## The transport, and why it is this one
 *
 * There is no notification transport in this repository. A search for
 * Slack, webhooks, nodemailer, SendGrid, Resend, Discord and SMTP across
 * `package.json`, `.github/`, `lib/`, `services/` and `_admin-panel/` finds
 * nothing — the only hits are an in-app event emitter and a Clerk
 * verification-code resend, neither of which is a channel. Inventing one
 * would mean inventing credentials nobody has issued.
 *
 * So notification is what GitHub Actions already gives a job: **workflow
 * annotations and the step summary**, which is exactly how item 9's drift
 * job reports. An annotation on a scheduled run surfaces in the Actions UI,
 * in the commit's checks, and in the e-mail GitHub already sends for a
 * failed scheduled workflow on the default branch — a real channel, using
 * machinery that already exists.
 *
 * ## What separates an alert from a line of text
 *
 * Only a **new** failure gets `::error`. A known failure, a flaky one, a
 * cancelled run, a broken runner and a missing prerequisite all get prose
 * in the summary and no annotation, because an annotation is the part that
 * reaches a person. That distinction is the whole of item 26's "only when a
 * genuinely new failure appears".
 *
 * ## What goes in the payload
 *
 * Test identity, target, classification, the baseline evidence, and the
 * branch and commit when the workflow knew them. No stack traces, no
 * stdout, no environment, no auth state, no absolute paths — the report
 * this renders from never carried any of those, and a test plants a canary
 * to prove the output does not either.
 */

import type { ClassifiedFailure, WatchReport } from './baseline-types';

/** `::error` and friends treat these as delimiters. */
function escapeAnnotationData(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(value: string): string {
  return escapeAnnotationData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function describe(failure: ClassifiedFailure): string {
  const suite = failure.suite.length > 0 ? `${failure.suite.join(' › ')} › ` : '';
  return `${suite}${failure.name}`;
}

/**
 * One workflow annotation per new failure.
 *
 * `file` is set when the test has one so GitHub can anchor the annotation to
 * the source; it is repo-relative, which is the only form the report holds.
 */
export function annotationsFor(report: WatchReport): string[] {
  return report.newFailures.map((failure) => {
    const title = `New test failure (${failure.classification})`;
    const properties = [`title=${escapeProperty(title)}`];
    if (failure.file !== null) properties.push(`file=${escapeProperty(failure.file)}`);

    const message = `${failure.targetId}: ${describe(failure)} — ${failure.evidence}`;
    return `::error ${properties.join(',')}::${escapeAnnotationData(message)}`;
  });
}

function section(title: string, lines: string[]): string[] {
  return lines.length === 0 ? [] : ['', `### ${title}`, '', ...lines];
}

function row(failure: ClassifiedFailure): string {
  const file = failure.file ?? '—';
  return `| \`${failure.targetId}\` | ${describe(failure)} | \`${file}\` | ${failure.classification} | ${failure.evidence} |`;
}

const TABLE_HEAD = [
  '| Target | Test | File | Classification | Baseline says |',
  '| --- | --- | --- | --- | --- |',
];

/**
 * The job summary.
 *
 * Written whether or not anything failed, because "ran and found nothing"
 * is the result most scheduled runs should produce and silence is
 * indistinguishable from a job that never ran.
 */
export function summaryFor(report: WatchReport): string {
  const lines: string[] = ['## Developer Platform scheduled run', ''];

  const where = [
    `**Trigger:** ${report.trigger}`,
    report.branch !== null ? `**Branch:** \`${report.branch}\`` : null,
    report.commit !== null ? `**Commit:** \`${report.commit.slice(0, 8)}\`` : null,
  ].filter((entry): entry is string => entry !== null);
  lines.push(where.join(' · '), '');

  if (report.newFailures.length > 0) {
    lines.push(
      `**${report.newFailures.length} new test failure${report.newFailures.length === 1 ? '' : 's'}.** Each one is annotated on this run.`
    );
  } else {
    lines.push('**No new test failures.**');
  }

  lines.push(
    '',
    `Ran ${report.targetsRun} categor${report.targetsRun === 1 ? 'y' : 'ies'} through the Test Console's own runner, observing ${report.testsObserved} tests in ${report.durationMs} ms.`
  );

  if (report.baselineMissing) {
    lines.push(
      '',
      '> **No baseline was found**, so nothing could be compared and every failure below is reported as first-observed. This run writes the baseline; the next one can tell a regression from a known failure.'
    );
  }

  lines.push(
    ...section(
      `New failures (${report.newFailures.length})`,
      report.newFailures.length === 0 ? [] : [...TABLE_HEAD, ...report.newFailures.map(row)]
    )
  );

  lines.push(
    ...section(
      `Known failures (${report.knownFailures.length}) — not alerted`,
      report.knownFailures.length === 0
        ? []
        : [
            'Already on the record, so this run raises no annotation for them.',
            '',
            ...TABLE_HEAD,
            ...report.knownFailures.map(row),
          ]
    )
  );

  if (report.nonComparable.length > 0) {
    const byReason = new Map<string, string[]>();
    for (const entry of report.nonComparable) {
      const list = byReason.get(entry.reason) ?? [];
      list.push(`\`${entry.targetId}\` (${entry.runner}, ${entry.outcome})`);
      byReason.set(entry.reason, list);
    }

    const detail = [...byReason.entries()].map(
      ([reason, targets]) => `- **${reason}** — ${targets.join(', ')}`
    );

    lines.push(
      ...section('Nothing to compare', [
        'None of these is a product test failing, so none of them is alerted.',
        '',
        ...detail,
      ])
    );
  }

  lines.push(
    '',
    '---',
    '',
    'Advisory. This job does not gate the build, and it runs the same Vitest categories the Test Console runs. Live QA is not run on a schedule — it needs a browser download and a captured auth state.'
  );

  return `${lines.join('\n')}\n`;
}

/** Exit code: 0 always. This job reports; item 30 owns gating. */
export const WATCH_EXIT_CODE = 0;
