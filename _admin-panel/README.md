# Admin Panel (outside Follio product)

Operator tooling that sits **beside** the Follio application — not product UI.

## Modules (separate on purpose)

| Module        | Path                 | Status                                                                      |
| ------------- | -------------------- | --------------------------------------------------------------------------- |
| **Developer** | `modules/developer/` | Shared runtime the Platform uses: guard, process tree, Live QA, health, AI  |
| **Users**     | `modules/users/`     | Placeholder — user monitoring comes later                                   |
| **Platform**  | `platform/`          | The Developer Platform rebuild: coverage map, drift scan, and the new shell |

These modules must not import each other. The shell only composes them.

## One Developer Platform

`/admin/platform` is the Developer Platform. There is nothing else: `PLATFORM_TODO` item 25 retired
the original panel, deleting `DevtoolsPanel.tsx`, `suites.ts`, `suites-catalog.ts`, the panel's own
tabs, and the two endpoints that served only it. `/admin/developer` still resolves — it redirects
to `/admin/platform` so old bookmarks keep working — and it is no longer a sidebar module.

| Section   | Route                   | What it does                                                      |
| --------- | ----------------------- | ----------------------------------------------------------------- |
| Overview  | `/admin/platform`       | The coverage map: features, categories, tests, pathways and labs  |
| **Tests** | `/admin/platform/tests` | Run Vitest and Live QA, with progress, cancel, history and flakes |
| **Drift** | `/admin/platform/drift` | Nine scan signals, map proposals, quarantine and deletion         |
| **Labs**  | `/admin/platform/labs`  | Lab status per feature, and the Resume import lab                 |

`npm run platform:scan` runs the same nine drift signals from the command line, and CI runs it as a
warning-only job.

**What `modules/developer/` still holds.** Retiring the panel did not retire the directory. The
Platform runs on the shared code that lives there: the local-only execution guard (`guard.ts`),
process-tree cancellation (`process-tree.ts`), and all of `live-qa/` — the pathway catalog, specs,
runner, fixtures, triage and Playwright config. `health.ts`, `status.ts`, `links.ts`, `smoke.ts`
and `ai/` also survive, with their own endpoints under `app/api/admin/developer/`.

## How to open

1. Be an **Admin** (separate `Admin` table — same as today's `/admin`)
2. Open **[http://localhost:3000/admin/developer](http://localhost:3000/admin/developer)** or
   **[http://localhost:3000/admin/platform](http://localhost:3000/admin/platform)**
   (or use the **Developer** / **Platform** items in the admin sidebar)

On production (follio.me), only signed-in admins can reach `/admin/*`. The public cannot.

### Which dev server to run

`npm run dev` starts Next with Turbopack and runs everything here **except** the Resume Lab's
OpenResume comparison. For that one endpoint, run:

```
npm run dev:webpack      # next dev, without --turbo
```

Why: the comparison calls the legacy OpenResume parser, and
`lib/resume-parser/read-pdf.ts` reads the PDF by spawning `node scripts/parse-pdf.cjs`.
Turbopack statically analyses that `spawn` call, treats the script path as a module import and
cannot resolve it —

```
Module not found: Can't resolve './ROOT/scripts/parse-pdf.cjs'
server relative imports are not implemented yet.
```

— so `POST /api/admin/platform/labs/resume-import-ai/compare` returns 500 under `npm run dev`.
Webpack resolves it, which is why the fallback script exists.

This is a limitation of dead code, not a product requirement. Nothing the product ships imports
`lib/resume-parser`; the Developer Platform's comparison lab is its only consumer, and the
comparison runtime is deliberately kept out of `platform/labs/resume-import-ai/index.ts` so the
lab page and the single-run endpoint keep working under Turbopack. `next build` and production are
unaffected — webpack builds the route fine. If the parser is ever retired, or Turbopack learns to
leave `spawn` arguments alone, this script stops being needed.

## Roles

Admin sign-in gets you in; your **Platform role** decides what you can do once you are.

|                                                                                      | viewer | runner | maintainer |
| ------------------------------------------------------------------------------------ | :----: | :----: | :--------: |
| Read every Platform page, inventory, history, drift finding, audit trail, lab result |   ✅   |   ✅   |     ✅     |
| `tests/active`, `live-qa/artifact`                                                   |   ✅   |   ✅   |     ✅     |
| Run Vitest, run Live QA, cancel a run                                                |   ❌   |   ✅   |     ✅     |
| Run the Resume Lab and the comparison                                                |   ❌   |   ✅   |     ✅     |
| Quarantine, restore, delete                                                          |   ❌   |   ❌   |     ✅     |
| Assign Platform roles                                                                |   ❌   |   ❌   |     ✅     |

**The source is `Admin.platformRole`** — a non-null Prisma enum, read from the database on the
server. Never from a request body, a query parameter, a header or an environment variable, and
never inferred from an email address or domain. A stored value outside the three fails **closed**:
unrecognised means no, never maintainer.

**Existing admins became `maintainer`** when the column was added, in the same statement, so nobody
lost access. Roles are therefore opt-in demotion: nothing is restricted until someone is explicitly
set lower. The three admins on this database all read `maintainer`.

**The last maintainer cannot be demoted.** `roles:assign` is maintainer-only, so demoting the last
one would leave nobody able to promote anyone — and this platform has no break-glass path. The
floor is enforced server-side against a live count and the refusal is audited.

**Server-side checks are authoritative.** `_admin-panel/platform/auth/` holds the role union, the
permission map and the one function that compares them; no route compares a role itself. Controls
are hidden to match your role, but hiding is courtesy — every privileged route checks again and
refuses a direct call.

### What is audited

Item 19's append-only trail at `platform/.audit/audit-v1.jsonl`, extended rather than replaced. It
now records **nine** actions — quarantine, restore, delete, `tests:run`, `live-qa:run`,
`tests:cancel`, `labs:run`, `labs:compare` and `roles:assign` — each with the actor's admin id and
their role at the time. **Refused attempts are recorded too**, including role denials, because an
admin asking for something they cannot have is the event worth keeping. Reads are not audited.
Records written before item 28 have no `actorRole` and still parse; it reads as `null`, meaning
"not recorded", never "no role".

## Performance baselines

Every duration the platform shows is also compared with its own past. Nothing is benchmarked —
these are the timings the runners already produce: per test from Vitest and Live QA, per stage from
the Resume Lab, per parser from the AI-vs-OpenResume comparison.

| Decision         | Value                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Statistic        | **Median** of the window, never a mean                                |
| Window           | Last **10** samples per item                                          |
| Minimum samples  | **3** before any comparison; fewer reads "baseline pending: n/3"      |
| Regression needs | **both** ≥ **2.0×** the baseline **and** > **50 ms** difference       |
| Improvement      | the same rule in the other direction                                  |
| Storage          | `platform/.perf/baseline.json` locally; a second file in the CI cache |

**Why those numbers.** Two real categories were run repeatedly with nothing changed between runs,
so every difference was noise: 97 comparable tests over 7 runs. Most unit tests report **0 ms**
(51 of 97), which is why a relative rule alone cannot work; the first sample of a test is
systematically its slowest, which is why the statistic is a median and not a mean. Of the candidate
rules, `×1.5 / 25 ms` would have produced 3 false positives and `×2.0 / 50 ms` produced **none**.

**Not comparable, and never flagged**: a failed test (its duration describes how long it took to
throw), a skipped or todo test, a cancelled run, a broken or timed-out runner, a Live QA pathway
with no auth state or no browser, and a flaky pass whose timing belongs to the retry. These are
reported with a reason rather than dropped, so an entry with no flag says why.

**The flags appear where results already do** — beside each test in the Test Console and beside
each stage in the Resume Lab — and always carry their numbers: "slower: 420 ms vs 250 ms (+170 ms,
1.68×)". A performance regression is **not** a functional failure: the test passed, both verdicts
are shown, and a regression raises no CI annotation and blocks nothing.

**AI and OpenResume each have their own baseline.** Their series are keyed by side and never meet.
"Slower than the other parser" is not a regression — they do different work, and item 23 declined
to name a winner.

## Scheduled runs

`.github/workflows/platform-watch.yml` runs the Test Console's own Vitest categories on a daily
schedule, on a push to `main` / `develop` / `staging` (which is what a merge looks like here), and
on demand. It calls `npm run platform:watch` — the same runner the console uses, with targets read
from the coverage map — and **annotates only failures that are new**.

New means one of two things, measured against a baseline carried between runs in the Actions cache:
the test has never been seen before, or it passed last time. A test that was already failing, one
that is known to flap, a cancelled run, a broken runner and a missing prerequisite are all reported
in the job summary and none of them raises an annotation. There is no Slack or e-mail integration
in this repository, so the workflow's annotations and summary are the notification.

The job is advisory — `continue-on-error: true`, no `pull_request` trigger, and `contents: read`.
It cannot affect whether a pull request merges. Live QA is **not** run on a schedule: it needs a
Playwright browser download and a captured auth state, so the summary names the pathways and the
prerequisite instead of fabricating results.

## App touch points (thin shims only)

- `app/admin/(dashboard)/developer/page.tsx`
- `app/admin/(dashboard)/platform/layout.tsx` + `platform/**/page.tsx`
- `app/api/admin/developer/*` (including `live-qa/*` and `ai/resume-reader`)
- Admin sidebar reads module nav from `_admin-panel/nav.ts`

Do not put real panel logic under `app/` or `components/`. Inside `platform/`, `scan/` is
server-only and `ui/` must never import it.

## Local state the platform writes

| What                     | Where                                               | Notes                                   |
| ------------------------ | --------------------------------------------------- | --------------------------------------- |
| Live QA artifacts        | `modules/developer/live-qa/.artifacts/<run>/`       | Screenshots and traces, gitignored      |
| Test Console history     | `platform/.runs/<runner>/<target>/<run>.json`       | Last 10 runs per target, gitignored     |
| Drift quarantine         | `platform/.quarantine/<id>/payload/<original path>` | Files moved out of the tree, gitignored |
| Destructive-action audit | `platform/.audit/audit-v1.jsonl`                    | Append-only, never pruned, gitignored   |
| CI failure baseline      | `platform/.watch/baseline.json`                     | Last 5 statuses per test, gitignored    |
| Performance baseline     | `platform/.perf/baseline.json`                      | Last 10 durations per item, gitignored  |

All of these are local operator state. None is in git, none is in the database, and none holds
secrets — the history record carries the run's outcome, times, commit and one row per test, and an
audit line carries the path, the finding, a hash and the acting admin's row id.

**Quarantine is the only thing in the platform that moves or removes a repository file**, and only
through `platform/drift/quarantine.ts`: behind the local-only gate, limited to files the drift scan
proves nothing reaches, and with a deletion that needs the artifact's original path sent back as
approval. Nothing is ever deleted straight from a finding.
