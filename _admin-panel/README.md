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

All of these are local operator state. None is in git, none is in the database, and none holds
secrets — the history record carries the run's outcome, times, commit and one row per test, and an
audit line carries the path, the finding, a hash and the acting admin's row id.

**Quarantine is the only thing in the platform that moves or removes a repository file**, and only
through `platform/drift/quarantine.ts`: behind the local-only gate, limited to files the drift scan
proves nothing reaches, and with a deletion that needs the artifact's original path sent back as
approval. Nothing is ever deleted straight from a finding.
