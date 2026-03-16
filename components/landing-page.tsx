'use client';

import { motion, useInView } from 'framer-motion';
import { ArrowRight, BarChart3, Briefcase, Check, Clock, FileText } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useRef } from 'react';

import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';

/* ═══════════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════════ */

const SKILL_BARS = [
  { label: 'React', width: 'w-[85%]' },
  { label: 'Node', width: 'w-[70%]' },
  { label: 'AWS', width: 'w-[55%]' },
  { label: 'Python', width: 'w-[65%]' },
] as const;

const EXPORT_FORMATS = [
  { name: 'JSON Resume', ext: '.json' },
  { name: 'PDF Document', ext: '.pdf' },
  { name: 'Plain Text', ext: '.txt' },
] as const;

const STEPS = [
  {
    step: '1',
    title: 'Import your data',
    desc: 'Upload a resume PDF, connect your GitHub, or start from scratch.',
  },
  {
    step: '2',
    title: 'Make it yours',
    desc: 'Edit sections, reorder content, and fine-tune the design.',
  },
  {
    step: '3',
    title: 'Share everywhere',
    desc: 'Get a unique URL with resume, portfolio, and timeline views.',
  },
] as const;

const EXPORT_CHECKLIST = [
  'JSON Resume standard',
  'ATS-optimized PDF',
  'Plain text for copy / paste',
  'Perfectly formatted, every time',
] as const;

/* ═══════════════════════════════════════════════════════════════════════════
   Scroll-triggered fade-in wrapper
   ═══════════════════════════════════════════════════════════════════════════ */

function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Hero showcase — displays the resume illustration
   ═══════════════════════════════════════════════════════════════════════════ */

const sansFont = {
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"',
  WebkitFontSmoothing: 'antialiased' as const,
} as const;

/* ── Resume illustration ─────────────────────────────────────────────── */

const RESUME_SKILLS = [
  'TypeScript',
  'React / Next.js',
  'Node.js',
  'Go',
  'Python',
  'GraphQL',
  'AWS / GCP',
  'Kubernetes',
  'PostgreSQL',
  'Redis',
  'Kafka',
  'Docker',
  'Terraform',
  'CI/CD',
] as const;

function ResumeIllustration() {
  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-950" style={sansFont}>
      {/* ── Accent bar ── */}
      <div className="h-[3px] bg-primary" />

      {/* ── Header ── */}
      <div className="px-6 pb-2 pt-5 text-center">
        <h3 className="text-[17px] font-bold tracking-[-0.02em] text-gray-900 dark:text-gray-50">
          Sarah Chen
        </h3>
        <p className="mt-0.5 text-[8px] font-medium tracking-[0.08em] text-primary">
          Senior Software Engineer
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[7px] font-light text-gray-500 dark:text-gray-400">
          <span>San Francisco, CA</span>
          <span className="text-gray-300 dark:text-gray-700">&bull;</span>
          <span>sarah.chen@email.com</span>
          <span className="text-gray-300 dark:text-gray-700">&bull;</span>
          <span>linkedin.com/in/sarachen</span>
          <span className="text-gray-300 dark:text-gray-700">&bull;</span>
          <span>github.com/sarachen</span>
        </div>
      </div>

      {/* ── Summary ── */}
      <div className="px-6 pb-2">
        <p className="text-[7.5px] font-light leading-[1.8] text-gray-700 dark:text-gray-300">
          Full-stack engineer with 8+ years shipping high-throughput distributed systems at scale.
          Led platform teams at two YC-backed startups and a Fortune 500 fintech. Specialized in
          event-driven architectures, developer tooling, and infrastructure automation. Passionate
          about building reliable systems that empower engineering teams to move faster.
        </p>
      </div>

      <div className="bg-gray-150 mx-6 h-px dark:bg-gray-800/60" />

      {/* ── Experience ── */}
      <div className="px-6 pt-2.5">
        <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-primary dark:text-primary">
          Experience
        </p>

        <div className="space-y-2">
          {/* Role 1 */}
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-gray-100">
                  Lead Platform Engineer
                </p>
                <p className="mt-[1px] text-[7px] font-light text-gray-600 dark:text-gray-400">
                  Meridian Technologies &middot; San Francisco, CA
                </p>
              </div>
              <p className="shrink-0 text-[6.5px] font-light tabular-nums text-gray-600 dark:text-gray-400">
                Jan 2022 – Present
              </p>
            </div>
            <ul className="mt-1.5 space-y-[3px] text-[7px] font-light leading-[1.7] text-gray-800 dark:text-gray-200">
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/50" />
                <span>
                  Architected event-driven microservices platform processing{' '}
                  <strong className="font-medium text-gray-900 dark:text-gray-100">
                    2.4M requests/day
                  </strong>{' '}
                  with 99.97% uptime SLA across 12 services
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/50" />
                <span>
                  Spearheaded migration from monolith to microservices, reducing mean deploy time
                  from 2 weeks to{' '}
                  <strong className="font-medium text-gray-900 dark:text-gray-100">
                    45 minutes
                  </strong>{' '}
                  via custom CI/CD pipelines with automated canary deployments
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/50" />
                <span>
                  Replaced legacy batch ETL with real-time streaming sync (Kafka + Flink), cutting
                  data latency from 6 hrs to under 30s and saving{' '}
                  <strong className="font-medium text-gray-900 dark:text-gray-100">$340K/yr</strong>{' '}
                  in compute
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/50" />
                <span>
                  Mentored team of 8 engineers; introduced architecture decision records and RFC
                  process adopted company-wide
                </span>
              </li>
            </ul>
          </div>

          {/* Role 2 */}
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-gray-100">
                  Software Engineer II
                </p>
                <p className="mt-[1px] text-[7px] font-light text-gray-600 dark:text-gray-400">
                  Nexus Labs <span className="text-gray-400 dark:text-gray-500">(YC S18)</span>{' '}
                  &middot; Remote
                </p>
              </div>
              <p className="shrink-0 text-[6.5px] font-light tabular-nums text-gray-600 dark:text-gray-400">
                Mar 2019 – Dec 2021
              </p>
            </div>
            <ul className="mt-1.5 space-y-[3px] text-[7px] font-light leading-[1.7] text-gray-800 dark:text-gray-200">
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/40" />
                <span>
                  Engineered real-time collaboration engine using CRDTs, shipped to{' '}
                  <strong className="font-medium text-gray-900 dark:text-gray-100">
                    180K+ monthly active users
                  </strong>{' '}
                  with sub-50ms sync latency
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/40" />
                <span>
                  Designed and built internal GraphQL gateway consolidating 4 REST APIs; adopted by
                  all 6 product teams, reducing frontend data-fetching code by 40%
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/40" />
                <span>
                  Optimized PostgreSQL query layer with materialized views and connection pooling,
                  improving p95 response times by{' '}
                  <strong className="font-medium text-gray-900 dark:text-gray-100">62%</strong>
                </span>
              </li>
            </ul>
          </div>

          {/* Role 3 */}
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-gray-100">
                  Software Engineer
                </p>
                <p className="mt-[1px] text-[7px] font-light text-gray-600 dark:text-gray-400">
                  Stripe &middot; San Francisco, CA
                </p>
              </div>
              <p className="shrink-0 text-[6.5px] font-light tabular-nums text-gray-600 dark:text-gray-400">
                Jun 2017 – Feb 2019
              </p>
            </div>
            <ul className="mt-1.5 space-y-[3px] text-[7px] font-light leading-[1.7] text-gray-800 dark:text-gray-200">
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/30" />
                <span>
                  Core contributor to Payments API processing $B+ annually; designed ML-powered
                  fraud detection feature preventing{' '}
                  <strong className="font-medium text-gray-900 dark:text-gray-100">$2.1M</strong> in
                  chargebacks quarterly
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/30" />
                <span>
                  Built webhook delivery system with at-least-once guarantees serving 50K+ merchants
                  with 99.99% delivery rate
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-gray-150 mx-6 mt-2.5 h-px dark:bg-gray-800/60" />

      {/* ── Education ── */}
      <div className="px-6 pt-2.5">
        <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-primary dark:text-primary">
          Education
        </p>
        <div className="space-y-2">
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[8px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-gray-100">
                  M.S. Computer Science
                </p>
                <p className="mt-[1px] text-[7px] font-light text-gray-600 dark:text-gray-400">
                  Stanford University
                </p>
              </div>
              <p className="shrink-0 text-[6.5px] font-light tabular-nums text-gray-600 dark:text-gray-400">
                Jun 2019
              </p>
            </div>
            <p className="mt-0.5 text-[6.5px] font-light text-gray-600 dark:text-gray-400">
              Focus: Distributed Systems &middot; Research: Fault-tolerant consensus protocols
            </p>
          </div>
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[8px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-gray-100">
                  B.S. Computer Science
                </p>
                <p className="mt-[1px] text-[7px] font-light text-gray-600 dark:text-gray-400">
                  Carnegie Mellon University
                </p>
              </div>
              <p className="shrink-0 text-[6.5px] font-light tabular-nums text-gray-600 dark:text-gray-400">
                May 2017
              </p>
            </div>
            <p className="mt-0.5 text-[6.5px] font-light text-gray-600 dark:text-gray-400">
              Dean&apos;s List &middot; GPA 3.87/4.0 &middot; TA, Distributed Systems &middot;
              HackCMU Organizer
            </p>
          </div>
        </div>
      </div>

      <div className="bg-gray-150 mx-6 mt-2.5 h-px dark:bg-gray-800/60" />

      {/* ── Technical Skills — inline paragraph ── */}
      <div className="px-6 pb-7 pt-2.5">
        <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-primary dark:text-primary">
          Skills
        </p>
        <p className="text-[7px] font-light leading-[1.8] text-gray-700 dark:text-gray-300">
          {RESUME_SKILLS.join('  ·  ')}
        </p>
      </div>
    </div>
  );
}

/* ── Hero showcase ────────────────────────────────────────────────────── */

function HeroShowcase() {
  return (
    <div className="relative">
      {/* Ambient glow */}
      <div className="absolute -inset-12 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent blur-3xl" />

      <motion.div
        className="relative"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="relative z-10 aspect-[8.5/12.5] w-[420px] overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950 sm:w-[480px]">
          <ResumeIllustration />
        </div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Landing Page
   ═══════════════════════════════════════════════════════════════════════════ */

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ─── Navigation ─────────────────────────────────────────────────── */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo href="/" size="md" />
          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero: Asymmetric split ─────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full bg-primary/[0.04] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-primary/[0.03] blur-3xl" />

        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr,auto] lg:gap-20">
            {/* Left: Copy */}
            <div className="max-w-xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-5 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                The future of professional resumes
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mb-5 text-4xl font-bold tracking-tight sm:text-5xl"
              >
                Your resume,{' '}
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  reimagined
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mb-8 text-base leading-relaxed text-muted-foreground sm:text-lg"
              >
                A single source of truth for your professional identity. Import once — get a resume,
                portfolio, timeline, and snapshot — all perfectly formatted and always in sync.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex gap-3"
              >
                <Link href="/sign-up">
                  <Button size="lg" className="gap-2">
                    Create your Follio
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </motion.div>
            </div>

            {/* Right: Showcase slideshow (desktop) */}
            <div className="hidden lg:block">
              <HeroShowcase />
            </div>
          </div>

          {/* Showcase slideshow (mobile/tablet — centered below text) */}
          <div className="mt-12 flex justify-center lg:hidden">
            <HeroShowcase />
          </div>
        </div>
      </section>

      {/* ─── Views: Bento grid ──────────────────────────────────────────── */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <FadeIn>
            <h2 className="mb-3 text-2xl font-bold sm:text-3xl">One profile, four perspectives</h2>
            <p className="mb-10 max-w-lg text-muted-foreground">
              Your data lives in one place. Viewers choose the lens that works for them.
            </p>
          </FadeIn>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Resume View — large card (2 cols) */}
            <FadeIn className="sm:col-span-2 lg:col-span-2" delay={0.1}>
              <div className="group flex h-full flex-col rounded-2xl border bg-card p-6 transition-all hover:shadow-lg">
                <div className="mb-4">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">Resume View</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Traditional format. Clean, professional, and ATS-friendly for job applications.
                  </p>
                </div>
                {/* Mini resume illustration */}
                <div className="mt-auto rounded-lg bg-muted/50 p-4">
                  <div className="mx-auto max-w-[220px]">
                    <div className="mb-1.5 h-2.5 w-24 rounded bg-foreground/80" />
                    <div className="mb-3 h-1.5 w-16 rounded bg-muted-foreground/30" />
                    <div className="mb-1 h-1.5 w-12 rounded bg-primary/40" />
                    <div className="space-y-1">
                      <div className="h-1 w-full rounded bg-muted-foreground/15" />
                      <div className="h-1 w-full rounded bg-muted-foreground/15" />
                      <div className="h-1 w-3/4 rounded bg-muted-foreground/15" />
                    </div>
                    <div className="mb-1 mt-2.5 h-1.5 w-12 rounded bg-primary/40" />
                    <div className="space-y-1">
                      <div className="h-1 w-full rounded bg-muted-foreground/15" />
                      <div className="h-1 w-5/6 rounded bg-muted-foreground/15" />
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Portfolio View */}
            <FadeIn delay={0.15}>
              <div className="group flex h-full flex-col rounded-2xl border bg-card p-6 transition-all hover:shadow-lg">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Briefcase className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">Portfolio View</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Rich visuals, project showcases, and live demos.
                </p>
                {/* Mini project grid illustration */}
                <div className="mt-auto pt-4">
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="aspect-[4/3] rounded-md bg-primary/15" />
                    <div className="bg-primary/8 aspect-[4/3] rounded-md" />
                    <div className="bg-primary/8 aspect-[4/3] rounded-md" />
                    <div className="aspect-[4/3] rounded-md bg-primary/15" />
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Timeline View */}
            <FadeIn delay={0.2}>
              <div className="group flex h-full flex-col rounded-2xl border bg-card p-6 transition-all hover:shadow-lg">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Clock className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">Timeline View</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your career as a chronological story.
                </p>
                {/* Mini timeline illustration */}
                <div className="mt-auto pt-4">
                  <div className="flex gap-2.5">
                    <div className="flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                      <div className="h-5 w-0.5 bg-primary/30" />
                      <div className="h-2 w-2 rounded-full bg-primary/60" />
                      <div className="h-5 w-0.5 bg-primary/30" />
                      <div className="h-2 w-2 rounded-full bg-primary/30" />
                    </div>
                    <div className="space-y-3 pt-0.5">
                      <div>
                        <div className="h-1.5 w-20 rounded bg-muted-foreground/30" />
                        <div className="mt-0.5 h-1 w-12 rounded bg-muted-foreground/15" />
                      </div>
                      <div>
                        <div className="h-1.5 w-16 rounded bg-muted-foreground/30" />
                        <div className="mt-0.5 h-1 w-10 rounded bg-muted-foreground/15" />
                      </div>
                      <div>
                        <div className="h-1.5 w-14 rounded bg-muted-foreground/30" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* SnapShot View — wide card (2 cols) */}
            <FadeIn className="sm:col-span-2 lg:col-span-2" delay={0.25}>
              <div className="group flex h-full flex-col rounded-2xl border bg-card p-6 transition-all hover:shadow-lg sm:flex-row sm:items-center sm:gap-8">
                <div className="mb-4 sm:mb-0">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">SnapShot View</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Key metrics, skills matrix, and quick facts at a glance.
                  </p>
                </div>
                {/* Mini skill bar illustration */}
                <div className="sm:ml-auto sm:w-48">
                  <div className="space-y-2">
                    {SKILL_BARS.map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className="w-10 text-right text-[9px] text-muted-foreground">
                          {item.label}
                        </span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full bg-primary/60 ${item.width}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── How it works ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <FadeIn>
          <h2 className="mb-12 text-center text-2xl font-bold sm:text-3xl">
            Up and running in minutes
          </h2>
        </FadeIn>

        <div className="relative mx-auto max-w-3xl">
          {/* Connecting line between steps (desktop) */}
          <div className="absolute left-[20%] right-[20%] top-5 hidden h-px bg-border md:block" />

          <div className="grid gap-10 md:grid-cols-3 md:gap-4">
            {STEPS.map((item, i) => (
              <FadeIn key={item.step} delay={i * 0.1}>
                <div className="text-center">
                  <div className="relative mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {item.step}
                  </div>
                  <h3 className="mb-1 font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Export & parsing ────────────────────────────────────────────── */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <FadeIn>
              <h2 className="mb-3 text-2xl font-bold sm:text-3xl">Structured from the start</h2>
              <p className="mb-6 text-muted-foreground">
                Your data is machine-readable by design. No parsing errors, no broken formatting —
                exports are always accurate.
              </p>
              <ul className="space-y-2.5">
                {EXPORT_CHECKLIST.map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm">
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </FadeIn>

            <FadeIn delay={0.15}>
              <div className="rounded-2xl border bg-card p-5 shadow-sm">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Export as
                </p>
                <div className="space-y-2">
                  {EXPORT_FORMATS.map((fmt) => (
                    <div
                      key={fmt.ext}
                      className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5"
                    >
                      <span className="text-sm font-medium">{fmt.name}</span>
                      <span className="rounded-md bg-background px-2 py-0.5 font-mono text-xs text-muted-foreground">
                        {fmt.ext}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── CTA ────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <FadeIn>
          <div className="text-center">
            <h2 className="mb-4 text-2xl font-bold sm:text-3xl">Ready to reimagine your resume?</h2>
            <p className="mx-auto mb-8 max-w-md text-muted-foreground">
              Create your canonical professional profile in minutes. Free to start.
            </p>
            <Link href="/sign-up">
              <Button size="xl" className="gap-2">
                Get started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </FadeIn>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <Logo size="sm" showText={false} />
              <span className="text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} Follio
              </span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="/privacy" className="transition-colors hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms" className="transition-colors hover:text-foreground">
                Terms
              </Link>
              <Link href="/contact" className="transition-colors hover:text-foreground">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
