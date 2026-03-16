'use client';

import { motion, useInView } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  Check,
  Clock,
  Eye,
  FileText,
  Layers,
  Link2,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useRef } from 'react';

import { Logo } from '@/components/Logo';
import { ResumeIllustration } from '@/components/resume-illustration';
import { Button } from '@/components/ui/button';

/* ═══════════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════════ */

const VALUE_PROPS = [
  {
    icon: Link2,
    title: 'Share Links, Not PDFs',
    desc: 'One link replaces every copy. Control access centrally from your dashboard.',
  },
  {
    icon: Layers,
    title: 'Zero Parsing Issues',
    desc: 'Data stays structured. Recruiters get perfectly parsed info — every time.',
  },
  {
    icon: Eye,
    title: 'Viewer Picks the View',
    desc: 'Resume, portfolio, timeline, or snapshot — your audience chooses their lens.',
  },
  {
    icon: RefreshCw,
    title: 'Always Up to Date',
    desc: 'Auto-syncs with GitHub, blogs, and projects as you ship new work.',
  },
] as const;

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

        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
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

          {/* ─── Value propositions ───────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="mt-14 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
          >
            {VALUE_PROPS.map((prop) => (
              <div
                key={prop.title}
                className="group rounded-xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-primary/20 hover:bg-card"
              >
                <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <prop.icon className="h-[18px] w-[18px]" />
                </div>
                <h3 className="mb-1 text-sm font-semibold leading-tight">{prop.title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{prop.desc}</p>
              </div>
            ))}
          </motion.div>
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
