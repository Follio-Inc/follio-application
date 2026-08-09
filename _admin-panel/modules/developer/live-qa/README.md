# Live QA (developer portal)

AI-assisted **live pathway** runner for Follio. Lives entirely under `_admin-panel` — it drives a running app over HTTP/browser and does **not** import product UI modules.

## Goal

Exercise the real folio pipeline repeatedly as the product changes:

- Upload resume (fixture pool + one-off uploads)
- Blank / manual entry personas
- Builder designer / templates
- Share visibility
- Multi-resume, cover letter, links, auth gates

## Open

1. Admin → **[http://localhost:3000/admin/developer](http://localhost:3000/admin/developer)** → **Live QA** tab
2. `DEVTOOLS_ENABLED=true` in `.env.local` (same gate as Vitest suites)
3. App running (`npm run dev`)
4. Optional auth: set `LIVE_QA_STORAGE_STATE` to a Playwright storage-state JSON for a signed-in Clerk test user
5. Optional AI triage: `ANTHROPIC_API_KEY` (already used by resume parser)

## Capture a Clerk session (once)

Automated (preferred):

```bash
npm run live-qa:auth
```

Uses `CLERK_SECRET_KEY` to mint a sign-in token and saves
`_admin-panel/modules/developer/live-qa/.auth/user.json`.

Or manual:

```bash
npx playwright codegen http://localhost:3000/sign-in --save-storage=_admin-panel/modules/developer/live-qa/.auth/user.json
```

Point env at the file (already added by setup when missing):

```bash
LIVE_QA_STORAGE_STATE=_admin-panel/modules/developer/live-qa/.auth/user.json
```

Never commit `.auth/` or uploaded PDFs under `fixtures/resumes/uploads/`.

## CLI (optional)

```bash
npm run live-qa -- --grep public.landing
```

## Design rules

- **Intent catalog** in `catalog.ts` is the durable map of journeys
- **Selectors** live only in `pathways/*.spec.ts` and prefer roles/labels over CSS
- **No product code changes** required for Live QA to exist
- Runs are **local-only** (blocked in production, same as Vitest suites)
- AI **triages failures**; it does not silently rewrite product code

## Adding a pathway

1. Add an entry to `catalog.ts` with intents
2. Add `pathways/<name>.spec.ts`
3. It appears in the Live QA tab automatically
