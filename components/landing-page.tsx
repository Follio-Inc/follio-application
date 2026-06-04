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
import Link from 'next/link';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Logo } from '@/components/Logo';
import { AppHeader } from '@/components/app-header';
import { ResumeIllustration } from '@/components/resume-illustration';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
    { title: 'Cascade', tag: 'Open Source', tone: 'from-primary/30 to-primary/5' },
    { title: 'Atlas DB', tag: 'Work', tone: 'from-indigo-500/25 to-indigo-500/5' },
    { title: 'Vellum', tag: 'Side project', tone: 'from-amber-500/25 to-amber-500/5' },
    { title: 'Ledger', tag: 'Work', tone: 'from-rose-500/20 to-rose-500/5' },
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

function ViewSwitcher() {
  const [active, setActive] = useState<ViewKey>('follio');
  const current = VIEWS.find((v) => v.key === active) ?? VIEWS[0];
  const Mock = current.Mock;

  return (
    <div>
      <div className="mb-5 flex justify-center">
        <div
          className="inline-flex items-center rounded-full border border-border/70 bg-card p-1 shadow-sm"
          role="tablist"
          aria-label="Preview view"
        >
          {VIEWS.map((v) => {
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

const STEPS = [
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
   Capability illustrations

   House style — borrowed from Google's product spot illustrations:
   playful, clear, functional. Bold rounded geometry, a restrained palette
   built entirely from the teal `--primary` token plus neutral surface tokens,
   generous negative space, and a single focal "moment" per scene. Every art
   piece shares the same viewBox, stroke weights, corner radii, and palette so
   the set reads as one family.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Shared drawing constants so every capability illustration stays on-model. */
const ART_STROKE = 2.5;
const ART_CLASS = {
  /** Soft tinted backdrop blob. */
  backdrop: 'fill-[hsl(var(--primary)/0.06)]',
  /** Card / panel surfaces. */
  surface: 'fill-[hsl(var(--card))]',
  /** Hairline borders on surfaces. */
  border: 'stroke-[hsl(var(--border))]',
  /** Filled teal accent. */
  accent: 'fill-[hsl(var(--primary))]',
  /** Soft teal accent fill. */
  accentSoft: 'fill-[hsl(var(--primary)/0.15)]',
  /** Teal accent stroke. */
  accentStroke: 'stroke-[hsl(var(--primary))]',
  /** Neutral placeholder text bars. */
  textBar: 'fill-[hsl(var(--muted-foreground)/0.22)]',
  /** Fainter neutral bars. */
  textBarFaint: 'fill-[hsl(var(--muted-foreground)/0.13)]',
} as const;

/**
 * Self-improving — the resume keeps watch on the market and surfaces the
 * skills you should add. The scene shows a resume card, a rising trend line,
 * and a suggested "+ skill" being offered up with a spark of intelligence.
 */
function SelfImprovingArt() {
  return (
    <svg
      viewBox="0 0 360 280"
      role="img"
      aria-label="A resume that watches market trends and suggests new skills to add"
      className="h-full w-full"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Backdrop blob */}
      <rect x="34" y="40" width="292" height="206" rx="32" className={ART_CLASS.backdrop} />

      {/* ── Resume card ── */}
      <rect
        x="62"
        y="72"
        width="124"
        height="156"
        rx="14"
        className={cn(ART_CLASS.surface, ART_CLASS.border)}
        strokeWidth={ART_STROKE}
      />

      {/* Avatar tile + person glyph */}
      <rect x="80" y="92" width="30" height="30" rx="9" className={ART_CLASS.accentSoft} />
      <circle cx="95" cy="103" r="5.5" className={ART_CLASS.accent} />
      <path
        d="M85.5 116.5c0-4.4 4.3-7 9.5-7s9.5 2.6 9.5 7"
        className={ART_CLASS.accentStroke}
        strokeWidth={ART_STROKE}
      />

      {/* Name + role bars */}
      <rect x="118" y="96" width="48" height="7" rx="3.5" className={ART_CLASS.textBar} />
      <rect x="118" y="109" width="30" height="5" rx="2.5" className={ART_CLASS.textBarFaint} />

      {/* Body content bars */}
      <rect x="80" y="138" width="86" height="6" rx="3" className={ART_CLASS.textBarFaint} />
      <rect x="80" y="152" width="72" height="6" rx="3" className={ART_CLASS.textBarFaint} />
      <rect x="80" y="166" width="86" height="6" rx="3" className={ART_CLASS.textBarFaint} />
      <rect x="80" y="180" width="58" height="6" rx="3" className={ART_CLASS.textBarFaint} />

      {/* ── Trend panel (floating, overlapping the card) ── */}
      <rect
        x="190"
        y="150"
        width="116"
        height="80"
        rx="13"
        className={cn(ART_CLASS.surface, ART_CLASS.border)}
        strokeWidth={ART_STROKE}
      />
      {/* Baseline grid */}
      <line
        x1="204"
        y1="214"
        x2="292"
        y2="214"
        className="stroke-[hsl(var(--border))]"
        strokeWidth="1.5"
      />
      <line
        x1="204"
        y1="194"
        x2="292"
        y2="194"
        className="stroke-[hsl(var(--border)/0.6)]"
        strokeWidth="1.5"
        strokeDasharray="3 4"
      />
      <line
        x1="204"
        y1="174"
        x2="292"
        y2="174"
        className="stroke-[hsl(var(--border)/0.6)]"
        strokeWidth="1.5"
        strokeDasharray="3 4"
      />
      {/* Rising trend line */}
      <path
        d="M206 208 L228 198 L250 202 L272 182 L290 166"
        className={ART_CLASS.accentStroke}
        strokeWidth={ART_STROKE + 0.5}
      />
      {/* Vertex dots */}
      <circle cx="228" cy="198" r="3" className={ART_CLASS.accent} />
      <circle cx="250" cy="202" r="3" className={ART_CLASS.accent} />
      <circle cx="272" cy="182" r="3" className={ART_CLASS.accent} />
      {/* Leading point with ring */}
      <circle cx="290" cy="166" r="6.5" className={ART_CLASS.accentSoft} />
      <circle cx="290" cy="166" r="3.5" className={ART_CLASS.accent} />
      {/* Upward arrow head on the trend */}
      <path
        d="M283 168 L290 160 L297 168"
        className={ART_CLASS.accentStroke}
        strokeWidth={ART_STROKE}
      />

      {/* ── Suggested skill pill (the recommendation) ── */}
      <rect x="168" y="58" width="112" height="30" rx="15" className={ART_CLASS.accent} />
      <circle cx="184" cy="73" r="8" className="fill-[hsl(var(--primary-foreground))]" />
      <path
        d="M184 69.5v7M180.5 73h7"
        className="stroke-[hsl(var(--primary))]"
        strokeWidth={ART_STROKE}
      />
      <rect
        x="199"
        y="68"
        width="46"
        height="5.5"
        rx="2.75"
        className="fill-[hsl(var(--primary-foreground)/0.9)]"
      />
      <rect
        x="199"
        y="77"
        width="30"
        height="4.5"
        rx="2.25"
        className="fill-[hsl(var(--primary-foreground)/0.55)]"
      />

      {/* ── Intelligence sparkles ── */}
      <path
        d="M150 104c0 7-2 9-9 9 7 0 9 2 9 9 0-7 2-9 9-9-7 0-9-2-9-9Z"
        className={ART_CLASS.accent}
      />
      <path
        d="M298 108c0 4-1 5-5 5 4 0 5 1 5 5 0-4 1-5 5-5-4 0-5-1-5-5Z"
        className={ART_CLASS.accentSoft}
      />
    </svg>
  );
}

/**
 * Adaptive — the same profile rendered as many views, and the *viewer* decides
 * which one to see. Three fanned "view" cards sit behind a floating lens
 * switcher; a cursor (the recruiter's hand) is mid-click on the active lens,
 * making "the audience chooses" the focal moment.
 */
function AdaptiveArt() {
  return (
    <svg
      viewBox="0 0 360 280"
      role="img"
      aria-label="One profile shown as three different views, with a viewer choosing which one to see"
      className="h-full w-full"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Backdrop blob */}
      <rect x="34" y="40" width="292" height="206" rx="32" className={ART_CLASS.backdrop} />

      {/* ── Left card: the visual / portfolio view (image grid) ── */}
      <g transform="rotate(-11 132 168)">
        <rect
          x="84"
          y="104"
          width="96"
          height="132"
          rx="14"
          className={cn(ART_CLASS.surface, ART_CLASS.border)}
          strokeWidth={ART_STROKE}
        />
        {/* header band */}
        <rect x="98" y="118" width="68" height="11" rx="5.5" className={ART_CLASS.accentSoft} />
        {/* 2×2 image tiles */}
        <rect x="98" y="138" width="30" height="26" rx="6" className={ART_CLASS.accentSoft} />
        <rect x="136" y="138" width="30" height="26" rx="6" className={ART_CLASS.accentSoft} />
        <rect x="98" y="172" width="30" height="26" rx="6" className={ART_CLASS.accentSoft} />
        <rect x="136" y="172" width="30" height="26" rx="6" className={ART_CLASS.accentSoft} />
        {/* caption bars */}
        <rect x="98" y="208" width="56" height="5" rx="2.5" className={ART_CLASS.textBarFaint} />
      </g>

      {/* ── Right card: the snapshot view (donut stat) ── */}
      <g transform="rotate(11 228 168)">
        <rect
          x="180"
          y="104"
          width="96"
          height="132"
          rx="14"
          className={cn(ART_CLASS.surface, ART_CLASS.border)}
          strokeWidth={ART_STROKE}
        />
        {/* donut ring */}
        <circle
          cx="216"
          cy="150"
          r="22"
          className="stroke-[hsl(var(--border))]"
          strokeWidth={ART_STROKE}
        />
        <path
          d="M216 128 a22 22 0 0 1 19 33"
          className={ART_CLASS.accentStroke}
          strokeWidth={ART_STROKE + 1}
        />
        <circle cx="216" cy="150" r="6" className={ART_CLASS.accentSoft} />
        {/* stat bars */}
        <rect x="194" y="186" width="64" height="6" rx="3" className={ART_CLASS.textBarFaint} />
        <rect x="194" y="200" width="44" height="6" rx="3" className={ART_CLASS.textBarFaint} />
      </g>

      {/* ── Center card: the resume view (selected, elevated) ── */}
      <rect
        x="132"
        y="78"
        width="96"
        height="150"
        rx="15"
        className={ART_CLASS.surface}
        stroke="hsl(var(--primary))"
        strokeWidth={ART_STROKE}
      />
      {/* Avatar + identity */}
      <circle cx="152" cy="102" r="11" className={ART_CLASS.accentSoft} />
      <circle cx="152" cy="99" r="4.5" className={ART_CLASS.accent} />
      <path
        d="M144 110.5c0-3.6 3.6-5.5 8-5.5s8 1.9 8 5.5"
        className={ART_CLASS.accentStroke}
        strokeWidth="2"
      />
      <rect x="170" y="95" width="42" height="6" rx="3" className={ART_CLASS.textBar} />
      <rect x="170" y="106" width="28" height="5" rx="2.5" className={ART_CLASS.textBarFaint} />
      {/* divider */}
      <line
        x1="148"
        y1="126"
        x2="212"
        y2="126"
        className="stroke-[hsl(var(--border))]"
        strokeWidth="1.5"
      />
      {/* body lines */}
      <rect x="148" y="138" width="64" height="6" rx="3" className={ART_CLASS.textBarFaint} />
      <rect x="148" y="152" width="52" height="6" rx="3" className={ART_CLASS.textBarFaint} />
      <rect x="148" y="166" width="64" height="6" rx="3" className={ART_CLASS.textBarFaint} />
      <rect x="148" y="180" width="40" height="6" rx="3" className={ART_CLASS.textBarFaint} />
      <rect x="148" y="194" width="56" height="6" rx="3" className={ART_CLASS.textBarFaint} />

      {/* ── Floating lens switcher (the control the viewer drives) ── */}
      <rect
        x="116"
        y="44"
        width="128"
        height="34"
        rx="17"
        className={cn(ART_CLASS.surface, ART_CLASS.border)}
        strokeWidth={ART_STROKE}
      />
      {/* active segment */}
      <rect x="158" y="50" width="44" height="22" rx="11" className={ART_CLASS.accent} />
      {/* segment glyphs: list (left) · grid (active, center) · chart (right) */}
      <g className="stroke-[hsl(var(--muted-foreground)/0.5)]" strokeWidth="2.2">
        <line x1="130" y1="57" x2="144" y2="57" />
        <line x1="130" y1="65" x2="140" y2="65" />
      </g>
      <g className="stroke-[hsl(var(--primary-foreground))]" strokeWidth="2.2">
        <rect
          x="171"
          y="55"
          width="7"
          height="7"
          rx="1.5"
          className="fill-[hsl(var(--primary-foreground))]"
          stroke="none"
        />
        <rect
          x="182"
          y="55"
          width="7"
          height="7"
          rx="1.5"
          className="fill-[hsl(var(--primary-foreground))]"
          stroke="none"
        />
        <rect
          x="171"
          y="62"
          width="7"
          height="6"
          rx="1.5"
          className="fill-[hsl(var(--primary-foreground)/0.6)]"
          stroke="none"
        />
        <rect
          x="182"
          y="62"
          width="7"
          height="6"
          rx="1.5"
          className="fill-[hsl(var(--primary-foreground)/0.6)]"
          stroke="none"
        />
      </g>
      <g className="stroke-[hsl(var(--muted-foreground)/0.5)]" strokeWidth="2.2">
        <line x1="218" y1="64" x2="218" y2="58" />
        <line x1="224" y1="64" x2="224" y2="54" />
        <line x1="230" y1="64" x2="230" y2="60" />
      </g>

      {/* ── Viewer's cursor, mid-click on the active lens ── */}
      <g transform="translate(196 64)">
        {/* click ripple */}
        <circle
          cx="0"
          cy="0"
          r="13"
          className="stroke-[hsl(var(--primary)/0.4)]"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M0 0 L0 21 L5.5 15.5 L9.5 24 L13 22.5 L9 14.5 L16 14.5 Z"
          className="fill-[hsl(var(--foreground))] stroke-[hsl(var(--background))]"
          strokeWidth="2"
        />
      </g>
    </svg>
  );
}

/**
 * Talking — your Follio answers questions on your behalf. The background pane
 * is the resume the viewer is reading; a compact chat docks in the bottom-right
 * corner, so the scene reads as "someone asking questions while viewing your
 * resume." The answer bubble is teal with an AI spark to mark it as the
 * profile speaking for itself.
 */
function TalkingArt() {
  return (
    <svg
      viewBox="0 0 360 280"
      role="img"
      aria-label="A resume being read with a chat docked in the corner asking it questions"
      className="h-full w-full"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Backdrop blob */}
      <rect x="34" y="40" width="292" height="206" rx="32" className={ART_CLASS.backdrop} />

      {/* ── Resume pane (the page being read, fills the scene) ── */}
      <rect
        x="58"
        y="52"
        width="244"
        height="184"
        rx="16"
        className={cn(ART_CLASS.surface, ART_CLASS.border)}
        strokeWidth={ART_STROKE}
      />

      {/* Resume header: avatar + name + role */}
      <circle cx="92" cy="86" r="15" className={ART_CLASS.accentSoft} />
      <circle cx="92" cy="82" r="6" className={ART_CLASS.accent} />
      <path
        d="M81 95c0-5 5-7.5 11-7.5S103 90 103 95"
        className={ART_CLASS.accentStroke}
        strokeWidth="2.2"
      />
      <rect x="118" y="76" width="92" height="9" rx="4.5" className={ART_CLASS.textBar} />
      <rect x="118" y="91" width="58" height="6" rx="3" className={ART_CLASS.textBarFaint} />

      {/* Section divider */}
      <line
        x1="76"
        y1="116"
        x2="284"
        y2="116"
        className="stroke-[hsl(var(--border))]"
        strokeWidth="1.5"
      />

      {/* Left column: section heading + body lines */}
      <rect x="76" y="130" width="40" height="6" rx="3" className={ART_CLASS.accentSoft} />
      <rect x="76" y="144" width="120" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      <rect x="76" y="156" width="134" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      <rect x="76" y="168" width="104" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />

      {/* Second section */}
      <rect x="76" y="188" width="40" height="6" rx="3" className={ART_CLASS.accentSoft} />
      <rect x="76" y="202" width="128" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      <rect x="76" y="214" width="96" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />

      {/* Right rail: skill chips */}
      <rect x="226" y="130" width="58" height="14" rx="7" className={ART_CLASS.accentSoft} />
      <rect x="226" y="150" width="46" height="14" rx="7" className={ART_CLASS.accentSoft} />
      <rect x="226" y="170" width="52" height="14" rx="7" className={ART_CLASS.accentSoft} />

      {/* ── Docked chat (bottom-right corner, overlapping the page) ── */}
      <g>
        {/* soft lift shadow */}
        <rect
          x="194"
          y="118"
          width="134"
          height="140"
          rx="16"
          className="fill-[hsl(var(--foreground)/0.06)]"
        />
        <rect
          x="190"
          y="114"
          width="134"
          height="140"
          rx="16"
          className={cn(ART_CLASS.surface, ART_CLASS.border)}
          strokeWidth={ART_STROKE}
        />

        {/* Chat header: small profile + live online dot */}
        <circle cx="208" cy="132" r="7" className={ART_CLASS.accentSoft} />
        <circle cx="208" cy="130" r="2.8" className={ART_CLASS.accent} />
        <path
          d="M202.5 136c0-2.4 2.5-3.6 5.5-3.6s5.5 1.2 5.5 3.6"
          className={ART_CLASS.accentStroke}
          strokeWidth="1.6"
        />
        <rect x="221" y="128" width="48" height="5" rx="2.5" className={ART_CLASS.textBar} />
        <circle cx="312" cy="132" r="3.2" className={ART_CLASS.accent} />
        <line
          x1="198"
          y1="146"
          x2="316"
          y2="146"
          className="stroke-[hsl(var(--border))]"
          strokeWidth="1.5"
        />

        {/* Question bubble — viewer's message, just sent (left, neutral) */}
        <path
          d="M202 154h52a8 8 0 0 1 8 8v7a8 8 0 0 1-8 8h-42l-9 6 1-6a8 8 0 0 1-8-8v-7a8 8 0 0 1 6-8Z"
          className="fill-[hsl(var(--muted))] stroke-[hsl(var(--border))]"
          strokeWidth="2"
        />
        <rect x="208" y="161" width="42" height="4.5" rx="2.25" className={ART_CLASS.textBar} />
        <rect
          x="208"
          y="169"
          width="28"
          height="4.5"
          rx="2.25"
          className={ART_CLASS.textBarFaint}
        />

        {/* Answer bubble — resume replying RIGHT NOW (right, teal, typing dots) */}
        <path
          d="M268 190h44a8 8 0 0 1 8 8v5a8 8 0 0 1-8 8h-2l1 6-8-6h-35a8 8 0 0 1-8-8v-5a8 8 0 0 1 8-8Z"
          className={ART_CLASS.accent}
        />
        {/* animated typing indicator */}
        <g className="fill-[hsl(var(--primary-foreground))]">
          <circle cx="278" cy="200.5" r="2.6">
            <animate
              attributeName="opacity"
              values="0.3;1;0.3"
              dur="1.2s"
              begin="0s"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="289" cy="200.5" r="2.6">
            <animate
              attributeName="opacity"
              values="0.3;1;0.3"
              dur="1.2s"
              begin="0.2s"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="300" cy="200.5" r="2.6">
            <animate
              attributeName="opacity"
              values="0.3;1;0.3"
              dur="1.2s"
              begin="0.4s"
              repeatCount="indefinite"
            />
          </circle>
        </g>
        {/* AI spark marking the reply as the profile speaking */}
        <path
          d="M252 188c0 4.5-1.5 6-6 6 4.5 0 6 1.5 6 6 0-4.5 1.5-6 6-6-4.5 0-6-1.5-6-6Z"
          className={ART_CLASS.accent}
        />

        {/* Active input bar — viewer typing the next question (caret + send) */}
        <rect
          x="200"
          y="226"
          width="86"
          height="22"
          rx="11"
          className={cn(ART_CLASS.surface, ART_CLASS.border)}
          strokeWidth="2"
        />
        <rect x="210" y="234.5" width="48" height="5" rx="2.5" className={ART_CLASS.textBarFaint} />
        {/* blinking caret to signal active typing */}
        <line
          x1="262"
          y1="231"
          x2="262"
          y2="243"
          className={ART_CLASS.accentStroke}
          strokeWidth="2"
        >
          <animate attributeName="opacity" values="1;1;0;0" dur="1s" repeatCount="indefinite" />
        </line>
        {/* send button */}
        <circle cx="304" cy="237" r="12" className={ART_CLASS.accent} />
        <path
          d="M299 237h9M304 232.5l4.5 4.5-4.5 4.5"
          className="stroke-[hsl(var(--primary-foreground))]"
          strokeWidth="2.2"
        />
      </g>
    </svg>
  );
}

/**
 * Parsable — every Follio is stored as clean, structured JSON rather than a
 * flattened page of pixels. The scene shows the rendered resume on the left
 * transforming, field by field, into tidy key/value JSON on the right — so
 * machines (ATS, exporters, APIs) read it perfectly every time.
 */
function ParsableArt() {
  return (
    <svg
      viewBox="0 0 360 280"
      role="img"
      aria-label="A resume converting cleanly into structured JSON data"
      className="h-full w-full"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Backdrop blob */}
      <rect x="34" y="40" width="292" height="206" rx="32" className={ART_CLASS.backdrop} />

      {/* ── Rendered resume card (the human-readable source) ── */}
      <rect
        x="56"
        y="66"
        width="108"
        height="148"
        rx="14"
        className={cn(ART_CLASS.surface, ART_CLASS.border)}
        strokeWidth={ART_STROKE}
      />
      {/* avatar + identity */}
      <circle cx="78" cy="90" r="11" className={ART_CLASS.accentSoft} />
      <circle cx="78" cy="87" r="4.5" className={ART_CLASS.accent} />
      <path
        d="M70 98.5c0-3.6 3.6-5.5 8-5.5s8 1.9 8 5.5"
        className={ART_CLASS.accentStroke}
        strokeWidth="2"
      />
      <rect x="96" y="83" width="52" height="6.5" rx="3.25" className={ART_CLASS.textBar} />
      <rect x="96" y="94" width="34" height="5" rx="2.5" className={ART_CLASS.textBarFaint} />
      <line
        x1="70"
        y1="116"
        x2="150"
        y2="116"
        className="stroke-[hsl(var(--border))]"
        strokeWidth="1.5"
      />
      {/* body lines */}
      <rect x="70" y="128" width="80" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      <rect x="70" y="140" width="66" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      <rect x="70" y="158" width="34" height="5.5" rx="2.75" className={ART_CLASS.accentSoft} />
      <rect x="70" y="172" width="78" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      <rect x="70" y="184" width="58" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />

      {/* ── Transform arrow ── */}
      <circle cx="180" cy="140" r="15" className={ART_CLASS.accentSoft} />
      <path
        d="M172 140h13M180 134l6 6-6 6"
        className={ART_CLASS.accentStroke}
        strokeWidth={ART_STROKE}
      />

      {/* ── JSON panel (the clean machine-readable output) ── */}
      <rect
        x="196"
        y="66"
        width="108"
        height="148"
        rx="14"
        className={cn(ART_CLASS.surface, ART_CLASS.border)}
        strokeWidth={ART_STROKE}
      />
      {/* window dots */}
      <circle cx="208" cy="80" r="2.5" className={ART_CLASS.textBarFaint} />
      <circle cx="217" cy="80" r="2.5" className={ART_CLASS.textBarFaint} />
      <circle cx="226" cy="80" r="2.5" className={ART_CLASS.textBarFaint} />
      <line
        x1="196"
        y1="92"
        x2="304"
        y2="92"
        className="stroke-[hsl(var(--border))]"
        strokeWidth="1.5"
      />

      {/* braces */}
      <path
        d="M212 104c-4 0-5 1-5 5v6c0 3-1 4-3 4 2 0 3 1 3 4v6c0 4 1 5 5 5"
        className={ART_CLASS.accentStroke}
        strokeWidth="2.2"
      />
      <path
        d="M288 104c4 0 5 1 5 5v6c0 3 1 4 3 4-2 0-3 1-3 4v6c0 4-1 5-5 5"
        className={ART_CLASS.accentStroke}
        strokeWidth="2.2"
      />

      {/* key / value rows */}
      {/* row 1 */}
      <rect x="220" y="104" width="22" height="5.5" rx="2.75" className={ART_CLASS.accent} />
      <rect x="247" y="104" width="34" height="5.5" rx="2.75" className={ART_CLASS.textBar} />
      {/* row 2 */}
      <rect x="220" y="120" width="18" height="5.5" rx="2.75" className={ART_CLASS.accent} />
      <rect x="243" y="120" width="38" height="5.5" rx="2.75" className={ART_CLASS.textBar} />
      {/* row 3 (nested) */}
      <rect x="226" y="136" width="20" height="5.5" rx="2.75" className={ART_CLASS.accent} />
      <rect x="251" y="136" width="30" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      {/* row 4 (nested) */}
      <rect x="226" y="150" width="26" height="5.5" rx="2.75" className={ART_CLASS.accent} />
      <rect x="257" y="150" width="24" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      {/* row 5 */}
      <rect x="220" y="170" width="20" height="5.5" rx="2.75" className={ART_CLASS.accent} />
      <rect x="245" y="170" width="36" height="5.5" rx="2.75" className={ART_CLASS.textBar} />
      {/* row 6 */}
      <rect x="220" y="186" width="16" height="5.5" rx="2.75" className={ART_CLASS.accent} />
      <rect x="241" y="186" width="30" height="5.5" rx="2.75" className={ART_CLASS.textBar} />

      {/* validation tick — parses cleanly */}
      <circle cx="290" cy="206" r="13" className={ART_CLASS.accent} />
      <path
        d="M284 206l4 4 8-8"
        className="stroke-[hsl(var(--primary-foreground))]"
        strokeWidth={ART_STROKE}
      />
    </svg>
  );
}

/**
 * Errorless — a backend of intelligent checks reviews the resume for far more
 * than typos: weak phrasing, design/spacing issues, and common rare mistakes.
 * The scene shows the resume under an inspecting lens with issues being caught
 * and resolved into green ticks.
 */
function ErrorlessArt() {
  return (
    <svg
      viewBox="0 0 360 280"
      role="img"
      aria-label="A resume being checked for writing, design, and content mistakes"
      className="h-full w-full"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Backdrop blob */}
      <rect x="34" y="40" width="292" height="206" rx="32" className={ART_CLASS.backdrop} />

      {/* ── Resume under review ── */}
      <rect
        x="70"
        y="56"
        width="160"
        height="176"
        rx="15"
        className={cn(ART_CLASS.surface, ART_CLASS.border)}
        strokeWidth={ART_STROKE}
      />
      {/* identity */}
      <circle cx="96" cy="84" r="13" className={ART_CLASS.accentSoft} />
      <circle cx="96" cy="81" r="5" className={ART_CLASS.accent} />
      <path
        d="M86 92c0-4.2 4.5-6.5 10-6.5S106 87.8 106 92"
        className={ART_CLASS.accentStroke}
        strokeWidth="2.2"
      />
      <rect x="118" y="76" width="78" height="7" rx="3.5" className={ART_CLASS.textBar} />
      <rect x="118" y="88" width="50" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      <line
        x1="86"
        y1="110"
        x2="214"
        y2="110"
        className="stroke-[hsl(var(--border))]"
        strokeWidth="1.5"
      />

      {/* Line 1 — checked clean (green tick) */}
      <rect x="86" y="122" width="96" height="6" rx="3" className={ART_CLASS.textBarFaint} />
      <circle cx="198" cy="125" r="8" className={ART_CLASS.accent} />
      <path
        d="M194 125l3 3 5-5"
        className="stroke-[hsl(var(--primary-foreground))]"
        strokeWidth="2.2"
      />

      {/* Line 2 — weak phrasing flagged (wavy underline) */}
      <rect x="86" y="142" width="110" height="6" rx="3" className={ART_CLASS.textBar} />
      <path
        d="M86 153c4-3 8-3 12 0s8 3 12 0 8-3 12 0 8 3 12 0"
        className="stroke-[hsl(var(--primary))]"
        strokeWidth="2"
      />

      {/* Line 3 — spacing/design issue flagged (bracket marker) */}
      <rect x="86" y="166" width="74" height="6" rx="3" className={ART_CLASS.textBarFaint} />
      <rect
        x="166"
        y="164"
        width="40"
        height="10"
        rx="3"
        className="stroke-[hsl(var(--primary)/0.5)]"
        strokeWidth="2"
        strokeDasharray="4 3"
      />

      {/* Line 4 — checked clean */}
      <rect x="86" y="186" width="100" height="6" rx="3" className={ART_CLASS.textBarFaint} />
      <circle cx="198" cy="189" r="8" className={ART_CLASS.accent} />
      <path
        d="M194 189l3 3 5-5"
        className="stroke-[hsl(var(--primary-foreground))]"
        strokeWidth="2.2"
      />

      {/* Line 5 */}
      <rect x="86" y="206" width="80" height="6" rx="3" className={ART_CLASS.textBarFaint} />

      {/* ── Inspecting magnifier (the intelligent check) ── */}
      <g>
        <circle
          cx="244"
          cy="172"
          r="34"
          className="fill-[hsl(var(--card))] stroke-[hsl(var(--primary))]"
          strokeWidth={ART_STROKE + 1}
        />
        <circle cx="244" cy="172" r="34" className="fill-[hsl(var(--primary)/0.05)]" />
        {/* handle */}
        <line
          x1="268"
          y1="196"
          x2="288"
          y2="216"
          className={ART_CLASS.accentStroke}
          strokeWidth={ART_STROKE + 2}
        />
        {/* big tick inside the lens — overall verdict */}
        <path
          d="M232 172l8 8 16-17"
          className={ART_CLASS.accentStroke}
          strokeWidth={ART_STROKE + 0.5}
        />
      </g>

      {/* ── Floating check categories (writing · design · content) ── */}
      <g>
        {/* writing badge */}
        <rect
          x="222"
          y="58"
          width="76"
          height="24"
          rx="12"
          className={cn(ART_CLASS.surface, ART_CLASS.border)}
          strokeWidth="2"
        />
        <path
          d="M236 70h2M242 66l3 8 3-8M252 70h6"
          className={ART_CLASS.accentStroke}
          strokeWidth="2"
        />
        <rect x="264" y="67" width="26" height="5" rx="2.5" className={ART_CLASS.textBarFaint} />
        {/* design badge */}
        <rect x="244" y="92" width="68" height="22" rx="11" className={ART_CLASS.accent} />
        <rect
          x="256"
          y="100"
          width="9"
          height="6"
          rx="1.5"
          className="fill-[hsl(var(--primary-foreground))]"
        />
        <rect
          x="269"
          y="100"
          width="34"
          height="5"
          rx="2.5"
          className="fill-[hsl(var(--primary-foreground)/0.85)]"
        />
      </g>

      {/* Intelligence spark */}
      <path
        d="M58 120c0 6-2 8-8 8 6 0 8 2 8 8 0-6 2-8 8-8-6 0-8-2-8-8Z"
        className={ART_CLASS.accentSoft}
      />
    </svg>
  );
}

/**
 * Shareable — one living source distributed by link, never by file. The scene
 * shows a single profile card at left feeding a central share hub, which hands
 * out two links: a public one (globe) and a private one (lock) — full access
 * control with nothing to download or version.
 */
function ShareableArt() {
  return (
    <svg
      viewBox="0 0 360 280"
      role="img"
      aria-label="A single profile shared through a public link and a private link"
      className="h-full w-full"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Backdrop blob */}
      <rect x="34" y="40" width="292" height="206" rx="32" className={ART_CLASS.backdrop} />

      {/* ── Single source card (one living Follio) ── */}
      <rect
        x="48"
        y="66"
        width="104"
        height="148"
        rx="14"
        className={cn(ART_CLASS.surface, ART_CLASS.border)}
        strokeWidth={ART_STROKE}
      />
      {/* avatar + identity */}
      <circle cx="70" cy="90" r="11" className={ART_CLASS.accentSoft} />
      <circle cx="70" cy="87" r="4.5" className={ART_CLASS.accent} />
      <path
        d="M62 98.5c0-3.6 3.6-5.5 8-5.5s8 1.9 8 5.5"
        className={ART_CLASS.accentStroke}
        strokeWidth="2"
      />
      <rect x="88" y="83" width="50" height="6.5" rx="3.25" className={ART_CLASS.textBar} />
      <rect x="88" y="94" width="32" height="5" rx="2.5" className={ART_CLASS.textBarFaint} />
      <line
        x1="62"
        y1="116"
        x2="138"
        y2="116"
        className="stroke-[hsl(var(--border))]"
        strokeWidth="1.5"
      />
      {/* body lines */}
      <rect x="62" y="128" width="76" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      <rect x="62" y="140" width="62" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      <rect x="62" y="158" width="32" height="5.5" rx="2.75" className={ART_CLASS.accentSoft} />
      <rect x="62" y="172" width="74" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      <rect x="62" y="184" width="54" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />

      {/* ── Connectors from source to the two links ── */}
      <path d="M196 134C206 118 200 98 214 98" className={ART_CLASS.accentStroke} strokeWidth="2" />
      <path
        d="M196 146C206 162 200 182 214 182"
        className={ART_CLASS.accentStroke}
        strokeWidth="2"
      />

      {/* ── Central share hub (chain link) ── */}
      <circle cx="180" cy="140" r="16" className={ART_CLASS.accentSoft} />
      <rect
        x="170"
        y="133"
        width="12"
        height="10"
        rx="5"
        className={ART_CLASS.accentStroke}
        strokeWidth="2.2"
      />
      <rect
        x="178"
        y="137"
        width="12"
        height="10"
        rx="5"
        className={ART_CLASS.accentStroke}
        strokeWidth="2.2"
      />

      {/* ── Public link pill (globe) ── */}
      <rect
        x="214"
        y="78"
        width="96"
        height="40"
        rx="20"
        className={cn(ART_CLASS.surface, ART_CLASS.border)}
        strokeWidth={ART_STROKE}
      />
      <circle cx="234" cy="98" r="11" className={ART_CLASS.accentSoft} />
      <circle cx="234" cy="98" r="11" className={ART_CLASS.accentStroke} strokeWidth="1.8" />
      <ellipse
        cx="234"
        cy="98"
        rx="4.5"
        ry="11"
        className={ART_CLASS.accentStroke}
        strokeWidth="1.8"
      />
      <line
        x1="223"
        y1="98"
        x2="245"
        y2="98"
        className={ART_CLASS.accentStroke}
        strokeWidth="1.8"
      />
      <rect x="252" y="91" width="46" height="6" rx="3" className={ART_CLASS.textBar} />
      <rect x="252" y="102" width="30" height="5" rx="2.5" className={ART_CLASS.textBarFaint} />

      {/* ── Private link pill (lock) ── */}
      <rect
        x="214"
        y="162"
        width="96"
        height="40"
        rx="20"
        className={cn(ART_CLASS.surface, ART_CLASS.border)}
        strokeWidth={ART_STROKE}
      />
      <path d="M229 180v-4a5 5 0 0 1 10 0v4" className={ART_CLASS.accentStroke} strokeWidth="2.2" />
      <rect x="227" y="180" width="14" height="12" rx="2.5" className={ART_CLASS.accent} />
      <circle cx="234" cy="185" r="1.8" className="fill-[hsl(var(--primary-foreground))]" />
      <rect
        x="233"
        y="186"
        width="2"
        height="4"
        rx="1"
        className="fill-[hsl(var(--primary-foreground))]"
      />
      <rect x="252" y="175" width="46" height="6" rx="3" className={ART_CLASS.textBar} />
      <rect x="252" y="186" width="30" height="5" rx="2.5" className={ART_CLASS.textBarFaint} />
    </svg>
  );
}

/**
 * Connected — the Follio pulls from the places your work already lives. A central
 * profile card syncs through a hub to three source pills (GitHub, Medium,
 * LinkedIn), with a refresh mark signalling it stays continuously up to date.
 */
function ConnectedArt() {
  const sources = [
    { y: 64, label: 'GH' },
    { y: 118, label: 'M' },
    { y: 172, label: 'in' },
  ];
  return (
    <svg
      viewBox="0 0 360 280"
      role="img"
      aria-label="A Follio profile syncing with GitHub, Medium, and LinkedIn to stay up to date"
      className="h-full w-full"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Backdrop blob */}
      <rect x="34" y="40" width="292" height="206" rx="32" className={ART_CLASS.backdrop} />

      {/* ── Central profile card (the living Follio) ── */}
      <rect
        x="44"
        y="74"
        width="104"
        height="132"
        rx="14"
        className={cn(ART_CLASS.surface, ART_CLASS.border)}
        strokeWidth={ART_STROKE}
      />
      {/* avatar + identity */}
      <circle cx="66" cy="98" r="11" className={ART_CLASS.accentSoft} />
      <circle cx="66" cy="95" r="4.5" className={ART_CLASS.accent} />
      <path
        d="M58 106.5c0-3.6 3.6-5.5 8-5.5s8 1.9 8 5.5"
        className={ART_CLASS.accentStroke}
        strokeWidth="2"
      />
      <rect x="84" y="91" width="50" height="6.5" rx="3.25" className={ART_CLASS.textBar} />
      <rect x="84" y="102" width="32" height="5" rx="2.5" className={ART_CLASS.textBarFaint} />
      <line
        x1="58"
        y1="124"
        x2="134"
        y2="124"
        className="stroke-[hsl(var(--border))]"
        strokeWidth="1.5"
      />
      {/* body lines */}
      <rect x="58" y="136" width="76" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      <rect x="58" y="148" width="60" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      <rect x="58" y="166" width="34" height="5.5" rx="2.75" className={ART_CLASS.accentSoft} />
      <rect x="58" y="178" width="72" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />
      <rect x="58" y="190" width="52" height="5.5" rx="2.75" className={ART_CLASS.textBarFaint} />

      {/* ── Connectors: card → hub → each source pill ── */}
      <line
        x1="148"
        y1="140"
        x2="166"
        y2="140"
        className={ART_CLASS.accentStroke}
        strokeWidth="2"
      />
      <path d="M194 132C206 116 200 90 220 86" className={ART_CLASS.accentStroke} strokeWidth="2" />
      <line
        x1="196"
        y1="140"
        x2="220"
        y2="140"
        className={ART_CLASS.accentStroke}
        strokeWidth="2"
      />
      <path
        d="M194 148C206 164 200 190 220 194"
        className={ART_CLASS.accentStroke}
        strokeWidth="2"
      />

      {/* ── Sync hub (refresh arrows) ── */}
      <circle cx="180" cy="140" r="16" className={ART_CLASS.accentSoft} />
      <path d="M174 135a7 7 0 0 1 12 1" className={ART_CLASS.accentStroke} strokeWidth="2.2" />
      <path d="M186 130v6h-6" className={ART_CLASS.accentStroke} strokeWidth="2.2" />
      <path d="M186 145a7 7 0 0 1-12-1" className={ART_CLASS.accentStroke} strokeWidth="2.2" />
      <path d="M174 150v-6h6" className={ART_CLASS.accentStroke} strokeWidth="2.2" />

      {/* ── Source pills (GitHub · Medium · LinkedIn) ── */}
      {sources.map((s) => (
        <g key={s.label}>
          <rect
            x="220"
            y={s.y}
            width="96"
            height="40"
            rx="12"
            className={cn(ART_CLASS.surface, ART_CLASS.border)}
            strokeWidth={ART_STROKE}
          />
          <rect
            x={232}
            y={s.y + 9}
            width="22"
            height="22"
            rx="7"
            className={ART_CLASS.accentSoft}
          />
          <text
            x={243}
            y={s.y + 24}
            textAnchor="middle"
            className="fill-[hsl(var(--primary))] font-sans text-[11px] font-bold"
          >
            {s.label}
          </text>
          <rect x={264} y={s.y + 12} width="40" height="6" rx="3" className={ART_CLASS.textBar} />
          <rect
            x={264}
            y={s.y + 23}
            width="26"
            height="5"
            rx="2.5"
            className={ART_CLASS.textBarFaint}
          />
        </g>
      ))}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Capabilities — what makes a Follio different from a PDF

   A vertical stack of alternating text / illustration rows. Each row pairs a
   short claim with a bespoke Google-style spot illustration. Built to grow one
   capability at a time; add entries to CAPABILITIES as their art is finished.
   ═══════════════════════════════════════════════════════════════════════════ */

type Capability = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  Art: () => ReactNode;
};

const CAPABILITIES: readonly Capability[] = [
  {
    id: 'adaptive',
    eyebrow: 'Adaptive',
    title: 'You build it once. Every viewer reads it their way.',
    body: 'You are only the author of your resume — the people who open it are its real users. A PDF freezes them into the single layout you chose. Follio hands control back: the same profile becomes a recruiter-ready resume, a visual portfolio, or a quick snapshot, and each viewer picks the lens that fits them.',
    Art: AdaptiveArt,
  },
  {
    id: 'talking',
    eyebrow: 'Talking',
    title: 'It answers questions — even when you are not there.',
    body: 'A recruiter wonders whether you have shipped to production, led a team, or worked with a certain stack. Instead of guessing from a static page, they just ask. Follio answers in plain language, grounded only in what is actually on your profile.',
    Art: TalkingArt,
  },
  {
    id: 'errorless',
    eyebrow: 'Errorless',
    title: 'It catches the mistakes that quietly cost you interviews.',
    body: 'Intelligent checks review your Follio for far more than typos. They flag weak phrasing, inconsistent tense, vague bullet points, and design slips like uneven spacing or cramped sections — the common and easy-to-miss issues that make a resume look unpolished. You fix them before a recruiter ever sees them.',
    Art: ErrorlessArt,
  },
  {
    id: 'parsable',
    eyebrow: 'Parsable',
    title: 'Stored as clean data, so machines read it perfectly.',
    body: 'Behind every view, your Follio lives as clean, structured JSON — not a flattened image of text. That means applicant tracking systems, exporters, and integrations read every field exactly right, with nothing lost to broken columns or unreadable PDFs.',
    Art: ParsableArt,
  },
  {
    id: 'connected',
    eyebrow: 'Connected',
    title: 'It plugs into where your work already lives.',
    body: 'Link your GitHub, Medium, and LinkedIn and Follio pulls in your repositories, writing, and experience — then keeps them in sync. New project shipped or article published? Your Follio updates itself, so the version everyone sees is never out of date.',
    Art: ConnectedArt,
  },
  {
    id: 'shareable',
    eyebrow: 'Shareable',
    title: 'One link to share — public or private, fully under your control.',
    body: 'No more emailing PDFs or juggling “resume_final_v3” files. Share your Follio with a single link: make it public for the world, or keep it private for one recruiter. You decide exactly who gets in, change your mind any time, and everyone always sees the latest version — nothing to download, nothing to re-send.',
    Art: ShareableArt,
  },
  {
    id: 'self-improving',
    eyebrow: 'Skill-aware',
    title: 'It tracks the market and tells you which hot skills you’re missing.',
    body: 'Follio watches live job-market trends and compares them to your profile, then flags the in-demand skills you don’t yet have and suggests exactly what to learn next. You always know where you stand — and what to add to stay competitive.',
    Art: SelfImprovingArt,
  },
] as const;

/**
 * Per-capability surface tint. A calm two-stop gradient laid over an opaque
 * `bg-card` base so cards always fully cover the one beneath them — no bleed —
 * while still reading as distinct, colourful surfaces. Keyed by capability id.
 */
const CAPABILITY_TINTS: Record<string, string> = {
  'self-improving': 'from-rose-100 to-orange-50 dark:from-rose-900/40 dark:to-orange-900/25',
  shareable: 'from-cyan-100 to-blue-50 dark:from-cyan-900/40 dark:to-blue-900/25',
  adaptive: 'from-sky-100 to-indigo-50 dark:from-sky-900/40 dark:to-indigo-900/25',
  talking: 'from-violet-100 to-fuchsia-50 dark:from-violet-900/40 dark:to-fuchsia-900/25',
  errorless: 'from-emerald-100 to-teal-50 dark:from-emerald-900/40 dark:to-teal-900/25',
  parsable: 'from-amber-100 to-orange-50 dark:from-amber-900/40 dark:to-orange-900/25',
  connected: 'from-teal-100 to-emerald-50 dark:from-teal-900/40 dark:to-emerald-900/25',
};

/** Display order for the stacked cards — leads with the headline capability. */
const CAPABILITY_STACK_ORDER = [
  'self-improving',
  'adaptive',
  'talking',
  'connected',
  'shareable',
  'errorless',
  'parsable',
] as const;

function getStackedCapabilities(): readonly Capability[] {
  return CAPABILITY_STACK_ORDER.map((id) => CAPABILITIES.find((c) => c.id === id)).filter(
    (c): c is Capability => Boolean(c)
  );
}

/** The shared visual shell for a card: opaque base + tint overlay + content. */
function CapabilityCardShell({
  card,
  index,
  total,
}: {
  card: Capability;
  index: number;
  total: number;
}) {
  const { Art } = card;
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[28px] bg-card">
      {/* Tint layer — opaque card underneath guarantees full coverage. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br',
          CAPABILITY_TINTS[card.id]
        )}
      />

      <div className="relative grid h-full items-center gap-8 p-8 sm:gap-12 sm:p-12 lg:grid-cols-2 lg:gap-14 lg:p-14">
        {/* Copy */}
        <div className="order-2 lg:order-1">
          <div className="mb-4 flex items-center gap-3">
            <span className="font-mono text-sm font-medium text-primary">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="h-px w-8 bg-primary/40" />
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
              {card.eyebrow}
            </span>
          </div>
          <h3 className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.6rem]">
            {card.title}
          </h3>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-[17px]">
            {card.body}
          </p>
        </div>

        {/* Illustration */}
        <div className="order-1 lg:order-2">
          <div className="mx-auto aspect-[360/280] w-full max-w-sm rounded-2xl border border-border/40 bg-card/70 p-3 shadow-sm">
            <Art />
          </div>
        </div>
      </div>

      {/* Quiet step counter, bottom-right. */}
      <div className="pointer-events-none absolute bottom-6 right-8 font-mono text-xs text-muted-foreground/60">
        {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
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
      <CapabilityCardShell card={card} index={index} total={total} />
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

  if (reduceMotion) {
    return (
      <div className="mx-auto max-w-5xl px-4 pb-20 pt-20 sm:px-6 sm:pb-28 sm:pt-28 lg:px-8">
        <div className="mb-12 sm:mb-16">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
            More than a document
          </p>
          <h2 className="whitespace-nowrap text-3xl font-semibold tracking-tight sm:text-4xl">
            Your <RotatingWord /> resume that works for you.
          </h2>
        </div>
        <div className="space-y-6 sm:space-y-8">
          {cards.map((card, i) => (
            <div
              key={card.id}
              className="h-[480px] overflow-hidden rounded-[28px] border border-border/60 shadow-[0_40px_90px_-50px_rgb(0_0_0/0.5)]"
            >
              <CapabilityCardShell card={card} index={i} total={cards.length} />
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
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
              More than a document
            </p>
            <h2 className="whitespace-nowrap text-3xl font-semibold tracking-tight sm:text-4xl">
              Your <RotatingWord /> resume that works for you.
            </h2>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
          <div className="relative h-full max-h-[480px] w-full max-w-5xl overflow-hidden rounded-[28px] border border-border/60 shadow-[0_40px_90px_-50px_rgb(0_0_0/0.5)]">
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
    <Link href="/sign-up">
      <Button size="lg" className="rounded-full px-6">
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

/** Fixed A4 sheet (210 × 297). Height drives layout; width follows the ratio. */
const RESUME_A4_CLASS = 'aspect-[210/297] h-[80vh] max-h-[760px]';

/**
 * Static fallback used on small screens and when the visitor prefers reduced
 * motion. The resume sits in a fixed-height, internally scrollable page so the
 * full document is still readable without any scroll hijacking.
 */
function ResumeShowcaseStatic() {
  return (
    <section className="border-t border-border/60 bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <FadeIn>
            <div className="max-w-xl">
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
                {RESUME_COPY.eyebrow}
              </p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {RESUME_COPY.heading}
              </h2>
              <p className="mt-5 text-pretty text-[15px] leading-7 text-muted-foreground sm:text-base">
                {RESUME_COPY.body}
              </p>
              <div className="mt-8">
                <Link href="/sign-up">
                  <Button size="lg" className="rounded-full px-6">
                    Create yours
                  </Button>
                </Link>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="flex justify-center lg:justify-end">
              <div className={cn(RESUME_SURFACE_CLASS, RESUME_A4_CLASS, 'overflow-y-auto')}>
                <ResumeIllustration />
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
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
              {RESUME_COPY.eyebrow}
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
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
      <span ref={sizerRef} aria-hidden className="invisible whitespace-nowrap select-none">
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
    <section className="relative flex min-h-[calc(100svh-3.5rem)] items-center overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-3xl" />

      <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-12 text-left sm:px-6 sm:pb-20 lg:px-8">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="max-w-3xl text-balance text-4xl font-semibold leading-[1.18] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
        >
          A resume that does things a PDF never could.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-6 max-w-3xl text-pretty text-[15px] leading-7 text-muted-foreground/90 sm:text-[18px] sm:leading-8"
        >
          <span className="block">Follio replaces outdated PDFs with a truly digital resume.</span>
          <span className="mt-2 block">
            It is{' '}
            <span className="font-medium text-foreground/90">
              free from parsing and formatting issues
            </span>
            , adapts to each viewer&apos;s interests,
          </span>
          <span className="block">
            suggests skills to learn based on job market trends, and answers recruiter questions on
            your behalf.
          </span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-8 flex items-center"
        >
          <HeroCTA />
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
    <div className="min-h-screen bg-background">
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
      <section className="border-t border-border/60">
        <div className="relative mx-auto max-w-5xl overflow-hidden px-4 py-24 text-center sm:px-6 sm:py-32 lg:px-8">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 mx-auto h-[300px] w-[600px] -translate-y-1/2 rounded-full bg-primary/[0.07] blur-3xl" />
          <FadeIn>
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Stop sending PDFs, start sharing Follio links.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">
              Set up your Follio in a few minutes. Free to start, no credit card.
            </p>
            <div className="mt-8 flex items-center justify-center">
              <Link href="/sign-up">
                <Button size="lg" className="rounded-full px-6">
                  Create your Follio
                </Button>
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
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
      </footer>
    </div>
  );
}
