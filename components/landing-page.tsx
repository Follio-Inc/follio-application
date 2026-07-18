'use client';

/**
 * LandingPage — Follio's marketing front door.
 *
 * Design intent
 * -------------
 * Sleek, product-first, restrained. The page answers one question fast:
 * "what is Follio and why would I want it?" Everything else is cut.
 *
 * - One confident hero with a single CTA.
 * - One showpiece (the three-view switcher) that *is* the product story.
 * - Three short differentiators — text, not colorful tiles.
 * - Three steps — typographic, not numbered circles in pastel boxes.
 * - One final CTA, one quiet footer.
 *
 * Aesthetic borrows from Linear / Vercel / Cron: monochromatic surface,
 * a single teal accent, generous whitespace, hairline borders, quiet motion
 * that fades in once and never loops.
 */

import {
  type MotionValue,
  type Variants,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  useVelocity,
} from 'framer-motion';
import { ChevronDown, Shield } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Logo } from '@/components/Logo';
import { AppHeader } from '@/components/app-header';
import { ResumeIllustration } from '@/components/resume-illustration';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isPortfolioEnabled } from '@/lib/features';

/* ═══════════════════════════════════════════════════════════════════════════
   Motion primitives
   ═══════════════════════════════════════════════════════════════════════════ */

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

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
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={FADE_UP}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Scroll indicator — fades away once intentional scrolling begins.
   Positioned absolutely at the bottom of whichever pinned/full-height frame
   contains it; each section drives the opacity via its own scroll progress.
   ═══════════════════════════════════════════════════════════════════════════ */

function ScrollIndicator({ opacity }: { opacity: MotionValue<number> }) {
  return (
    <motion.div
      style={{ opacity }}
      className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2"
      aria-hidden
    >
      <motion.div
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ChevronDown className="h-5 w-5 text-muted-foreground/50" strokeWidth={1.5} />
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Browser frame — mac-style window chrome to wrap the showcase
   ═══════════════════════════════════════════════════════════════════════════ */

function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_24px_60px_-24px_rgb(0_0_0/0.25)] ring-1 ring-black/[0.02]">
      <div className="flex items-center gap-3 border-b border-border/60 bg-muted/40 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        </div>
        <div className="mx-auto flex max-w-md flex-1 items-center justify-center gap-1.5 rounded-md bg-background/70 px-3 py-1 font-mono text-[11px] text-muted-foreground">
          <span className="text-foreground/40">follio.app</span>
          <span>{url}</span>
        </div>
        <div className="w-10" />
      </div>
      <div className="bg-background">{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   View mocks — minimal, typographic, distinct
   ═══════════════════════════════════════════════════════════════════════════ */

function FollioViewMock() {
  return (
    <div className="grid h-[460px] grid-cols-5 gap-8 p-10">
      <div className="col-span-3 flex flex-col justify-center">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
          Follio · @sarahchen
        </p>
        <h3 className="mb-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Sarah Chen
        </h3>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          Senior Software Engineer building tools that make distributed systems feel small.
          Currently at Stripe, previously Vercel.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {['TypeScript', 'Distributed Systems', 'Postgres', 'React', 'Go'].map((s) => (
            <span
              key={s}
              className="rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
      <div className="col-span-2 flex flex-col justify-center gap-3">
        {[
          { k: 'Experience', v: '7 years' },
          { k: 'Shipped', v: '24 projects' },
          { k: 'Based in', v: 'San Francisco' },
          { k: 'Open to', v: 'Senior / Staff' },
        ].map((row) => (
          <div
            key={row.k}
            className="flex items-baseline justify-between border-b border-dashed border-border/70 pb-2"
          >
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {row.k}
            </span>
            <span className="text-sm font-medium text-foreground">{row.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortfolioViewMock() {
  const projects = [
    { title: 'Cascade', tag: 'Open Source', tone: 'from-primary/20 to-primary/5' },
    { title: 'Atlas DB', tag: 'Work', tone: 'from-foreground/10 to-foreground/5' },
    {
      title: 'Vellum',
      tag: 'Side project',
      tone: 'from-muted-foreground/15 to-muted-foreground/5',
    },
    { title: 'Ledger', tag: 'Work', tone: 'from-foreground/10 to-foreground/5' },
  ];
  return (
    <div className="h-[460px] overflow-hidden p-8 sm:p-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Portfolio</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">Selected work</h3>
        </div>
        <span className="text-xs text-muted-foreground">4 of 24</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {projects.map((p) => (
          <div
            key={p.title}
            className="group overflow-hidden rounded-lg border border-border/60 bg-card"
          >
            <div className={cn('relative aspect-[16/9] w-full bg-gradient-to-br', p.tone)}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.4),transparent_60%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.06),transparent_60%)]" />
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-sm font-medium">{p.title}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {p.tag}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResumeViewMock() {
  return (
    <div className="flex h-[460px] items-center justify-center bg-muted/40 px-10 py-8">
      <div className="aspect-[8.5/12.5] h-full overflow-hidden rounded-md border border-border/70 bg-white shadow-xl dark:bg-gray-950">
        <ResumeIllustration />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Three-view switcher — the showpiece
   ═══════════════════════════════════════════════════════════════════════════ */

type ViewKey = 'follio' | 'portfolio' | 'resume';

const VIEWS: ReadonlyArray<{
  key: ViewKey;
  label: string;
  url: string;
  caption: string;
  Mock: () => ReactNode;
}> = [
  {
    key: 'follio',
    label: 'Follio',
    url: '/u/sarahchen/follio',
    caption: 'A single-screen brand snapshot. The first impression.',
    Mock: FollioViewMock,
  },
  {
    key: 'portfolio',
    label: 'Portfolio',
    url: '/u/sarahchen',
    caption: 'Visual showcase of your selected work.',
    Mock: PortfolioViewMock,
  },
  {
    key: 'resume',
    label: 'Resume',
    url: '/u/sarahchen/resume',
    caption: 'A traditional, ATS-friendly document — printable and exportable.',
    Mock: ResumeViewMock,
  },
];

export function ViewSwitcher() {
  const views = isPortfolioEnabled() ? VIEWS : VIEWS.filter((v) => v.key !== 'portfolio');
  const [active, setActive] = useState<ViewKey>('follio');
  const current = views.find((v) => v.key === active) ?? views[0];
  const Mock = current.Mock;

  return (
    <div>
      <div className="mb-5 flex justify-center">
        <div
          className="inline-flex items-center rounded-full border border-border/70 bg-card p-1 shadow-sm"
          role="tablist"
          aria-label="Preview view"
        >
          {views.map((v) => {
            const isActive = v.key === active;
            return (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(v.key)}
                className={cn(
                  'relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'text-background' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="view-pill"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-foreground"
                  />
                )}
                <span className="relative">{v.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <BrowserFrame url={current.url}>
        <motion.div
          key={current.key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <Mock />
        </motion.div>
      </BrowserFrame>

      <p className="mx-auto mt-5 max-w-md text-center text-sm text-muted-foreground">
        {current.caption}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Section content
   ═══════════════════════════════════════════════════════════════════════════ */

export const STEPS = [
  {
    n: '01',
    title: 'Import once',
    body: 'Upload a resume, connect GitHub, or start from a blank slate. Follio extracts the structure.',
  },
  {
    n: '02',
    title: 'Refine',
    body: 'Edit any section, reorder content, and choose what stays public. The three views update together.',
  },
  {
    n: '03',
    title: 'Share one link',
    body: 'Send follio.app/u/yourhandle. Your audience picks Follio, Portfolio, or Resume.',
  },
] as const;

/* ═══════════════════════════════════════════════════════════════════════════
   Capabilities — what makes a Follio different from a PDF

   A scroll-locked stack of cards. Each card pairs a short claim with a spot
   illustration (a square PNG in /public/illustrations_transparent). Built to grow one
   capability at a time; add entries to CAPABILITIES as their art is finished.
   ═══════════════════════════════════════════════════════════════════════════ */

type Capability = {
  id: string;
  eyebrow: string;
  title: string;
  /** Public path to the feature's spot illustration (square PNG). */
  image: string;
};

const CAPABILITIES: readonly Capability[] = [
  {
    id: 'adaptive',
    eyebrow: 'Adaptive',
    title: 'You build it once. Every viewer reads it their way.',
    image: '/illustrations_transparent/Adaptive.png',
  },
  {
    id: 'talking',
    eyebrow: 'Talking',
    title: 'It answers questions — even when you are not there.',
    image: '/illustrations_transparent/Talking.png',
  },
  {
    id: 'errorless',
    eyebrow: 'Errorless',
    title: 'It catches the mistakes that quietly cost you interviews.',
    image: '/illustrations_transparent/Errorless.png',
  },
  {
    id: 'parsable',
    eyebrow: 'Parsable',
    title: 'Stored as clean data, so job portals read it perfectly.',
    image: '/illustrations_transparent/Parsable.png',
  },
  {
    id: 'connected',
    eyebrow: 'Connected',
    title: 'It plugs into where your work already lives.',
    image: '/illustrations_transparent/Connected.png',
  },
  {
    id: 'shareable',
    eyebrow: 'Shareable',
    title: 'One link to share — public or private, fully under your control.',
    image: '/illustrations_transparent/Shareable.png',
  },
  {
    id: 'self-improving',
    eyebrow: 'Skill-aware',
    title: 'It tracks the market and tells you which hot skills you’re missing.',
    image: '/illustrations_transparent/Skill-aware.png',
  },
] as const;

/** Shared section heading — wraps on small screens; single-line on laptop+. */
const CAPABILITIES_HEADING_CLASS =
  'text-display text-balance text-2xl text-foreground sm:text-3xl lg:whitespace-nowrap lg:text-[2.5rem]';

/** Display order for the stacked cards — leads with parsable (structured data story). */
const CAPABILITY_STACK_ORDER = [
  'parsable',
  'self-improving',
  'adaptive',
  'talking',
  'connected',
  'shareable',
  'errorless',
] as const;

function getStackedCapabilities(): readonly Capability[] {
  return CAPABILITY_STACK_ORDER.map((id) => CAPABILITIES.find((c) => c.id === id)).filter(
    (c): c is Capability => Boolean(c)
  );
}

/**
 * The shared visual shell for a capability card — clean, flat, editorial.
 * No per-card colour tints, no bloom blobs. The surface is a quiet `bg-card`
 * with a soft border; the illustration alternates sides for visual rhythm.
 * A large typographic index number floats in the background for depth.
 */
function CapabilityCardShell({ card, index }: { card: Capability; index: number }) {
  const imageRight = index % 2 === 0;

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-border/50 bg-card">
      {/* Background index — texture, not noise */}
      <span
        aria-hidden
        className="pointer-events-none absolute select-none font-bold leading-none tracking-tighter text-foreground/[0.028] dark:text-foreground/[0.04]"
        style={{
          fontSize: 'clamp(140px, 22vw, 260px)',
          right: imageRight ? 'auto' : '-0.05em',
          left: imageRight ? '-0.05em' : 'auto',
          top: '-0.12em',
          lineHeight: 1,
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="relative grid h-full items-center gap-5 p-6 text-center sm:gap-10 sm:p-12 lg:grid-cols-2 lg:gap-14 lg:p-14 lg:text-left">
        {/* Copy */}
        <div className={cn('order-2', imageRight ? 'lg:order-1' : 'lg:order-2')}>
          <p className="text-eyebrow mb-3 text-primary sm:mb-4">{card.eyebrow}</p>
          <h3 className="mx-auto max-w-md text-pretty text-[1.35rem] font-semibold leading-snug tracking-tight text-foreground sm:text-2xl lg:mx-0 lg:text-[1.9rem] lg:leading-[1.2]">
            {card.title}
          </h3>
        </div>

        {/* Illustration */}
        <div
          className={cn(
            'order-1 flex items-center justify-center',
            imageRight ? 'lg:order-2' : 'lg:order-1'
          )}
        >
          <div className="relative aspect-square w-full max-w-[190px] sm:max-w-[320px] lg:max-w-[360px]">
            <Image
              src={card.image}
              alt={card.eyebrow}
              fill
              priority={index === 0}
              sizes="(max-width: 640px) 190px, (max-width: 1024px) 320px, 360px"
              className="object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:drop-shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A single card in the scroll-locked stack. Each card gets an equal slice of the
 * scroll. Within its slice it slides up quickly to fully cover the previous card,
 * then *rests* (dwells) for the remainder — so the user always reads a clean,
 * single card before the next one swaps in. The first card starts already placed.
 */
function StackedCapabilityCard({
  card,
  index,
  total,
  progress,
}: {
  card: Capability;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const slice = 1 / total;
  const slideStart = index * slice;
  // Slide occupies the first 45% of the slice; the rest is the dwell/pause.
  const slideEnd = slideStart + slice * 0.45;

  // Card 0 is the static base. Cards 1..n-1 slide up, then hold (clamped).
  const y = useTransform(
    progress,
    index === 0 ? [0, 1] : [slideStart, slideEnd],
    index === 0 ? ['0%', '0%'] : ['100%', '0%']
  );

  return (
    <motion.div style={{ y, zIndex: index }} className="absolute inset-0">
      <CapabilityCardShell card={card} index={index} />
    </motion.div>
  );
}

/**
 * Scroll-locked stack of capability cards. A tall outer section pins a single
 * viewport-height frame; as the user scrolls through it, each card slides up to
 * fully cover the previous one. Falls back to a plain vertical list when the
 * user prefers reduced motion (no scroll hijacking).
 */
function StackedCapabilities() {
  const reduceMotion = useReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const useScrollStack = isDesktop && !reduceMotion;
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const cards = getStackedCapabilities();
  const scrollVelocity = useVelocity(scrollYProgress);
  // Show when stopped or scrolling up; fade out on intentional downward scroll.
  // Deadband [0, 0.05] ignores micro-scrolls; fully gone by 0.4 progress-units/s.
  const indicatorOpacity = useTransform(scrollVelocity, [0.05, 0.4], [1, 0]);

  if (!useScrollStack) {
    return (
      <div className="mx-auto max-w-5xl px-5 pb-16 pt-16 sm:px-6 sm:pb-28 sm:pt-28 lg:px-8">
        <div className="mb-8 sm:mb-16">
          <p className="text-eyebrow mb-4">More than a document</p>
          <h2 className={CAPABILITIES_HEADING_CLASS}>
            Your <RotatingWord /> resume that works for you.
          </h2>
        </div>
        <div className="space-y-5 sm:space-y-8">
          {cards.map((card, i) => (
            <div
              key={card.id}
              className="overflow-hidden rounded-[28px] border border-border/50 shadow-[0_50px_120px_-60px_rgba(0,0,0,0.55)] ring-1 ring-black/[0.03] dark:ring-white/[0.04]"
            >
              <CapabilityCardShell card={card} index={i} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section ref={containerRef} className="relative" style={{ height: `${cards.length * 100}vh` }}>
      {/*
        The entire frame — pinned heading + card stack — sticks to the top for
        the full scroll duration. The heading stays put while each card slides
        up to cover the previous one; once the last card lands, the section
        releases and the page scrolls normally. Scroll-driven motion means
        reverse scrolling replays the sequence backwards.
      */}
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-5xl px-4 pt-20 sm:px-6 sm:pt-24 lg:px-8">
          <div>
            <p className="text-eyebrow mb-4">More than a document</p>
            <h2 className={CAPABILITIES_HEADING_CLASS}>
              Your <RotatingWord /> resume that works for you.
            </h2>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <div className="relative h-full max-h-[480px] w-full max-w-5xl overflow-hidden rounded-[28px] border border-border/50 shadow-[0_50px_120px_-60px_rgba(0,0,0,0.55)] ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
            {cards.map((card, i) => (
              <StackedCapabilityCard
                key={card.id}
                card={card}
                index={i}
                total={cards.length}
                progress={scrollYProgress}
              />
            ))}
          </div>
        </div>

        <ScrollIndicator opacity={indicatorOpacity} />
      </div>
    </section>
  );
}

function Capabilities() {
  return <StackedCapabilities />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Hero
   ═══════════════════════════════════════════════════════════════════════════ */

function HeroCTA() {
  return (
    <Link href="/sign-up" className="block w-full sm:inline-block sm:w-auto">
      <Button size="lg" className="h-12 w-full rounded-full px-6 text-base sm:h-11 sm:w-auto">
        Build Your Follio
      </Button>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Resume showcase — a polished, recruiter-ready resume rendered from a Follio,
   paired with a single get-started CTA. Sits right after the capability stack
   to ground the abstract claims in a concrete, well-formatted document.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Tracks a CSS media query. Defaults to `false` on the server and the first
 * client render so SSR output is deterministic, then upgrades after mount.
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const sync = () => setMatches(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, [query]);

  return matches;
}

const RESUME_COPY = {
  eyebrow: 'A Follio resume',
  heading: 'This is what your Follio resume looks like.',
  body: 'Clean, ATS-friendly, and perfectly typeset — generated automatically from your profile, exportable in a click, and always in sync with your latest updates. No templates to wrangle, no formatting to fix.',
} as const;

const RESUME_SURFACE_CLASS =
  'overflow-hidden rounded-lg border border-border/70 bg-white shadow-[0_24px_60px_-24px_rgb(0_0_0/0.3)] ring-1 ring-black/[0.02] dark:bg-gray-950';

/**
 * Fixed A4 sheet (210 × 297) for the desktop pinned showcase. Height drives
 * layout; width follows the ratio. (Mobile uses its own teaser preview.)
 */
const RESUME_A4_CLASS = 'aspect-[210/297] h-[80vh] max-h-[760px]';

/**
 * Static fallback used on small screens and when the visitor prefers reduced
 * motion. The resume sits in a fixed-height, internally scrollable page so the
 * full document is still readable without any scroll hijacking.
 */
function ResumeShowcaseStatic() {
  return (
    <section className="border-t border-border/60 bg-muted/20">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-28 lg:px-8">
        <div className="grid items-center gap-10 sm:gap-12 lg:grid-cols-2 lg:gap-16">
          <FadeIn>
            <div className="max-w-xl text-center lg:text-left">
              <p className="text-eyebrow mb-4">{RESUME_COPY.eyebrow}</p>
              <h2 className="text-display text-balance text-2xl text-foreground sm:text-3xl lg:text-[2.5rem]">
                {RESUME_COPY.heading}
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty text-[15px] leading-7 text-muted-foreground sm:mt-5 sm:text-base lg:mx-0 lg:max-w-none">
                {RESUME_COPY.body}
              </p>
              <div className="mt-7 sm:mt-8">
                <Link href="/sign-up" className="block w-full sm:inline-block sm:w-auto">
                  <Button
                    size="lg"
                    className="h-12 w-full rounded-full px-6 text-base sm:h-11 sm:w-auto"
                  >
                    Create yours
                  </Button>
                </Link>
              </div>
            </div>
          </FadeIn>

          {/*
            Mobile/tablet preview: a non-scrollable A4 teaser. The document is
            top-aligned and clipped, with a fade at the bottom edge signalling
            "there's more" — deliberately avoiding a nested scroll area, which
            on touch devices traps the page scroll.
          */}
          <FadeIn delay={0.1}>
            <div className="flex justify-center lg:justify-end">
              <div
                className={cn(
                  RESUME_SURFACE_CLASS,
                  'relative aspect-[210/297] w-full max-w-[300px] overflow-hidden sm:max-w-[360px]'
                )}
              >
                <ResumeIllustration />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent dark:from-gray-950" />
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Resume showcase — a polished, recruiter-ready resume rendered from a Follio.

   On desktop the section pins to the viewport: as the visitor scrolls, the
   page is held in place while the resume scrolls through internally, top to
   bottom. Once the document reaches its end, the pin releases and the page
   continues.

   The internal scroll is derived from the window scroll position (framer's
   `scrollY`) and the section's own document offset — NOT from `useScroll`'s
   target/offset mapping, which mis-reports progress when the target's height is
   set dynamically or contains a `position: sticky` child (that bug made the
   resume open part-way down). The math is exact: the resume sits at its very
   top (`y = 0`) the instant the section pins, and at its very bottom
   (`y = -maxScroll`) when the pin releases. Reduced-motion and small-screen
   visitors get the static fallback.
   ═══════════════════════════════════════════════════════════════════════════ */

function ResumeShowcase() {
  const prefersReducedMotion = useReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const sectionRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [maxScroll, setMaxScroll] = useState(0);

  // Pin geometry, kept in a ref so the scroll handler always reads fresh values
  // without re-subscribing: `start` = document Y where the section pins,
  // `max` = internal scroll distance of the resume.
  const metricsRef = useRef({ start: 0, max: 0 });

  const { scrollY } = useScroll();
  const y = useMotionValue(0);
  const progress = useMotionValue(0);
  const hintOpacity = useTransform(progress, [0, 0.08], [1, 0]);

  const pinned = isDesktop && !prefersReducedMotion;

  useEffect(() => {
    if (!pinned) {
      y.set(0);
      progress.set(0);
      return;
    }

    const section = sectionRef.current;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!section || !viewport || !content) return;

    const apply = (scroll: number) => {
      const { start, max } = metricsRef.current;
      const offset = Math.min(0, Math.max(-max, -(scroll - start)));
      y.set(offset);
      progress.set(max > 0 ? -offset / max : 0);
    };

    const measure = () => {
      // Document-absolute top of the section (stable regardless of pin state).
      const start = section.getBoundingClientRect().top + window.scrollY;
      const max = Math.max(0, content.scrollHeight - viewport.clientHeight);
      metricsRef.current = { start, max };
      setMaxScroll(max);
      apply(window.scrollY);
    };

    measure();
    const unsubscribe = scrollY.on('change', apply);
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);

    return () => {
      unsubscribe();
      observer.disconnect();
    };
  }, [pinned, y, progress, scrollY]);

  if (!pinned) {
    return <ResumeShowcaseStatic />;
  }

  return (
    <section
      ref={sectionRef}
      className="relative border-t border-border/60 bg-muted/20"
      style={{ height: `calc(100vh + ${maxScroll}px)` }}
    >
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <ScrollIndicator opacity={hintOpacity} />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          {/* ── Copy + CTA ── */}
          <div className="max-w-xl">
            <p className="text-eyebrow mb-4">{RESUME_COPY.eyebrow}</p>
            <h2 className="text-display text-3xl text-foreground sm:text-[2.5rem]">
              {RESUME_COPY.heading}
            </h2>
            <p className="mt-5 text-pretty text-[15px] leading-7 text-muted-foreground sm:text-base">
              {RESUME_COPY.body}
            </p>

            <div className="mt-8 flex items-center gap-5">
              <Link href="/sign-up">
                <Button size="lg" className="rounded-full px-6">
                  Create yours
                </Button>
              </Link>
              <motion.span
                style={{ opacity: hintOpacity }}
                className="text-xs text-muted-foreground"
                aria-hidden
              >
                Scroll to read the full résumé ↓
              </motion.span>
            </div>

            {/* Read-progress bar */}
            <div className="mt-6 h-[3px] w-40 overflow-hidden rounded-full bg-border/70">
              <motion.div
                className="h-full origin-left rounded-full bg-primary"
                style={{ scaleX: progress }}
              />
            </div>
          </div>

          {/* ── Pinned, internally scrolling resume ── */}
          <div className="flex justify-center lg:justify-end">
            <div
              ref={viewportRef}
              className={cn(RESUME_SURFACE_CLASS, RESUME_A4_CLASS, 'relative')}
            >
              <motion.div ref={contentRef} style={{ y }} className="w-full">
                <ResumeIllustration />
              </motion.div>

              {/* Edge fades signal there is more to scroll */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white to-transparent dark:from-gray-950" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent dark:from-gray-950" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
   Rotating headline word

   Cycles through four adjectives, each anchored at the same left edge.
   The word width is intentionally not fixed — each adjective extends as
   far right as its own characters need. The accent gradient stays on the
   slot; only the text swaps. Pauses on hover/focus and when the tab is
   hidden; respects prefers-reduced-motion.
   ─────────────────────────────────────────────────────────────────────────── */

const ROTATING_WORDS = [
  'living',
  'adaptive',
  'parsable',
  'answering',
  'errorless',
  'connected',
  'shareable',
  'self-improving',
] as const;
const ROTATION_INTERVAL_MS = 2400;

/**
 * Shared timing for every part of the word swap. The container's width glide,
 * the exiting word sliding up, and the entering word sliding in all use this
 * exact same duration + easing so they move as one synchronized motion.
 */
const SWAP_DURATION_S = 0.5;
const SWAP_EASE = [0.22, 1, 0.36, 1] as const;

function RotatingWord() {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const sizerRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);

  const word = ROTATING_WORDS[index];

  // Measure the actual rendered width of the current word and glide the
  // container to it. Measuring the real in-flow sizer (rather than a cached
  // table) guarantees the container width always exactly equals the word's
  // width — so there is always precisely one normal space before "resume",
  // never a merge and never an extra gap. Re-runs whenever the word changes,
  // and after webfonts settle / on resize, since metrics shift then.
  useLayoutEffect(() => {
    const measure = () => {
      if (sizerRef.current) setWidth(sizerRef.current.getBoundingClientRect().width);
    };
    measure();
    window.addEventListener('resize', measure);
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(measure).catch(() => {});
    }
    return () => window.removeEventListener('resize', measure);
  }, [word]);

  useEffect(() => {
    if (reduceMotion || paused) return;

    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);

    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % ROTATING_WORDS.length);
    }, ROTATION_INTERVAL_MS);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduceMotion, paused]);

  return (
    <motion.span
      className="relative inline-flex items-baseline align-baseline"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-live="polite"
      aria-atomic="true"
      style={{ overflow: 'clip', overflowClipMargin: '0.35em' }}
      animate={width !== undefined ? { width } : undefined}
      transition={{ duration: reduceMotion ? 0 : SWAP_DURATION_S, ease: SWAP_EASE }}
    >
      {/*
       * In-flow sizer: the current word rendered invisibly. It establishes the
       * container's natural height + baseline and is the element measured to
       * drive the animated width above.
       */}
      <span ref={sizerRef} aria-hidden className="invisible select-none whitespace-nowrap">
        {word}
      </span>

      {/*
       * Visible words. The entering and exiting word are absolutely positioned
       * at the same origin so they overlap and slide vertically past each other
       * — neither ever shifts the other horizontally. The container's width
       * glides to the new word's width in step with the swap.
       */}
      <AnimatePresence initial={false}>
        <motion.span
          key={word}
          initial={reduceMotion ? { opacity: 0 } : { y: '0.6em', opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: '-0.6em', opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.2 : SWAP_DURATION_S, ease: SWAP_EASE }}
          className="absolute left-0 top-0 whitespace-nowrap bg-gradient-to-r from-primary to-primary/70 bg-clip-text align-baseline text-transparent"
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

function Hero() {
  const { scrollY } = useScroll();
  // Start fading at 80px (ignores micro-scrolls), fully gone by 160px
  const scrollIndicatorOpacity = useTransform(scrollY, [80, 160], [1, 0]);

  return (
    <section className="relative flex min-h-[calc(100svh-3.5rem)] items-center overflow-hidden border-b border-border/60">
      <div className="mx-auto w-full max-w-5xl px-5 pb-16 pt-8 text-left sm:px-6 sm:pb-24 sm:pt-16 lg:px-8">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-eyebrow"
        >
          The living resume
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.06 }}
          className="text-display mt-4 max-w-3xl text-balance text-[2.4rem] text-foreground sm:mt-5 sm:text-[3.5rem] lg:text-[4rem]"
        >
          A resume that does things a PDF never could.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.14 }}
          className="mt-5 max-w-2xl text-pretty text-[15px] leading-7 text-muted-foreground sm:mt-6 sm:text-lg sm:leading-8"
        >
          {/* Mobile: a tight, scannable promise. Desktop: the full positioning. */}
          <span className="sm:hidden">
            {isPortfolioEnabled()
              ? 'Build one living profile and share it as a resume, portfolio, or quick snapshot — all from a single link.'
              : 'Build a living resume you can share, refine, and export — all from a single link.'}
          </span>
          <span className="hidden sm:inline">
            {isPortfolioEnabled()
              ? 'Follio is a web app for job seekers and professionals to build one living profile and share it as a resume, portfolio, or quick snapshot through a single link, with clean formatting, viewer-adaptive presentation, and AI assistance that helps answer recruiter questions and suggest skills based on market trends.'
              : 'Follio is a web app for job seekers and professionals to build a living resume you can share, refine, and export — with clean formatting and AI assistance that helps answer recruiter questions and suggest skills based on market trends.'}
          </span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.22 }}
          className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4"
        >
          <HeroCTA />
          <Link
            href="/sign-in"
            className="inline-flex h-12 items-center justify-center rounded-full px-5 text-base font-medium text-foreground transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:h-11 sm:text-[15px]"
          >
            Sign in
          </Link>
        </motion.div>
      </div>

      <ScrollIndicator opacity={scrollIndicatorOpacity} />
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Landing page
   ═══════════════════════════════════════════════════════════════════════════ */

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <AppHeader
        tone="marketing"
        left={<Logo href="/" size="md" />}
        right={
          <>
            <Link
              href="/sign-in"
              className="hidden h-8 items-center rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex h-8 items-center rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Get started
            </Link>
          </>
        }
      />

      <Hero />

      {/* ─── Capabilities: scroll-locked stacking cards ──────────────────── */}
      <Capabilities />

      {/* ─── Resume showcase: the well-formatted resume + get-started CTA ─── */}
      <ResumeShowcase />

      {/* ─── Final CTA ───────────────────────────────────────────────────── */}
      <section className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-6 sm:py-32 lg:px-8">
          <FadeIn>
            <p className="text-eyebrow">Get started</p>
            <h2 className="text-display mx-auto mt-4 max-w-2xl text-balance text-3xl text-foreground sm:text-[2.75rem]">
              Stop sending PDFs, start sharing Follio links.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-pretty text-[15px] leading-7 text-muted-foreground sm:text-base">
              Set up your Follio in a few minutes. Free to start, no credit card.
            </p>
            <div className="mt-9 flex items-center justify-center">
              <Link href="/sign-up" className="block w-full sm:inline-block sm:w-auto">
                <Button
                  size="lg"
                  className="h-12 w-full rounded-full px-6 text-base sm:h-11 sm:w-auto"
                >
                  Create your Follio
                </Button>
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-14 lg:px-8">
          <p className="max-w-3xl text-xs leading-6 text-muted-foreground">
            {isPortfolioEnabled()
              ? 'Follio helps you build a living, shareable professional resume and portfolio.'
              : 'Follio helps you build a living, shareable professional resume.'}{' '}
            When you sign in with Google, we use the basic profile information provided by Google —
            your name, email address, and profile picture — to create and secure your account and
            personalize your workspace. We do not access Gmail, Drive, Contacts, or other Google
            services. For full details, see our{' '}
            <Link
              href="/privacy"
              className="text-foreground underline-offset-4 transition-colors hover:text-primary"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        <div className="border-t border-border/60">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-6 lg:px-8">
            <div className="flex items-center gap-2.5">
              <Logo size="sm" showText={false} />
              <span className="text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} Follio
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/privacy" className="transition-colors hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms" className="transition-colors hover:text-foreground">
                Terms
              </Link>
              <Link href="/contact" className="transition-colors hover:text-foreground">
                Contact
              </Link>
              <Link
                href="/admin/sign-in"
                className="transition-colors hover:text-foreground"
                aria-label="Admin"
                title="Admin"
              >
                <Shield className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
