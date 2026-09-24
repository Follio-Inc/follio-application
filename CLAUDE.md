# Follio — Claude Code guide

## Project

Follio is a Next.js 15 App Router application for building a profile, resume, and portfolio. The web UI and main HTTP API live in this repository. `pdf-worker/` is a separate Node service for PDF rendering. This is a guide to finding existing patterns; inspect nearby code before changing a feature.

## Repository map

- `app/(dashboard)/`: authenticated workspace, including the profile builder.
- `app/u/[handle]/`: public profile, resume, and work pages.
- `app/api/**/route.ts`: backend HTTP route handlers.
- `components/`: shared React components; `components/ui/` holds UI primitives.
- `lib/`: database client, active-profile resolution, validation, state, and utilities.
- `services/`: imports, AI portfolio generation, PDF rendering, and exports.
- `prisma/schema.prisma` and `prisma/migrations/`: PostgreSQL data model and migration history.
- `pdf-worker/`: separate HTML-to-PDF service.
- `__tests__/`: unit tests. `_admin-panel/modules/developer/live-qa/` contains end-to-end QA suites.

## Read first

Read `README.md`, `CONTRIBUTING.md`, and `.github/copilot-instructions.md` for project setup and existing conventions. For a feature change, trace its page or component, API route, validation, database operation, and tests before editing.

## Development commands

Run from the repository root using Node 20 (`.nvmrc`). Check `package.json` for the current script definitions.

```bash
npm install
npm run dev           # Next.js web UI and API
npm run test:run      # unit tests once
npm run validate      # typecheck, lint, and tests
npm run build         # production build
```

Local development also needs PostgreSQL and Clerk development credentials. See `README.md`, `.env.example`, and `docker-compose.yml` for setup. Use the repository's migration workflow (`npm run db:migrate`) for local database changes; add a migration when changing `prisma/schema.prisma`. Confirm database targets before running migration or seed commands. Never commit credentials or print values from `.env` files.

## Existing application patterns

- Pages and layouts under `app/` may load data on the server; interactive components use React client components. Route groups such as `(dashboard)` do not appear in URLs.
- Browser components call `fetch('/api/...')` directly. Before adding or changing an endpoint, inspect a comparable route and its calling component.
- Protected pages use Clerk middleware in `middleware.ts`. API handlers perform their own authentication with `auth()`; do not assume the page gate protects an API route.
- Use `lib/active-profile.ts` to resolve the authenticated user's active profile. Check ownership before accessing or changing a profile item.
- Validate request bodies using the existing Zod schemas and patterns in `lib/validations.ts`.
- Use the shared Prisma client from `lib/db.ts`. Keep database changes consistent with `prisma/schema.prisma` and migrations.
- The builder's draft and saved state live in `lib/stores/builder-store.ts` and are supplied by its store provider. Changes to a builder form may also need a store and preview update.
- Put substantial import, portfolio, PDF, or export logic alongside the corresponding code in `services/`; follow existing routes for straightforward CRUD.

## Useful paths for common changes

| Task | Start here |
| --- | --- |
| Builder UI | `app/(dashboard)/builder/`, `components/all-sections-editor.tsx` |
| Builder state | `lib/stores/builder-store.ts` |
| Profile API | `app/api/profile/`, `lib/active-profile.ts`, `lib/validations.ts` |
| Public views | `app/u/[handle]/`, `lib/url.ts`, `lib/visibility.ts` |
| Database model | `prisma/schema.prisma`, `prisma/migrations/` |
| PDF rendering | `services/document-pdf.service.ts`, `lib/document-pdf/`, `pdf-worker/` |
| CI checks | `.github/workflows/ci.yml` |

## Before finishing a change

Run checks relevant to the files changed, and report what ran and any failures. Avoid unrelated edits. Treat generated output, dependencies, and experiment folders as separate from the production application. Do not assume a file is unused from its name alone; check references and routing before removing it.
