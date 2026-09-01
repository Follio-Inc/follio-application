# AI lab — Resume reader

Smoke the **same** Follio resume-reading service (`importResumeWithAI` → resume-parse agent) from the developer portal. Does **not** save to a profile and does **not** change product UI.

## Open

1. Admin → [http://localhost:3000/admin/developer](http://localhost:3000/admin/developer) → **Resume reader**
2. `DEVTOOLS_ENABLED=true` in `.env.local` (same gate as Vitest / Live QA)
3. `OPENAI_API_KEY` set (same key the product parser uses)

Pick the Alex Morgan fixture or upload a PDF, then **Read resume**.

## Contract

- Product entry point: `services/import/resume-ai.service.ts` → `importResumeWithAI`
- `saveToProfile` is always `false` here
- Runs are local-only; never enabled in production
