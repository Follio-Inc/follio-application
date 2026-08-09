# Developer module

Health checks, Vitest suites, **Live QA** (browser pathways), smoke checklist, and quick links.

Independent from `modules/users`. Accessed only via `/admin/developer` (admin auth).

## Local-only runners

Running Vitest **or** Live QA from the UI requires:

```bash
DEVTOOLS_ENABLED=true
```

in `.env.local`. Health / smoke / links / Live QA catalog work for any admin without that flag; spawning browsers/tests does not.

Both runners are blocked when `NODE_ENV === 'production'` (no override).

## Live QA

See [`live-qa/README.md`](./live-qa/README.md). Tab: **Live QA** on `/admin/developer`.
