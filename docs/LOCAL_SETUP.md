# Run Follio locally

Steps to clone the repo and open it in the browser. Do this once on each machine.

The setup is: **the database runs in Docker, the Next.js app runs on your machine**
with `npm run dev`. Nothing builds the app itself into a container.

## What you need

- A GitHub account that has been added to the [Follio-Inc/follio-application](https://github.com/Follio-Inc/follio-application) repo
- [Git](https://git-scm.com/downloads)
- [Node.js 26](https://nodejs.org/) (26 LTS). npm 11 comes with it.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), running before the database step
- Clerk development keys (`pk_test_...` and `sk_test_...`). Ask for the shared keys, or create a free app at [dashboard.clerk.com](https://dashboard.clerk.com) and copy the keys from API keys

Check the versions:

```bash
node -v    # v26.x
npm -v     # 11 or higher
docker -v
```

On Windows, Docker Desktop must be **fully started** — open it and wait until the
dashboard says "Engine running". Docker commands hang silently with no output if the
engine is still booting.

## 1. Clone and install

```bash
git clone https://github.com/Follio-Inc/follio-application.git
cd follio-application
npm install
```

If GitHub asks you to sign in, use the account that was invited to the repo.

## 2. Environment file

```bash
cp .env.example .env.local
cp .env.local .env
```

Next.js reads `.env.local`. Prisma reads `.env`. Keep the two files the same: when you change one, copy it over the other.

Open `.env.local` and set these. The database lines can stay as they are if you use the Docker database below.

Keep those database URLs on localhost. Do not paste the production Neon URL into `.env` or `.env.local`. localhost and follio.me would then share one database, and signing in locally can delete the live profile. Production on follio.me keeps its own Neon URL in the host's environment settings.

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/follio"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/follio"

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Leave the other values alone for a first run. Resume upload and AI rewriting need an `OPENAI_API_KEY` later. Browsing, editing, and sharing work without it.

If you created your own Clerk app, add `http://localhost:3000` as an allowed origin in the Clerk dashboard.

### If your `.env.local` already points at a hosted database

Some machines are set up against hosted Neon Postgres — the `DATABASE_URL` contains
`neon.tech`. **Do not edit `.env.local`** to switch to Docker, or you lose those
credentials. Create an override that applies to `npm run dev` only:

```env
# .env.development.local
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/follio"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/follio"
```

Next.js loads env files in priority order, first match wins:

| Priority | File                     | Read by                        |
| -------- | ------------------------ | ------------------------------ |
| 1        | `.env.development.local` | Next.js, dev only              |
| 2        | `.env.local`             | Next.js — your personal keys   |
| 3        | `.env.development`       | Next.js in dev                 |
| 4        | `.env`                   | Next.js **and the Prisma CLI** |

So `.env.development.local` wins for the database, while Clerk and OpenAI keys still
come from `.env.local`. **To go back to the hosted database, delete
`.env.development.local` and restart `npm run dev`.** Nothing else changes.

The Prisma CLI never reads `.env.local` or `.env.development.local` — only `.env`.
Keep the database lines in `.env` identical to the ones in `.env.development.local`,
or the app and your migrations will quietly target different databases.

## 3. Database

Start Docker Desktop, then:

```bash
docker compose up -d
```

This starts **one** container, `follio-postgres` (Postgres 16). Redis and the PDF
worker sit behind Compose profiles and do not start by default. If you ever need
them: `docker compose --profile redis up -d` or `--profile pdf`.

Confirm the container is healthy before going further. `up -d` returns as soon as the
container _starts_, which is a few seconds before Postgres accepts queries:

```bash
docker compose ps
```

Wait until `STATUS` reads `Up (healthy)`.

### If port 5432 is already taken

Common on Windows, where a native PostgreSQL service may already own 5432, and on
Macs with Postgres installed through Homebrew. Rather than stopping that service,
publish the container on a different host port. Add to `.env`:

```env
POSTGRES_PORT=5433
```

and change the port in every database URL — in `.env`, and in
`.env.development.local` or `.env.local` — to match:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/follio"
DIRECT_URL="postgresql://postgres:postgres@localhost:5433/follio"
```

Then run `docker compose up -d` again. Only the _host_ port changes; inside Docker,
Postgres still listens on 5432. That is why the URLs change but the Compose file does
not.

### Apply the migrations

Check what Prisma sees first. This connects read-only and lists which migrations have
and have not been applied:

```bash
npx prisma migrate status
```

Then apply them:

```bash
npx prisma migrate deploy
```

`migrate deploy` runs the files in `prisma/migrations/` in order against whatever
`DATABASE_URL` in `.env` points to. It applies only the missing ones, never generates
new migrations, and has no reset path — which makes it the safe command for setting
up a database.

`npm run db:migrate` (`prisma migrate dev`) is a different tool: it is for _authoring_
a new migration after you edit `prisma/schema.prisma`. It can offer to reset the
database when it detects drift, so do not reach for it just to set your machine up.

Finally, optional sample data:

```bash
npm run db:seed
```

This adds a public sample profile. It upserts, so running it twice is harmless.

## 4. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Sign up with the account you will use for the project. After sign-in you land in an empty workspace that belongs to you.

Your user row is created in the database the first time you sign in, so a brand new
empty database fills itself in. There is no webhook to configure.

The sample profile from the seed is separate from your account. View it at [http://localhost:3000/u/alexchen](http://localhost:3000/u/alexchen).

### Optional: the multi-agent resume assistant

Resume analysis runs on a single agent by default. The orchestrated five-agent
version — and the "Generate AI Improvements" rewrite flow that depends on it —
is off unless you ask for it. Add this to `.env.local` and restart `npm run dev`:

```bash
FOLLIO_MULTI_AGENT_ENABLED=true
```

The flag is read server-side only (`lib/features.ts`); nothing in the browser
can turn it on. With it off, analysis still works and the rewrite endpoint
answers 503 rather than silently falling back to an engine that cannot produce
verified proposals.

Both need `OPENAI_API_KEY` set. A rewrite run spends real tokens — roughly
35k–155k across the agent tree depending on how many revision rounds the
verifier asks for — so the button is deliberately an explicit click, and
previously generated suggestions are re-openable from history without paying
again.

To exercise the agents without the UI:

```bash
# read-only, no model call, prints the execution tree
npx tsx local-tests/resume-rewrite/run-live.ts --email you@example.com

# proposal storage and approval against a disposable resume, no model call
npx tsx local-tests/resume-proposals/run-live.ts --demo --email you@example.com --write
```

Both refuse to run against anything but a local database.

## Each time you come back

```bash
cd follio-application
docker compose up -d     # start the database
npm run dev              # start the app
```

Pull the latest code before you start new work:

```bash
git checkout develop
git pull origin develop
```

If someone added a migration while you were away, run `npx prisma migrate deploy` and
`npx prisma generate` after pulling.

## Stopping

```bash
docker compose stop      # stop the container, keep it and the data
docker compose down      # remove the container, keep the data
```

Your data lives in a Docker **named volume**, not in this repo folder, so both
commands above keep it. Only this deletes it:

```bash
docker compose down -v   # DESTROYS all local database data
```

After `down -v` you have to run `npx prisma migrate deploy` again to rebuild the
tables.

## If something fails

| What you see                                   | What to do                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `node -v` is not v26                           | Install Node 26 and open a new terminal                                                        |
| `npm install` fails on GitHub packages or auth | Confirm you are signed into the invited GitHub account                                         |
| Docker commands hang with no output            | Docker Desktop is not fully started. Open it and wait for "Engine running"                     |
| Database connection error                      | Docker Desktop is running, then `docker compose up -d` again                                   |
| Port 5432 already in use                       | Another Postgres owns it. Set `POSTGRES_PORT=5433` in `.env` and update the URLs — see above   |
| Port 3000 already in use                       | Stop the other app, or run `npm run dev -- --port 3001` and set `NEXT_PUBLIC_APP_URL` to it    |
| Sign-in screen errors                          | Clerk keys in `.env.local` and `.env` match, and localhost is allowed in Clerk                 |
| Prisma cannot find `DATABASE_URL`              | `.env` exists and matches `.env.local`                                                         |
| `P1001: Can't reach database server`           | `docker compose ps` shows `Up (healthy)`, and the port in `DATABASE_URL` matches the host port |
| The app reads the wrong database               | `.env.development.local` overrides `.env.local`. Check which files define `DATABASE_URL`       |
| Prisma client missing a field you just added   | `npx prisma generate`, delete `.next`, restart `npm run dev`                                   |
