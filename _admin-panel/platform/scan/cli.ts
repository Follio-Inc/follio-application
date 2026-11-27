/**
 * `npm run platform:scan` — the drift scan CLI.
 *
 * Read-only. It walks the repo and compares what it finds against the coverage
 * map; it never writes a file or touches product code.
 *
 * Exit policy: **0 even when drift is found**, which is what PLATFORM_TODO
 * item 4 specifies ("exit 0 always for now"). Findings are reported, not
 * enforced, until item 9 adds the CI warning job and item 30 makes it blocking.
 * Pass `--strict` to opt into exit 1 on drift — useful locally and for whoever
 * wires item 9, without changing the default this item asked for.
 */

import { formatDriftReport, runDriftScan } from './report';

function main(): void {
  const strict = process.argv.includes('--strict');
  const report = runDriftScan();

  console.log(formatDriftReport(report));

  if (!report.ok) {
    console.log(
      strict
        ? '\n--strict: exiting 1 because drift was found.'
        : '\nExiting 0: this scan reports drift without failing (PLATFORM_TODO item 4). Use --strict to fail instead.'
    );
  }

  process.exitCode = !report.ok && strict ? 1 : 0;
}

main();
