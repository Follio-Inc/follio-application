# Follio — Own your first impression

<div align="center">

![Follio Logo](public/logo/follio-logo-full.png)

**Your Follio. One link.**

[Demo](https://follio.app) · [Architecture](#architecture) · [Contributing](CONTRIBUTING.md)

</div>

---

## What Follio is

Follio is the thing you share to connect. You capture your data once — by uploading a resume, connecting GitHub, or editing directly — and Follio renders your page with your contact, resume, and work behind a single URL.

| Surface    | URL                  | Purpose                                                       |
| ---------- | -------------------- | ------------------------------------------------------------- |
| **Follio** | `/u/[handle]`        | The first impression. Call, email, save to contacts.          |
| **Resume** | `/u/[handle]/resume` | Traditional ATS-friendly document. Printable and exportable.  |
| **Work**   | `/u/[handle]/work`   | Visual showcase of selected work (when portfolio is enabled). |

Visitors land on the Follio. Resume and work are doors off that card, not competing homepages.

## Core loop

```
Capture (once)  →  Curate (review what AI made)  →  Share (one Follio)
```

Every feature serves this loop. If something doesn't, it shouldn't exist.

---

## Project structure

```
follio-app/
├── app/
│   ├── page.tsx                      # Marketing landing (anonymous) / redirect to /dashboard (authed)
│   ├── (dashboard)/                  # Authenticated workspace
│   │   ├── dashboard/                # Home — live Follio + share
│   │   ├── builder/                  # Profile editor (the canonical data)
│   │   ├── resumes/                  # List of all your sites/profiles
│   │   ├── data-sources/             # LinkedIn, GitHub, resume upload
│   │   ├── share/                    # Share controls and tokens
│   │   └── settings/                 # Account
│   ├── u/[handle]/                   # Public Follio
│   │   ├── page.tsx                  # Follio (the share URL)
│   │   ├── resume/page.tsx           # Resume view
│   │   ├── work/page.tsx             # Work / portfolio view
│   │   └── views/                    # View components
│   ├── api/                          # All API routes
│   ├── admin/                        # Admin dashboard (role-gated)
│   └── onboarding/                   # First-run flow
├── components/
│   ├── site-header.tsx               # The unified Follio/Portfolio/Resume switcher (slim chrome)
│   ├── profile-navbar.tsx            # Legacy top bar (still used by the Links viewer)
│   ├── landing-page.tsx              # Marketing landing
│   └── ui/                           # shadcn/ui primitives
├── services/                         # Business logic (one file per domain)
├── lib/                              # Utilities, db client, validations, errors
├── prisma/                           # Schema + migrations
├── types/                            # TypeScript types
└── __tests__/                        # Vitest tests
```

---

## Quick start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- npm 10+

### Setup

```bash
git clone <repo>
cd follio-app
# Optional if you use nvm/fnm/Volta: switch to the repo's Node version first
# nvm use
npm install

cp .env.example .env.local  # fill in values (see below)
ln -s .env.local .env       # Prisma CLI reads .env

docker-compose up -d              # start Postgres
npm run db:migrate                # apply schema
npm run db:seed                   # optional seed data

npm run dev                       # http://localhost:3000
```

If you are using a hosted Postgres database such as Neon for local development,
you can skip `docker-compose up -d` and point `DATABASE_URL` / `DIRECT_URL` at
that remote database instead.

### Environment variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/follio"

# Clerk auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/dashboard"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/onboarding"

# Public URL (controls subdomain vs path-based public URLs)
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_ROOT_DOMAIN="follio.me"
NEXT_PUBLIC_SUBDOMAIN_ENABLED="false"

# Optional integrations
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
OPENAI_API_KEY=""
```

---

## Architecture

### Tech stack

| Layer      | Choice                        |
| ---------- | ----------------------------- |
| Framework  | Next.js 15 (App Router, RSC)  |
| Language   | TypeScript (strict)           |
| Styling    | Tailwind CSS + shadcn/ui      |
| Database   | PostgreSQL via Prisma         |
| Auth       | Clerk                         |
| AI         | OpenAI (GPT-4o + GPT-4o-mini) |
| Animations | Framer Motion                 |
| Validation | Zod                           |
| Tests      | Vitest                        |

### Data model

The canonical Profile is the single source of truth. The three public views are pure projections of the same data — there is no separate "resume document" or "portfolio document" stored independently.

**Profile** owns:

- `ContactInfo` — email, phone, location
- `WorkExperience[]`, `Education[]`, `Skill[]` (+ `SkillGroup[]`), `Project[]`
- `Award[]`, `Certification[]`, `BlogPost[]`, `YouTubeVideo[]`
- `Link[]` — social and external profiles
- `ProfilePhoto[]` — gallery
- `ProfileSection[]` — controls visibility/order of sections in the editor

Each item carries its **source** (`MANUAL`, `GITHUB`, `LINKEDIN`, `RESUME_IMPORT`, `API`) so multi-source merges can preserve provenance.

### The AI pipeline (Portfolio view)

The Portfolio view is generated by a multi-stage AI pipeline that turns raw profile data into curated copy + section configuration. The pipeline is documented in detail in [`docs/IMPORT_ARCHITECTURE.md`](docs/IMPORT_ARCHITECTURE.md) and the in-repo memory file `/.copilot/memory/repo/portfolio-architecture.md`.

Stages: **Profile understanding → evidence extraction → strategy → narrative → design brief → validation**.

The Resume view is rendered directly from the Profile (no AI needed). The Follio view uses a lightweight algorithmic "snap" computation, optionally upgraded by a single AI pass (see `services/snap-view.service.ts`).

### Visibility model

Each surface has its own visibility independently:

- Profile `status` — controls the Follio (`PUBLIC` / `PRIVATE` / `DRAFT`)
- `portfolioVisibility` — controls Work
- `resumeVisibility` — controls Resume

Work and resume settings: `PUBLIC`, `UNLISTED` (link-only, not indexed), `PRIVATE` (owner-only).

Share tokens (`ShareToken`) can grant time-limited or view-count-limited access. A token can be scoped to a single view via `allowedView`.

### URL conventions

Two url shapes are supported, controlled by `NEXT_PUBLIC_SUBDOMAIN_ENABLED`:

| Subdomain mode | Follio                     | Resume                       | Work                            |
| -------------- | -------------------------- | ---------------------------- | ------------------------------- |
| **Off** (dev)  | `/u/handle`                | `/u/handle/resume`           | `/u/handle/work`                |
| **On** (prod)  | `https://handle.follio.me` | `https://follio.me/username` | `https://handle.follio.me/work` |

Helpers in [`lib/url.ts`](lib/url.ts):

- `getFollioUrl(handle)` / `getFollioPath(handle)`
- `getResumeUrl(handle)` / `getResumePath(handle)`
- `getPortfolioUrl(handle)` / `getPortfolioPath(handle)` — Work

Use the `*Url` variants for OG tags, share buttons, and external links. Use the `*Path` variants for `<Link>` and `redirect()`.

### Export formats

| Endpoint                    | Format      | Use case        |
| --------------------------- | ----------- | --------------- |
| `/api/export/[handle]/json` | JSON Resume | Machine parsing |
| `/api/export/[handle]/text` | Plain text  | ATS systems     |
| `/api/export/[handle]/pdf`  | PDF (HTML)  | Human reading   |

---

## Engineering principles

These are non-negotiable. They are enforced by code review.

1. **One source of truth.** The Profile owns the data. Views read it; they do not own a copy.
2. **No magic strings.** Every URL, route, or noun goes through a helper or constant.
3. **Visibility at the boundary.** Public-page server components check visibility before rendering, never the view components themselves.
4. **No workarounds.** Fix the root cause. If the right fix means refactoring, refactor.
5. **Type-safe at the edges.** API payloads and external inputs go through Zod (`lib/validations.ts`) before hitting business logic.
6. **Errors are typed.** Use the helpers in `lib/errors.ts`. Never throw raw strings.

For the full set, see [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

---

## Testing

```bash
npm run test              # Vitest watch mode
npm run test:run          # one-shot
npm run test:coverage     # coverage report
```

Tests live in `__tests__/` and cover services, parsers, and pure utilities. UI components are not unit-tested by default — they're exercised through end-to-end flows.

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The short version: small commits, conventional messages, no broken tests, follow the engineering principles above.

---

## License

Private — not yet open-sourced.
