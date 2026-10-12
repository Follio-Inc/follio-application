# Admin Panel (outside Follio product)

Operator tooling that sits **beside** the Follio application — not product UI.

## Modules (separate on purpose)

| Module        | Path                 | Status                                                                      |
| ------------- | -------------------- | --------------------------------------------------------------------------- |
| **Developer** | `modules/developer/` | Health, Vitest suites, Live QA, resume reader, smoke, quick links           |
| **Users**     | `modules/users/`     | Placeholder — user monitoring comes later                                   |
| **Platform**  | `platform/`          | The Developer Platform rebuild: coverage map, drift scan, and the new shell |

These modules must not import each other. The shell only composes them.

## Two developer surfaces, on purpose

`modules/developer/` is the first Developer Platform and is **live and unchanged**. `platform/` is
the rebuild beside it. The old one is retired in `PLATFORM_TODO` item 25, not before.

| Surface                      | Route              | Use it for                                                           |
| ---------------------------- | ------------------ | -------------------------------------------------------------------- |
| First Developer Platform     | `/admin/developer` | Everything today: health, suites, Live QA, resume reader             |
| Developer Platform (rebuild) | `/admin/platform`  | The shell for Tests, Drift and Labs — sections land over items 11–24 |

The rebuild's command-line half already works: `npm run platform:scan` reports nine drift signals
over the repository, and CI runs it as a warning-only job.

## How to open

1. Be an **Admin** (separate `Admin` table — same as today's `/admin`)
2. Open **[http://localhost:3000/admin/developer](http://localhost:3000/admin/developer)** or
   **[http://localhost:3000/admin/platform](http://localhost:3000/admin/platform)**
   (or use the **Developer** / **Platform** items in the admin sidebar)

On production (follio.me), only signed-in admins can reach `/admin/*`. The public cannot.

## App touch points (thin shims only)

- `app/admin/(dashboard)/developer/page.tsx`
- `app/admin/(dashboard)/platform/layout.tsx` + `platform/**/page.tsx`
- `app/api/admin/developer/*` (including `live-qa/*` and `ai/resume-reader`)
- Admin sidebar reads module nav from `_admin-panel/nav.ts`

Do not put real panel logic under `app/` or `components/`. Inside `platform/`, `scan/` is
server-only and `ui/` must never import it.

## Local state the platform writes

| What                 | Where                                         | Notes                               |
| -------------------- | --------------------------------------------- | ----------------------------------- |
| Live QA artifacts    | `modules/developer/live-qa/.artifacts/<run>/` | Screenshots and traces, gitignored  |
| Test Console history | `platform/.runs/<runner>/<target>/<run>.json` | Last 10 runs per target, gitignored |

Both are local operator state. Neither is in git, neither is in the database, and neither holds
secrets — the history record carries the run's outcome, times, commit and one row per test.
