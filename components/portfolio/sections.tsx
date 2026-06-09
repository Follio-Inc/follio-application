'use client';

/**
 * Portfolio Section Components - Modern Design System
 *
 * Pre-built, polished React components that render the PortfolioPlan.
 * The AI never generates code - it populates structured content that
 * maps to these hand-crafted, tested components.
 *
 * Design goals:
 * - Squarespace/Wix-level sleekness
 * - Glass-morphism, ambient backgrounds, layered depth
 * - Smooth scroll-triggered animations
 * - Rich micro-interactions
 * - Responsive by default
 */

import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Award,
  BookOpen,
  Briefcase,
  Calendar,
  ExternalLink,
  GitFork,
  Github,
  Globe,
  GraduationCap,
  Layers,
  Mail,
  MapPin,
  PenTool,
  Phone,
  Play,
  Quote,
  ShieldCheck,
  Star,
} from 'lucide-react';
import Image from 'next/image';
import React from 'react';

import type {
  AboutContent,
  AnimationLevel,
  AwardListContent,
  BlogShowcaseContent,
  CertificationListContent,
  ContactSectionContent,
  EducationListContent,
  ExperienceHighlightsContent,
  ExperienceTimelineContent,
  FooterConfig,
  GitHubShowcaseContent,
  HeroContent,
  LinksSectionContent,
  NavigationConfig,
  PortfolioComponentType,
  PortfolioSectionContent,
  ProjectGridContent,
  ProjectShowcaseContent,
  PullQuoteContent,
  SkillsDisplayContent,
  StatsBarContent,
  YouTubeShowcaseContent,
} from '@/types/portfolio';

import {
  getAnimationVariants,
  getBlurInVariants,
  getScaleInVariants,
  getStaggerConfig,
} from '@/lib/portfolio/theme';

// ============================================================================
// SHARED
// ============================================================================

interface SectionProps {
  content: PortfolioSectionContent;
  variant: string;
  animationLevel: AnimationLevel;
  intro?: string;
  heading?: string;
}

/** Wrapper that applies entrance animation to a section. */
function AnimatedSection({
  children,
  animationLevel,
  className = '',
}: {
  children: React.ReactNode;
  animationLevel: AnimationLevel;
  className?: string;
}) {
  const variants = getAnimationVariants(animationLevel);
  return (
    <motion.div
      initial={variants.initial}
      whileInView={variants.animate}
      viewport={{ once: true, margin: '-60px' }}
      transition={variants.transition}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Modern section heading with accent line, optional icon, and intro text. */
function SectionHeader({
  heading,
  intro,
  icon: Icon,
  overline,
  centered = false,
}: {
  heading?: string;
  intro?: string;
  icon?: React.ComponentType<{ className?: string }>;
  overline?: string;
  centered?: boolean;
}) {
  if (!heading) return null;
  return (
    <div className={`mb-12 ${centered ? 'text-center' : ''}`}>
      {overline && <p className="p-overline mb-3">{overline}</p>}
      <div className={`mb-3 flex items-center gap-3 ${centered ? 'justify-center' : ''}`}>
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--p-accent)/0.1)]">
            <Icon className="h-5 w-5 text-[hsl(var(--p-accent))]" />
          </div>
        )}
        <h2 className="p-h2">{heading}</h2>
      </div>
      {!centered && <div className="p-accent-line mt-3" />}
      {intro && (
        <p className={`p-body p-text-muted mt-4 ${centered ? 'mx-auto' : ''} max-w-2xl`}>{intro}</p>
      )}
    </div>
  );
}

// ============================================================================
// HERO - The first impression, make it count
// ============================================================================

export function PortfolioHeroSection({ content, variant, animationLevel }: SectionProps) {
  const hero = content as HeroContent;
  const blurIn = getBlurInVariants(animationLevel);
  const scaleIn = getScaleInVariants(animationLevel);
  const fadeUp = getAnimationVariants(animationLevel);

  if (variant === 'minimal') {
    return (
      <section className="p-section relative flex min-h-[65vh] flex-col items-start justify-center">
        <div className="p-glow -left-32 -top-32 h-[500px] w-[500px]" />
        <motion.div
          initial={blurIn.initial}
          animate={blurIn.animate}
          transition={blurIn.transition}
          className="relative z-10"
        >
          <p className="p-overline mb-6">Portfolio</p>
          <h1 className="p-hero-text mb-6 max-w-3xl">{hero.headline}</h1>
          <p className="p-body-lg p-text-muted max-w-xl">{hero.subheadline}</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href={hero.ctaTarget} className="p-btn-primary">
              {hero.ctaLabel}
            </a>
            {hero.secondaryCta && (
              <a href={hero.secondaryCta.target} className="p-btn-secondary">
                {hero.secondaryCta.label}
              </a>
            )}
          </div>
        </motion.div>
      </section>
    );
  }

  if (variant === 'split') {
    return (
      <section className="p-section relative flex min-h-[75vh] flex-col items-center gap-12 md:flex-row">
        <div className="p-glow -left-40 top-20 h-[400px] w-[400px]" />
        <div className="p-glow -right-20 bottom-10 h-[300px] w-[300px] opacity-10" />
        <motion.div
          className="relative z-10 flex-1"
          initial={blurIn.initial}
          animate={blurIn.animate}
          transition={blurIn.transition}
        >
          <p className="p-overline mb-6">Portfolio</p>
          <h1 className="p-hero-text mb-6">{hero.headline}</h1>
          <p className="p-body-lg p-text-muted max-w-lg">{hero.subheadline}</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href={hero.ctaTarget} className="p-btn-primary">
              {hero.ctaLabel}
            </a>
            {hero.secondaryCta && (
              <a href={hero.secondaryCta.target} className="p-btn-secondary">
                {hero.secondaryCta.label}
              </a>
            )}
          </div>
        </motion.div>
        {hero.showAvatar && hero.avatarUrl && (
          <motion.div
            className="relative z-10 flex-shrink-0"
            initial={scaleIn.initial}
            animate={scaleIn.animate}
            transition={{ ...scaleIn.transition, delay: 0.2 }}
          >
            <div className="relative">
              <div className="absolute -inset-4 rounded-2xl bg-[hsl(var(--p-accent)/0.08)] blur-2xl" />
              <Image
                src={hero.avatarUrl}
                alt="Profile"
                width={340}
                height={340}
                className="p-avatar relative rounded-2xl"
              />
            </div>
          </motion.div>
        )}
      </section>
    );
  }

  if (variant === 'bold') {
    return (
      <section className="p-ambient-bg relative flex min-h-[85vh] flex-col items-center justify-center text-center">
        <div className="p-glow left-1/2 top-1/4 h-[600px] w-[600px] -translate-x-1/2" />
        <motion.div
          className="relative z-10 px-4"
          initial={blurIn.initial}
          animate={blurIn.animate}
          transition={blurIn.transition}
        >
          {hero.showAvatar && hero.avatarUrl && (
            <motion.div
              initial={scaleIn.initial}
              animate={scaleIn.animate}
              transition={{ ...scaleIn.transition, delay: 0 }}
              className="mb-10"
            >
              <Image
                src={hero.avatarUrl}
                alt="Profile"
                width={120}
                height={120}
                className="p-avatar-round mx-auto"
              />
            </motion.div>
          )}
          <h1 className="p-hero-text mx-auto mb-6 max-w-5xl">{hero.headline}</h1>
          <p className="p-body-lg p-text-muted mx-auto max-w-2xl">{hero.subheadline}</p>
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <a href={hero.ctaTarget} className="p-btn-primary">
              {hero.ctaLabel}
            </a>
            {hero.secondaryCta && (
              <a href={hero.secondaryCta.target} className="p-btn-secondary">
                {hero.secondaryCta.label}
              </a>
            )}
          </div>
        </motion.div>
      </section>
    );
  }

  if (variant === 'editorial') {
    return (
      <section className="p-ambient-bg p-grid-bg relative flex min-h-[80vh] flex-col items-center justify-center text-center">
        <motion.div
          className="relative z-10 px-4"
          initial={blurIn.initial}
          animate={blurIn.animate}
          transition={blurIn.transition}
        >
          {hero.showAvatar && hero.avatarUrl && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mb-8"
            >
              <Image
                src={hero.avatarUrl}
                alt="Profile"
                width={88}
                height={88}
                className="p-avatar-round mx-auto"
              />
            </motion.div>
          )}
          <p className="p-overline mb-6">Portfolio</p>
          <h1 className="p-gradient-text p-hero-text mx-auto mb-6 max-w-4xl">{hero.headline}</h1>
          <p className="p-body-lg p-text-muted mx-auto max-w-xl">{hero.subheadline}</p>
          <motion.div
            className="mt-12 flex flex-wrap justify-center gap-4"
            initial={fadeUp.initial}
            animate={fadeUp.animate}
            transition={{ ...fadeUp.transition, delay: 0.3 }}
          >
            <a href={hero.ctaTarget} className="p-btn-primary">
              {hero.ctaLabel}
            </a>
            {hero.secondaryCta && (
              <a href={hero.secondaryCta.target} className="p-btn-secondary">
                {hero.secondaryCta.label}
              </a>
            )}
          </motion.div>
        </motion.div>
      </section>
    );
  }

  // Default: centered
  return (
    <section className="p-ambient-bg relative flex min-h-[75vh] flex-col items-center justify-center text-center">
      <div className="p-glow left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2" />
      <motion.div
        className="relative z-10 px-4"
        initial={blurIn.initial}
        animate={blurIn.animate}
        transition={blurIn.transition}
      >
        {hero.showAvatar && hero.avatarUrl && (
          <motion.div
            initial={scaleIn.initial}
            animate={scaleIn.animate}
            transition={{ ...scaleIn.transition, delay: 0 }}
            className="mb-8"
          >
            <Image
              src={hero.avatarUrl}
              alt="Profile"
              width={96}
              height={96}
              className="p-avatar-round mx-auto"
            />
          </motion.div>
        )}
        <h1 className="p-hero-text mx-auto mb-5 max-w-3xl">{hero.headline}</h1>
        <p className="p-body-lg p-text-muted mx-auto max-w-xl">{hero.subheadline}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <a href={hero.ctaTarget} className="p-btn-primary">
            {hero.ctaLabel}
          </a>
          {hero.secondaryCta && (
            <a href={hero.secondaryCta.target} className="p-btn-secondary">
              {hero.secondaryCta.label}
            </a>
          )}
        </div>
      </motion.div>
    </section>
  );
}
// ============================================================================
// ABOUT
// ============================================================================

export function PortfolioAboutSection({ content, animationLevel, heading, intro }: SectionProps) {
  const about = content as AboutContent;

  return (
    <AnimatedSection animationLevel={animationLevel}>
      <section className="p-section">
        <SectionHeader heading={heading || 'About'} intro={intro} />
        <div className="max-w-3xl">
          <p className="p-body-lg leading-relaxed">{about.text}</p>
          {about.highlightFacts && about.highlightFacts.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2.5">
              {about.highlightFacts.map((fact) => (
                <span key={fact} className="p-badge-accent">
                  {fact}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>
    </AnimatedSection>
  );
}

// ============================================================================
// STATS BAR - Impressive numbers at a glance
// ============================================================================

const STAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  briefcase: Briefcase,
  layers: Layers,
  star: Star,
  'pen-tool': PenTool,
  globe: Globe,
  award: Award,
};

export function PortfolioStatsBarSection({ content, variant, animationLevel }: SectionProps) {
  const stats = content as StatsBarContent;
  const stagger = getStaggerConfig(animationLevel);
  const scaleIn = getScaleInVariants(animationLevel);

  if (variant === 'cards') {
    return (
      <section className="p-section">
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          initial={stagger.initial}
          whileInView={stagger.animate}
          viewport={{ once: true, margin: '-60px' }}
        >
          {stats.stats.map((stat) => {
            const Icon = stat.icon ? STAT_ICONS[stat.icon] : null;
            return (
              <motion.div
                key={stat.label}
                className="p-card-flat flex flex-col items-center py-6 text-center"
                variants={scaleIn}
              >
                {Icon && (
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--p-accent)/0.1)]">
                    <Icon className="h-5 w-5 text-[hsl(var(--p-accent))]" />
                  </div>
                )}
                <span className="p-h2 font-bold">{stat.value}</span>
                <span className="p-small mt-1">{stat.label}</span>
              </motion.div>
            );
          })}
        </motion.div>
      </section>
    );
  }

  // Default: inline
  return (
    <section className="p-section">
      <motion.div
        className="p-card-glass flex flex-wrap items-center justify-center gap-8 py-6 md:gap-16"
        initial={stagger.initial}
        whileInView={stagger.animate}
        viewport={{ once: true, margin: '-60px' }}
      >
        {stats.stats.map((stat, i) => {
          const Icon = stat.icon ? STAT_ICONS[stat.icon] : null;
          return (
            <React.Fragment key={stat.label}>
              {i > 0 && <div className="hidden h-10 w-px bg-[hsl(var(--p-border)/0.3)] md:block" />}
              <motion.div className="flex flex-col items-center text-center" variants={scaleIn}>
                {Icon && <Icon className="mb-2 h-4 w-4 text-[hsl(var(--p-accent))]" />}
                <span className="p-h2 font-bold leading-none">{stat.value}</span>
                <span className="p-small mt-1.5">{stat.label}</span>
              </motion.div>
            </React.Fragment>
          );
        })}
      </motion.div>
    </section>
  );
}

// ============================================================================
// EXPERIENCE TIMELINE - Career journey with depth
// ============================================================================

function formatExpDate(date: string | null, isCurrent: boolean): string {
  if (isCurrent) return 'Present';
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  // Month-precision dates are stored as UTC; format in UTC to keep the month stable.
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function PortfolioExperienceTimelineSection({
  content,
  variant,
  animationLevel,
  heading,
  intro,
}: SectionProps) {
  const timeline = content as ExperienceTimelineContent;
  const stagger = getStaggerConfig(animationLevel);
  const itemVariants = getAnimationVariants(animationLevel);

  if (variant === 'compact') {
    return (
      <AnimatedSection animationLevel={animationLevel}>
        <section className="p-section">
          <SectionHeader heading={heading || 'Experience'} intro={intro} icon={Briefcase} />
          <motion.div
            className="space-y-4"
            initial={stagger.initial}
            whileInView={stagger.animate}
            viewport={{ once: true }}
          >
            {timeline.experiences.map((exp, i) => (
              <motion.div
                key={`${exp.company}-${exp.role}-${i}`}
                className="p-card-flat flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between"
                variants={itemVariants}
              >
                <div>
                  <h3 className="p-h3 text-base">{exp.role}</h3>
                  <p className="p-small p-text-accent font-medium">{exp.company}</p>
                </div>
                <span className="p-small shrink-0">
                  {formatExpDate(exp.startDate, false)} -{' '}
                  {formatExpDate(exp.endDate, exp.isCurrent)}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </section>
      </AnimatedSection>
    );
  }

  // Default: detailed timeline with line
  return (
    <AnimatedSection animationLevel={animationLevel}>
      <section className="p-section">
        <SectionHeader heading={heading || 'Experience'} intro={intro} icon={Briefcase} />
        <motion.div
          className="relative"
          initial={stagger.initial}
          whileInView={stagger.animate}
          viewport={{ once: true }}
        >
          <div className="p-timeline-line hidden md:block" />
          <div className="space-y-8">
            {timeline.experiences.map((exp, i) => (
              <motion.div
                key={`${exp.company}-${exp.role}-${i}`}
                className="relative md:pl-14"
                variants={itemVariants}
              >
                <div className="absolute left-[1.0625rem] top-[1.75rem] hidden md:block">
                  {i === 0 || exp.isCurrent ? (
                    <div className="p-timeline-dot" />
                  ) : (
                    <div className="p-timeline-dot-muted" />
                  )}
                </div>
                <div className="p-card">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      {exp.companyLogo && (
                        <Image
                          src={exp.companyLogo}
                          alt={exp.company}
                          width={40}
                          height={40}
                          className="mt-0.5 rounded-lg border border-[hsl(var(--p-border)/0.5)]"
                        />
                      )}
                      <div>
                        <h3 className="p-h3">{exp.role}</h3>
                        <p className="p-body p-text-accent text-sm font-medium">{exp.company}</p>
                      </div>
                    </div>
                    <div className="p-small flex shrink-0 items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 opacity-50" />
                      <span>
                        {formatExpDate(exp.startDate, false)} -{' '}
                        {formatExpDate(exp.endDate, exp.isCurrent)}
                      </span>
                    </div>
                  </div>
                  {exp.location && (
                    <div className="p-small mt-1.5 flex items-center gap-1.5 opacity-60">
                      <MapPin className="h-3 w-3" />
                      <span>{exp.location}</span>
                    </div>
                  )}
                  {exp.narrative && <p className="p-body p-text-muted mt-4">{exp.narrative}</p>}
                  {exp.bullets.length > 0 && (
                    <ul className="p-body mt-4 space-y-2">
                      {exp.bullets.slice(0, 5).map((bullet, bi) => (
                        <li key={bi} className="flex items-start gap-3">
                          <span className="p-accent-dot mt-2.5" />
                          <span className="p-text-muted">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>
    </AnimatedSection>
  );
}

// ============================================================================
// EXPERIENCE HIGHLIGHTS
// ============================================================================

export function PortfolioExperienceHighlightsSection({
  content,
  animationLevel,
  heading,
  intro,
}: SectionProps) {
  const highlights = content as ExperienceHighlightsContent;
  const stagger = getStaggerConfig(animationLevel);
  const itemVariants = getAnimationVariants(animationLevel);

  return (
    <AnimatedSection animationLevel={animationLevel}>
      <section className="p-section">
        <SectionHeader heading={heading || 'Career Highlights'} intro={intro} icon={Briefcase} />
        {highlights.narrative && (
          <p className="p-body-lg p-text-muted mb-10 max-w-3xl">{highlights.narrative}</p>
        )}
        <motion.div
          className="grid gap-5 md:grid-cols-2"
          initial={stagger.initial}
          whileInView={stagger.animate}
          viewport={{ once: true }}
        >
          {highlights.highlights.map((h, i) => (
            <motion.div
              key={i}
              className="p-card group relative overflow-hidden"
              variants={itemVariants}
            >
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[hsl(var(--p-accent)/0.05)] transition-transform duration-500 group-hover:scale-150" />
              <p className="p-overline mb-2">
                {h.company} &middot; {h.role}
              </p>
              <p className="p-body relative z-10">{h.highlight}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </AnimatedSection>
  );
}
// ============================================================================
// PROJECT SHOWCASE - Featured projects with visual flair
// ============================================================================

export function PortfolioProjectShowcaseSection({
  content,
  variant,
  animationLevel,
  heading,
  intro,
}: SectionProps) {
  const showcase = content as ProjectShowcaseContent;
  const stagger = getStaggerConfig(animationLevel);
  const itemVariants = getAnimationVariants(animationLevel);

  return (
    <AnimatedSection animationLevel={animationLevel}>
      <section className="p-section">
        <SectionHeader heading={heading || 'Featured Projects'} intro={intro} icon={Layers} />
        <motion.div
          className={`grid gap-6 ${variant === 'list' ? 'grid-cols-1' : 'md:grid-cols-2'}`}
          initial={stagger.initial}
          whileInView={stagger.animate}
          viewport={{ once: true }}
        >
          {showcase.projects.map((project) => (
            <motion.div
              key={project.title}
              className="p-card-interactive group"
              variants={itemVariants}
            >
              {project.imageUrl && variant !== 'compact' && variant !== 'technical' && (
                <div className="p-img-cover -mx-[var(--p-card-padding,1.5rem)] -mt-[var(--p-card-padding,1.5rem)] mb-5">
                  <div className="relative aspect-[16/9] overflow-hidden rounded-t-[0.9rem]">
                    <Image
                      src={project.imageUrl}
                      alt={project.title}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  </div>
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <h3 className="p-h3 transition-colors duration-300 group-hover:text-[hsl(var(--p-accent))]">
                  {project.title}
                </h3>
                <div className="flex shrink-0 gap-2 opacity-50 transition-opacity duration-200 group-hover:opacity-100">
                  {project.url && (
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg p-1.5 transition-colors hover:bg-[hsl(var(--p-muted))]"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  {project.repoUrl && (
                    <a
                      href={project.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg p-1.5 transition-colors hover:bg-[hsl(var(--p-muted))]"
                    >
                      <Github className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
              <p className="p-body p-text-muted mt-3">{project.narrative || project.description}</p>
              {project.techStack.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {project.techStack.map((tech) => (
                    <span key={tech} className="p-badge text-xs">
                      {tech}
                    </span>
                  ))}
                </div>
              )}
              {project.github && (
                <div className="p-small p-text-muted mt-4 flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 text-[hsl(var(--p-accent))]" />{' '}
                    {project.github.stars}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <GitFork className="h-3.5 w-3.5" /> {project.github.forks}
                  </span>
                  {project.github.language && (
                    <span className="flex items-center gap-1.5">
                      <span className="p-accent-dot" />
                      {project.github.language}
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </section>
    </AnimatedSection>
  );
}

// ============================================================================
// PROJECT GRID - All projects, compact
// ============================================================================

export function PortfolioProjectGridSection({
  content,
  animationLevel,
  heading,
  intro,
}: SectionProps) {
  const grid = content as ProjectGridContent;
  const stagger = getStaggerConfig(animationLevel);
  const itemVariants = getAnimationVariants(animationLevel);

  return (
    <AnimatedSection animationLevel={animationLevel}>
      <section className="p-section">
        <SectionHeader heading={heading || 'All Projects'} intro={intro} icon={Layers} />
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          initial={stagger.initial}
          whileInView={stagger.animate}
          viewport={{ once: true }}
        >
          {grid.projects.map((project) => (
            <motion.div
              key={project.title}
              className="p-card-interactive group"
              variants={itemVariants}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="p-h3 text-base transition-colors group-hover:text-[hsl(var(--p-accent))]">
                  {project.title}
                </h3>
                {project.url && (
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 opacity-40 transition-opacity group-hover:opacity-100"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                )}
              </div>
              <p className="p-small p-text-muted mt-2 line-clamp-2">{project.shortDesc}</p>
              {project.techStack.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1">
                  {project.techStack.slice(0, 4).map((tech) => (
                    <span key={tech} className="p-badge-outline text-xs">
                      {tech}
                    </span>
                  ))}
                </div>
              )}
              {project.github && (
                <div className="p-small p-text-muted mt-3 flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3" /> {project.github.stars}
                  </span>
                  {project.github.language && (
                    <span className="flex items-center gap-1.5">
                      <span className="p-accent-dot" />
                      {project.github.language}
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </section>
    </AnimatedSection>
  );
}

// ============================================================================
// SKILLS DISPLAY
// ============================================================================

export function PortfolioSkillsDisplaySection({
  content,
  variant,
  animationLevel,
  heading,
  intro,
}: SectionProps) {
  const skills = content as SkillsDisplayContent;
  const stagger = getStaggerConfig(animationLevel);
  const itemVariants = getAnimationVariants(animationLevel);
  const isTagView = variant === 'compact' || variant === 'tags' || variant === 'tag-cloud';

  if (isTagView) {
    const allSkills = [...skills.groups.flatMap((g) => g.skills), ...skills.ungrouped];
    return (
      <AnimatedSection animationLevel={animationLevel}>
        <section className="p-section">
          <SectionHeader heading={heading || 'Skills'} intro={intro} />
          <motion.div
            className="flex flex-wrap gap-2.5"
            initial={stagger.initial}
            whileInView={stagger.animate}
            viewport={{ once: true }}
          >
            {allSkills.map((skill) => (
              <motion.span key={skill.name} className="p-badge" variants={itemVariants}>
                {skill.name}
              </motion.span>
            ))}
          </motion.div>
        </section>
      </AnimatedSection>
    );
  }

  // Default: categorized grid
  return (
    <AnimatedSection animationLevel={animationLevel}>
      <section className="p-section">
        <SectionHeader heading={heading || 'Skills & Expertise'} intro={intro} />
        <motion.div
          className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
          initial={stagger.initial}
          whileInView={stagger.animate}
          viewport={{ once: true }}
        >
          {skills.groups.map((group) => (
            <motion.div key={group.name} className="p-card-flat" variants={itemVariants}>
              <h3 className="p-h3 mb-4 text-base">{group.name}</h3>
              <div className="flex flex-wrap gap-2">
                {group.skills.map((skill) => (
                  <span key={skill.name} className="p-badge-accent text-xs">
                    {skill.name}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
          {skills.ungrouped.length > 0 && (
            <motion.div className="p-card-flat" variants={itemVariants}>
              {skills.groups.length > 0 && <h3 className="p-h3 mb-4 text-base">Other</h3>}
              <div className="flex flex-wrap gap-2">
                {skills.ungrouped.map((skill) => (
                  <span key={skill.name} className="p-badge text-xs">
                    {skill.name}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </section>
    </AnimatedSection>
  );
}
// ============================================================================
// EDUCATION
// ============================================================================

export function PortfolioEducationListSection({
  content,
  animationLevel,
  heading,
  intro,
}: SectionProps) {
  const education = content as EducationListContent;
  const stagger = getStaggerConfig(animationLevel);
  const itemVariants = getAnimationVariants(animationLevel);

  return (
    <AnimatedSection animationLevel={animationLevel}>
      <section className="p-section">
        <SectionHeader heading={heading || 'Education'} intro={intro} icon={GraduationCap} />
        <motion.div
          className="space-y-5"
          initial={stagger.initial}
          whileInView={stagger.animate}
          viewport={{ once: true }}
        >
          {education.entries.map((entry, i) => (
            <motion.div key={i} className="p-card" variants={itemVariants}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  {entry.institutionLogo && (
                    <Image
                      src={entry.institutionLogo}
                      alt={entry.institution}
                      width={40}
                      height={40}
                      className="mt-0.5 rounded-lg border border-[hsl(var(--p-border)/0.5)]"
                    />
                  )}
                  <div>
                    <h3 className="p-h3">
                      {[entry.degree, entry.fieldOfStudy].filter(Boolean).join(' in ') ||
                        entry.institution}
                    </h3>
                    <p className="p-body p-text-accent text-sm font-medium">{entry.institution}</p>
                  </div>
                </div>
                {(entry.startDate || entry.endDate) && (
                  <div className="p-small flex shrink-0 items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 opacity-50" />
                    <span>
                      {entry.startDate ? formatExpDate(entry.startDate, false) : ''}
                      {entry.endDate || entry.isCurrent
                        ? ` - ${entry.isCurrent ? 'Present' : formatExpDate(entry.endDate, false)}`
                        : ''}
                    </span>
                  </div>
                )}
              </div>
              {entry.gpa && <p className="p-small mt-2">GPA: {entry.gpa}</p>}
              {entry.honors.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {entry.honors.map((h) => (
                    <span key={h} className="p-badge-accent text-xs">
                      {h}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </section>
    </AnimatedSection>
  );
}

// ============================================================================
// CERTIFICATIONS
// ============================================================================

export function PortfolioCertificationListSection({
  content,
  animationLevel,
  heading,
  intro,
}: SectionProps) {
  const certs = content as CertificationListContent;
  const stagger = getStaggerConfig(animationLevel);
  const itemVariants = getAnimationVariants(animationLevel);

  return (
    <AnimatedSection animationLevel={animationLevel}>
      <section className="p-section">
        <SectionHeader heading={heading || 'Certifications'} intro={intro} icon={ShieldCheck} />
        <motion.div
          className="grid gap-4 sm:grid-cols-2"
          initial={stagger.initial}
          whileInView={stagger.animate}
          viewport={{ once: true }}
        >
          {certs.entries.map((cert, i) => (
            <motion.div
              key={i}
              className="p-card group flex items-start gap-4"
              variants={itemVariants}
            >
              {cert.issuerLogo && (
                <Image
                  src={cert.issuerLogo}
                  alt={cert.issuer}
                  width={44}
                  height={44}
                  className="shrink-0 rounded-lg border border-[hsl(var(--p-border)/0.5)]"
                />
              )}
              <div className="min-w-0">
                <h3 className="p-h3 text-base">
                  {cert.credentialUrl ? (
                    <a
                      href={cert.credentialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-link"
                    >
                      {cert.name}
                    </a>
                  ) : (
                    cert.name
                  )}
                </h3>
                <p className="p-small p-text-muted mt-0.5">{cert.issuer}</p>
                {cert.issueDate && (
                  <p className="p-small p-text-muted mt-1 opacity-60">
                    {formatExpDate(cert.issueDate, false)}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </AnimatedSection>
  );
}

// ============================================================================
// AWARDS
// ============================================================================

export function PortfolioAwardListSection({
  content,
  animationLevel,
  heading,
  intro,
}: SectionProps) {
  const awards = content as AwardListContent;
  const stagger = getStaggerConfig(animationLevel);
  const itemVariants = getAnimationVariants(animationLevel);

  return (
    <AnimatedSection animationLevel={animationLevel}>
      <section className="p-section">
        <SectionHeader heading={heading || 'Awards & Recognition'} intro={intro} icon={Award} />
        <motion.div
          className="space-y-4"
          initial={stagger.initial}
          whileInView={stagger.animate}
          viewport={{ once: true }}
        >
          {awards.entries.map((award, i) => (
            <motion.div
              key={i}
              className="p-card group relative overflow-hidden"
              variants={itemVariants}
            >
              <div className="absolute -right-8 -top-8 h-16 w-16 rounded-full bg-[hsl(var(--p-accent)/0.06)]" />
              <div className="relative z-10 flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--p-accent)/0.1)]">
                  <Award className="h-5 w-5 text-[hsl(var(--p-accent))]" />
                </div>
                <div>
                  <h3 className="p-h3 text-base">{award.title}</h3>
                  <div className="p-small p-text-muted mt-1 flex items-center gap-2">
                    {award.issuer && <span>{award.issuer}</span>}
                    {award.issuer && award.date && <span>&middot;</span>}
                    {award.date && <span>{formatExpDate(award.date, false)}</span>}
                  </div>
                  {award.description && (
                    <p className="p-body p-text-muted mt-2 text-sm">{award.description}</p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </AnimatedSection>
  );
}
// ============================================================================
// GITHUB SHOWCASE - Platform-native feel
// ============================================================================

export function PortfolioGitHubShowcaseSection({
  content,
  variant,
  animationLevel,
  heading,
  intro,
}: SectionProps) {
  const gh = content as GitHubShowcaseContent;
  const stagger = getStaggerConfig(animationLevel);
  const itemVariants = getAnimationVariants(animationLevel);
  const scaleIn = getScaleInVariants(animationLevel);

  return (
    <AnimatedSection animationLevel={animationLevel}>
      <section className="p-section">
        <SectionHeader heading={heading || 'Open Source'} intro={intro} icon={Github} />
        {gh.narrative && <p className="p-body-lg p-text-muted mb-10 max-w-3xl">{gh.narrative}</p>}

        {/* GitHub profile with stats */}
        <div className="mb-10 flex flex-wrap items-center gap-8">
          {gh.avatarUrl && variant !== 'minimal' && (
            <a href={gh.profileUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <Image
                src={gh.avatarUrl}
                alt={gh.username}
                width={56}
                height={56}
                className="p-avatar-round"
              />
            </a>
          )}
          <div className="flex flex-wrap gap-6">
            <motion.div className="flex flex-col" variants={scaleIn}>
              <span className="p-h3 font-bold">{gh.stats.publicRepos}</span>
              <span className="p-small">Repositories</span>
            </motion.div>
            <motion.div className="flex flex-col" variants={scaleIn}>
              <span className="p-h3 font-bold">{gh.stats.totalStars}</span>
              <span className="p-small">Stars</span>
            </motion.div>
            <motion.div className="flex flex-col" variants={scaleIn}>
              <span className="p-h3 font-bold">{gh.stats.followers}</span>
              <span className="p-small">Followers</span>
            </motion.div>
          </div>
          <a
            href={gh.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-btn-ghost ml-auto hidden items-center gap-2 sm:flex"
          >
            <Github className="h-4 w-4" />@{gh.username}
            <ArrowUpRight className="h-3.5 w-3.5 opacity-50" />
          </a>
        </div>

        {/* Language bar */}
        {gh.languages.length > 0 && variant !== 'minimal' && (
          <div className="mb-10">
            <div className="p-lang-bar">
              {gh.languages.map((lang, i) => (
                <div
                  key={lang.name}
                  style={{ width: `${lang.percentage}%` }}
                  className={`bg-[hsl(var(--p-accent))] ${i === 0 ? 'rounded-l-full' : ''} ${i === gh.languages.length - 1 ? 'rounded-r-full' : ''}`}
                  title={`${lang.name}: ${lang.percentage}%`}
                />
              ))}
            </div>
            <div className="p-small mt-3 flex flex-wrap gap-4">
              {gh.languages.map((lang) => (
                <span key={lang.name} className="flex items-center gap-2">
                  <span className="p-accent-dot" />
                  {lang.name}
                  <span className="opacity-50">({Math.round(lang.percentage)}%)</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Repository cards */}
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          initial={stagger.initial}
          whileInView={stagger.animate}
          viewport={{ once: true }}
        >
          {gh.featuredRepos.map((repo) => (
            <motion.a
              key={repo.name}
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-card-interactive group"
              variants={itemVariants}
            >
              <div className="flex items-start gap-2">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--p-accent))] opacity-60" />
                <h3 className="p-h3 text-base transition-colors group-hover:text-[hsl(var(--p-accent))]">
                  {repo.name}
                </h3>
              </div>
              {repo.description && (
                <p className="p-small p-text-muted mt-2 line-clamp-2">{repo.description}</p>
              )}
              <div className="p-small p-text-muted mt-4 flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <Star className="h-3 w-3 text-[hsl(var(--p-accent))]" /> {repo.stars}
                </span>
                <span className="flex items-center gap-1.5">
                  <GitFork className="h-3 w-3" /> {repo.forks}
                </span>
                {repo.language && (
                  <span className="flex items-center gap-1.5">
                    <span className="p-accent-dot" />
                    {repo.language}
                  </span>
                )}
              </div>
            </motion.a>
          ))}
        </motion.div>

        {/* Organizations */}
        {gh.organizations.length > 0 && variant !== 'minimal' && (
          <div className="mt-8 flex items-center gap-3">
            <span className="p-small p-text-muted">Organizations:</span>
            <div className="flex -space-x-2">
              {gh.organizations.map((org) => (
                <a
                  key={org.login}
                  href={org.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={org.login}
                >
                  <Image
                    src={org.avatarUrl}
                    alt={org.login}
                    width={32}
                    height={32}
                    className="rounded-full border-2 border-[hsl(var(--p-background))]"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </section>
    </AnimatedSection>
  );
}

// ============================================================================
// BLOG SHOWCASE - Platform-native feel
// ============================================================================

export function PortfolioBlogShowcaseSection({
  content,
  animationLevel,
  heading,
  intro,
}: SectionProps) {
  const blog = content as BlogShowcaseContent;
  const stagger = getStaggerConfig(animationLevel);
  const itemVariants = getAnimationVariants(animationLevel);
  const featured = blog.posts.filter((p) => p.isFeatured);
  const rest = blog.posts.filter((p) => !p.isFeatured);

  return (
    <AnimatedSection animationLevel={animationLevel}>
      <section className="p-section">
        <SectionHeader heading={heading || 'Writing'} intro={intro} icon={BookOpen} />
        {blog.narrative && (
          <p className="p-body-lg p-text-muted mb-10 max-w-3xl">{blog.narrative}</p>
        )}

        {/* Featured post - large card */}
        {featured.length > 0 && (
          <motion.a
            href={featured[0].url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-card-interactive group mb-8 block"
            initial={getAnimationVariants(animationLevel).initial}
            whileInView={getAnimationVariants(animationLevel).animate}
            viewport={{ once: true }}
            transition={getAnimationVariants(animationLevel).transition}
          >
            <div className="flex flex-col gap-6 md:flex-row">
              {featured[0].thumbnail && (
                <div className="p-img-cover shrink-0 md:w-72">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-lg">
                    <Image
                      src={featured[0].thumbnail}
                      alt={featured[0].title}
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>
              )}
              <div className="flex flex-col justify-center">
                {blog.platform && <p className="p-overline mb-2">{blog.platform}</p>}
                <h3 className="p-h3 text-xl transition-colors group-hover:text-[hsl(var(--p-accent))]">
                  {featured[0].title}
                </h3>
                {featured[0].excerpt && (
                  <p className="p-body p-text-muted mt-2 line-clamp-2">{featured[0].excerpt}</p>
                )}
                <div className="p-small p-text-muted mt-4 flex items-center gap-4">
                  {featured[0].publishedAt && (
                    <span>{formatExpDate(featured[0].publishedAt, false)}</span>
                  )}
                  {featured[0].readTimeMin && <span>{featured[0].readTimeMin} min read</span>}
                </div>
              </div>
            </div>
          </motion.a>
        )}

        {/* Other posts - grid */}
        {rest.length > 0 && (
          <motion.div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            initial={stagger.initial}
            whileInView={stagger.animate}
            viewport={{ once: true }}
          >
            {rest.map((post) => (
              <motion.a
                key={post.url}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-card-interactive group"
                variants={itemVariants}
              >
                {post.thumbnail && (
                  <div className="p-img-cover -mx-[var(--p-card-padding,1.5rem)] -mt-[var(--p-card-padding,1.5rem)] mb-4">
                    <div className="relative aspect-[16/10] overflow-hidden rounded-t-[0.9rem]">
                      <Image src={post.thumbnail} alt={post.title} fill className="object-cover" />
                    </div>
                  </div>
                )}
                <h3 className="p-h3 line-clamp-2 text-base transition-colors group-hover:text-[hsl(var(--p-accent))]">
                  {post.title}
                </h3>
                {post.excerpt && (
                  <p className="p-small p-text-muted mt-2 line-clamp-2">{post.excerpt}</p>
                )}
                <div className="p-small p-text-muted mt-3 flex items-center gap-3">
                  {post.publishedAt && <span>{formatExpDate(post.publishedAt, false)}</span>}
                  {post.readTimeMin && <span>&middot; {post.readTimeMin} min</span>}
                </div>
                {post.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {post.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="p-badge-outline text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </motion.a>
            ))}
          </motion.div>
        )}

        {/* Fallback if all posts have same featured status */}
        {featured.length === 0 && rest.length === 0 && (
          <motion.div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            initial={stagger.initial}
            whileInView={stagger.animate}
            viewport={{ once: true }}
          >
            {blog.posts.map((post) => (
              <motion.a
                key={post.url}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-card-interactive group"
                variants={itemVariants}
              >
                <h3 className="p-h3 line-clamp-2 text-base transition-colors group-hover:text-[hsl(var(--p-accent))]">
                  {post.title}
                </h3>
                {post.excerpt && (
                  <p className="p-small p-text-muted mt-2 line-clamp-2">{post.excerpt}</p>
                )}
                <div className="p-small p-text-muted mt-3 flex items-center gap-3">
                  {post.publishedAt && <span>{formatExpDate(post.publishedAt, false)}</span>}
                  {post.readTimeMin && <span>&middot; {post.readTimeMin} min</span>}
                </div>
              </motion.a>
            ))}
          </motion.div>
        )}
      </section>
    </AnimatedSection>
  );
}
// ============================================================================
// YOUTUBE SHOWCASE
// ============================================================================

export function PortfolioYouTubeShowcaseSection({
  content,
  animationLevel,
  heading,
  intro,
}: SectionProps) {
  const yt = content as YouTubeShowcaseContent;
  const stagger = getStaggerConfig(animationLevel);
  const itemVariants = getAnimationVariants(animationLevel);

  return (
    <AnimatedSection animationLevel={animationLevel}>
      <section className="p-section">
        <SectionHeader heading={heading || 'Videos'} intro={intro} icon={Play} />
        <motion.div
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          initial={stagger.initial}
          whileInView={stagger.animate}
          viewport={{ once: true }}
        >
          {yt.videos.map((video) => (
            <motion.a
              key={video.videoId}
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-card-interactive group"
              variants={itemVariants}
            >
              {video.thumbnail && (
                <div className="-mx-[var(--p-card-padding,1.5rem)] -mt-[var(--p-card-padding,1.5rem)] mb-4">
                  <div className="relative aspect-video overflow-hidden rounded-t-[0.9rem]">
                    <Image
                      src={video.thumbnail}
                      alt={video.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/20">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform duration-300 group-hover:scale-110">
                        <Play className="ml-0.5 h-6 w-6 text-black" fill="currentColor" />
                      </div>
                    </div>
                    {video.duration && (
                      <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
                        {video.duration}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <h3 className="p-h3 line-clamp-2 text-base transition-colors group-hover:text-[hsl(var(--p-accent))]">
                {video.title}
              </h3>
              <div className="p-small p-text-muted mt-2 flex items-center gap-3">
                {video.publishedAt && <span>{formatExpDate(video.publishedAt, false)}</span>}
                {video.viewCount != null && <span>{video.viewCount.toLocaleString()} views</span>}
              </div>
            </motion.a>
          ))}
        </motion.div>
      </section>
    </AnimatedSection>
  );
}

// ============================================================================
// CONTACT - Clean, inviting CTA
// ============================================================================

export function PortfolioContactSection({ content, animationLevel, heading, intro }: SectionProps) {
  const contact = content as ContactSectionContent;
  const blurIn = getBlurInVariants(animationLevel);

  return (
    <section className="p-ambient-bg relative" id="contact">
      <div className="p-glow left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 opacity-10" />
      <motion.div
        className="p-section relative z-10 text-center"
        initial={blurIn.initial}
        whileInView={blurIn.animate}
        viewport={{ once: true }}
        transition={blurIn.transition}
      >
        <SectionHeader heading={heading || "Let's Connect"} intro={intro} icon={Mail} centered />
        <p className="p-body-lg p-text-muted mx-auto mb-8 max-w-xl">{contact.ctaText}</p>
        <div className="flex flex-wrap justify-center gap-4">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="p-btn-primary flex items-center gap-2">
              <Mail className="h-4 w-4" /> {contact.email}
            </a>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="p-btn-secondary flex items-center gap-2">
              <Phone className="h-4 w-4" /> {contact.phone}
            </a>
          )}
          {contact.website && (
            <a
              href={contact.website}
              target="_blank"
              rel="noopener noreferrer"
              className="p-btn-secondary flex items-center gap-2"
            >
              <Globe className="h-4 w-4" /> Website
            </a>
          )}
        </div>
        {contact.location && (
          <p className="p-small p-text-muted mt-6 flex items-center justify-center gap-2">
            <MapPin className="h-3.5 w-3.5 opacity-50" /> {contact.location}
          </p>
        )}
      </motion.div>
    </section>
  );
}

// ============================================================================
// LINKS
// ============================================================================

const LINK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  github: Github,
  website: Globe,
  email: Mail,
};

export function PortfolioLinksSectionComponent({ content, animationLevel, heading }: SectionProps) {
  const links = content as LinksSectionContent;
  const stagger = getStaggerConfig(animationLevel);
  const itemVariants = getAnimationVariants(animationLevel);

  return (
    <AnimatedSection animationLevel={animationLevel}>
      <section className="p-section">
        <SectionHeader heading={heading || 'Links'} />
        <motion.div
          className="flex flex-wrap gap-3"
          initial={stagger.initial}
          whileInView={stagger.animate}
          viewport={{ once: true }}
        >
          {links.links.map((link) => {
            const Icon = LINK_ICONS[link.type.toLowerCase()] || Globe;
            return (
              <motion.a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-btn-secondary flex items-center gap-2"
                variants={itemVariants}
              >
                <Icon className="h-4 w-4" />
                {link.label}
                <ArrowUpRight className="h-3 w-3 opacity-40" />
              </motion.a>
            );
          })}
        </motion.div>
      </section>
    </AnimatedSection>
  );
}

// ============================================================================
// PULL QUOTE - Dramatic typographic emphasis
// ============================================================================

export function PortfolioPullQuoteSection({ content, animationLevel }: SectionProps) {
  const quote = content as PullQuoteContent;
  const blurIn = getBlurInVariants(animationLevel);

  return (
    <section className="p-section">
      <motion.blockquote
        className="relative mx-auto max-w-3xl py-8 text-center"
        initial={blurIn.initial}
        whileInView={blurIn.animate}
        viewport={{ once: true }}
        transition={blurIn.transition}
      >
        <Quote className="mx-auto mb-6 h-8 w-8 text-[hsl(var(--p-accent))] opacity-30" />
        <p className="p-h2 font-normal italic leading-relaxed">&ldquo;{quote.quote}&rdquo;</p>
        {quote.attribution && (
          <cite className="p-small p-text-muted mt-6 block not-italic">
            &mdash; {quote.attribution}
          </cite>
        )}
        <div className="p-accent-line mx-auto mt-8" />
      </motion.blockquote>
    </section>
  );
}

// ============================================================================
// NAVIGATION - Sleek, sticky, glass
// ============================================================================

export function PortfolioNavigation({
  config,
  currentSlug,
}: {
  config: NavigationConfig;
  currentSlug: string;
}) {
  if (config.variant === 'none') return null;

  return (
    <nav className="sticky top-0 z-50 border-b border-[hsl(var(--p-border)/0.3)] bg-[hsl(var(--p-background)/0.8)] backdrop-blur-xl">
      <div className="p-section flex items-center justify-between py-3.5">
        <span className="p-h3 text-base font-semibold tracking-tight">{config.userName}</span>
        {config.items.length > 0 && (
          <div className="flex items-center gap-1">
            {config.items.map((item) => {
              const isActive = item.slug === currentSlug;
              return (
                <a
                  key={item.slug}
                  href={`/${item.slug === 'home' ? '' : item.slug}`}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-[hsl(var(--p-accent)/0.1)] text-[hsl(var(--p-accent))]'
                      : 'text-[hsl(var(--p-muted-foreground))] hover:bg-[hsl(var(--p-muted))] hover:text-[hsl(var(--p-foreground))]'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}

// ============================================================================
// FOOTER - Clean, minimal, branded
// ============================================================================

export function PortfolioFooter({ config, handle }: { config: FooterConfig; handle: string }) {
  return (
    <footer
      className="p-section border-t border-[hsl(var(--p-border)/0.3)] py-10"
      data-handle={handle}
    >
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="p-small p-text-muted">
          &copy; {new Date().getFullYear()}. All rights reserved.
        </p>
        {config.showBranding && (
          <p className="p-small flex items-center gap-1.5 text-[hsl(var(--p-muted-foreground))]">
            Built with{' '}
            <a href="https://follio.app" className="p-link font-medium">
              Follio
            </a>
          </p>
        )}
      </div>
    </footer>
  );
}

// ============================================================================
// SECTION RENDERER MAP
// ============================================================================

export const SECTION_COMPONENT_MAP: Record<
  PortfolioComponentType,
  React.ComponentType<SectionProps>
> = {
  hero: PortfolioHeroSection,
  about: PortfolioAboutSection,
  'stats-bar': PortfolioStatsBarSection,
  'experience-timeline': PortfolioExperienceTimelineSection,
  'experience-highlights': PortfolioExperienceHighlightsSection,
  'project-showcase': PortfolioProjectShowcaseSection,
  'project-grid': PortfolioProjectGridSection,
  'skills-display': PortfolioSkillsDisplaySection,
  'education-list': PortfolioEducationListSection,
  'certification-list': PortfolioCertificationListSection,
  'award-list': PortfolioAwardListSection,
  'github-showcase': PortfolioGitHubShowcaseSection,
  'blog-showcase': PortfolioBlogShowcaseSection,
  'youtube-showcase': PortfolioYouTubeShowcaseSection,
  'contact-section': PortfolioContactSection,
  'links-section': PortfolioLinksSectionComponent,
  'pull-quote': PortfolioPullQuoteSection,
  // Navigation and footer are rendered separately, not as sections
  navigation: PortfolioHeroSection, // placeholder - never called as section
  footer: PortfolioHeroSection, // placeholder - never called as section
};

export type { SectionProps };
