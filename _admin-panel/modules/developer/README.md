# Developer module

Health checks, Vitest suites, smoke checklist, and quick links.

Independent from `modules/users`. Accessed only via `/admin/developer` (admin auth).

## Local-only test runner

Running Vitest from the UI requires:

```bash
DEVTOOLS_ENABLED=true
```

in `.env.local`. Health / smoke / links work for any admin without that flag.

Vitest runs are blocked when `NODE_ENV === 'production'` (no override).
