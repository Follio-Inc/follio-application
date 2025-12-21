# Follio — Your Professional Identity, Everywhere

<div align="center">

![Follio Logo](https://via.placeholder.com/150x50?text=Follio)

**One profile. Four views. Perfect parsing.**

Build your professional presence once, share it everywhere.

[Demo](https://follio.app) · [Documentation](#documentation) · [Contributing](#contributing)

</div>

---

## ✨ Features

### 🎯 **One Canonical Profile**

- Single source of truth for your professional data
- Import from LinkedIn, GitHub, or upload your resume
- Smart merge with conflict resolution and provenance tracking

### 👁️ **Four Curated Views**

- **Resume View** — Traditional, ATS-friendly format
- **Portfolio View** — Visual showcase of projects
- **Timeline View** — Interactive career journey
- **Recruiter View** — Key facts dashboard for hiring managers

### 📤 **Perfect Parsing Exports**

- JSON Resume standard (machine-readable)
- Plain text (ATS-optimized)
- PDF generation (coming soon)
- Zero information loss from input to output

### 🔒 **Privacy Controls**

- Public, private, or draft profiles
- Share tokens for controlled access
- Full data ownership

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/follio-app.git
cd follio-app

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your values

# Start the database (Docker)
docker-compose up -d

# Run migrations
pnpm prisma migrate dev

# Seed the database (optional)
pnpm prisma db seed

# Start the development server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Structure

```
follio-app/
├── app/                        # Next.js App Router
│   ├── (dashboard)/            # Authenticated routes
│   │   ├── builder/            # Profile builder
│   │   └── dashboard/          # User dashboard
│   ├── api/                    # API routes
│   │   ├── export/             # Export endpoints
│   │   ├── import/             # Import endpoints
│   │   └── profile/            # Profile CRUD
│   ├── sign-in/                # Clerk auth pages
│   ├── sign-up/
│   └── u/[handle]/             # Public profile viewer
├── components/
│   └── ui/                     # shadcn/ui components
├── lib/                        # Utilities
│   ├── db.ts                   # Prisma client
│   ├── utils.ts                # Helper functions
│   └── validations.ts          # Zod schemas
├── prisma/
│   ├── schema.prisma           # Data model
│   └── seed.ts                 # Seed data
├── services/                   # Business logic
│   ├── export.service.ts       # Export transformations
│   ├── github.service.ts       # GitHub integration
│   ├── merge.service.ts        # Data merging
│   ├── profile.service.ts      # Profile queries
│   └── resume-parser.service.ts# Resume parsing
├── types/
│   └── index.ts                # TypeScript types
└── __tests__/                  # Test files
```

---

## 🏗️ Architecture

### Tech Stack

| Layer      | Technology               |
| ---------- | ------------------------ |
| Framework  | Next.js 15 (App Router)  |
| Language   | TypeScript               |
| Styling    | Tailwind CSS + shadcn/ui |
| Database   | PostgreSQL + Prisma ORM  |
| Auth       | Clerk                    |
| Animations | Framer Motion            |
| Validation | Zod                      |
| Testing    | Vitest                   |

### Data Model

The canonical profile model supports:

- **Profile** — Core identity (handle, name, headline, summary)
- **ContactInfo** — Email, phone, addresses
- **WorkExperience** — Job history with bullets and tags
- **Education** — Degrees and certifications
- **Skills** — With levels and groupings
- **Projects** — With tech stack and GitHub metadata
- **Links** — Social profiles and websites
- **Awards & Certifications** — Achievements

Each entity tracks its **source** (MANUAL, GITHUB, LINKEDIN, RESUME_IMPORT, API) for intelligent merging.

### Export Formats

| Endpoint                    | Format      | Use Case              |
| --------------------------- | ----------- | --------------------- |
| `/api/export/[handle]/json` | JSON Resume | Machine parsing, APIs |
| `/api/export/[handle]/text` | Plain text  | ATS systems           |
| `/api/export/[handle]/pdf`  | PDF (HTML)  | Human reading         |

---

## 🔐 Environment Variables

Create a `.env.local` file with:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/follio"

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/dashboard"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/onboarding"

# Optional: GitHub OAuth
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

# Optional: Redis (for rate limiting)
REDIS_URL="redis://localhost:6379"
```

---

## 📖 API Reference

### Profile API

```typescript
// Get current user's profile
GET /api/profile

// Create/update profile
POST /api/profile
PATCH /api/profile

// Check handle availability
GET /api/profile/check-handle?handle=johndoe
```

### Import API

```typescript
// Import from resume file
POST /api/import/resume
Content-Type: multipart/form-data
Body: { file: File } or { text: string }

// Import from GitHub
POST /api/import/github
Body: { username: string, accessToken?: string }
```

### Export API

```typescript
// JSON Resume format
GET /api/export/[handle]/json

// Plain text format
GET /api/export/[handle]/text

// PDF (HTML for rendering)
GET /api/export/[handle]/pdf
```

---

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test:watch
```

---

## 🚢 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Set environment variables
4. Deploy

The app is optimized for Vercel with:

- Edge middleware for auth
- ISR (60s revalidation) for profile pages
- Serverless functions for API routes

### Docker

```bash
docker build -t follio .
docker run -p 3000:3000 follio
```

---

## 🛣️ Roadmap

- [x] Core profile builder
- [x] Four view types
- [x] Export endpoints (JSON, text)
- [x] GitHub import
- [x] Resume parsing
- [ ] LinkedIn OAuth integration
- [ ] PDF export with Playwright
- [ ] AI-powered resume optimization
- [ ] Custom domains
- [ ] Analytics dashboard
- [ ] Team profiles

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Built with ❤️ by the Follio team

[Website](https://follio.app) · [Twitter](https://twitter.com/follioapp) · [Discord](https://discord.gg/follio)

</div>
