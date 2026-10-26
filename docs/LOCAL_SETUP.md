# Run Follio locally

Steps to clone the repo and open it in the browser. Do this once on each machine.

## What you need

- A GitHub account that has been added to the [Follio-Inc/follio-application](https://github.com/Follio-Inc/follio-application) repo
- [Git](https://git-scm.com/downloads)
- [Node.js 20](https://nodejs.org/) (20 LTS) and npm 10 or newer
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), running before the database step
- Clerk development keys (`pk_test_...` and `sk_test_...`). Ask for the shared keys, or create a free app at [dashboard.clerk.com](https://dashboard.clerk.com) and copy the keys from API keys

Check the versions:

```bash
node -v    # v20.x
npm -v     # 10 or higher
docker -v
```

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

## 3. Database

Start Docker Desktop, then:

```bash
docker compose up -d
npm run db:migrate
npm run db:seed
```

`db:migrate` creates the tables. `db:seed` adds a public sample profile.

## 4. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Sign up with the account you will use for the project. After sign-in you land in an empty workspace that belongs to you.

The sample profile from the seed is separate from your account. View it at [http://localhost:3000/u/alexchen](http://localhost:3000/u/alexchen).

## Each time you come back

```bash
cd follio-application
docker compose up -d
npm run dev
```

Pull the latest code before you start new work:

```bash
git checkout develop
git pull origin develop
```

## If something fails

| What you see                                   | What to do                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `node -v` is not v20                           | Install Node 20 and open a new terminal                                                                |
| `npm install` fails on GitHub packages or auth | Confirm you are signed into the invited GitHub account                                                 |
| Database connection error                      | Docker Desktop is running, then `docker compose up -d` again                                           |
| Port 5432 already in use                       | Another Postgres is running. Stop it, or change the port in `docker-compose.yml` and in both env files |
| Port 3000 already in use                       | Stop the other app, or run `npm run dev -- --port 3001` and set `NEXT_PUBLIC_APP_URL` to that port     |
| Sign-in screen errors                          | Clerk keys in `.env.local` and `.env` match, and localhost is allowed in Clerk                         |
| Prisma cannot find `DATABASE_URL`              | `.env` exists and matches `.env.local`                                                                 |
