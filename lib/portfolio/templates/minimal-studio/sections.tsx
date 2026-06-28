'use client';

/**
 * Minimal Studio Template — All Section Components
 *
 * Self-contained, deterministic rendering. Each section receives normalized
 * profile data and AI copy, and renders pixel-crafted, accessible HTML using
 * the template's scoped CSS classes. No AI at render time.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  AboutStyle,
  PortraitStyle,
  SkillsStyle,
  TemplateAIEnrichment,
  TemplateCopy,
  TemplateProfileData,
  TemplateSectionType,
  WorkStyle,
} from '../types';
import { DEFAULT_PORTRAIT_STYLE, type PortraitStyleId } from './portrait-styles';
import { DEFAULT_ABOUT_STYLE, DEFAULT_SKILLS_STYLE, DEFAULT_WORK_STYLE } from './section-styles';
import { PORTFOLIO_THUMBNAIL_FOCUS_ATTR } from '../types';

import { SECTION_DEFAULT_HEADINGS } from './meta';
import { SocialLinksRow } from './social-icons';
import {
  computeYearsOfExperience,
  formatYearRange,
  getDisplayName,
  isUploadedPhotoUrl,
  pad2,
} from './utils';

/**
 * Join class names, dropping falsy values. Guarantees a separating space
 * between every class — string concatenation in template literals silently
 * fused modifiers onto their base class (e.g. `ms-reveal` + `is-visible` →
 * `ms-revealis-visible`), which matched nothing in the stylesheet.
 */
function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

// ============================================================================
// HEADINGS — resolve user-edited eyebrow / title with template defaults
// ============================================================================

/**
 * Resolve the eyebrow + title for a section, preferring the user's edited copy
 * and falling back to the template's default heading. Blank/whitespace
 * overrides are treated as "use the default" so a cleared field never renders
 * an empty heading.
 */
function resolveHeading(
  copy: TemplateCopy,
  type: TemplateSectionType
): { eyebrow: string; title: string } {
  const fallback = SECTION_DEFAULT_HEADINGS[type] ?? { eyebrow: '', title: '' };
  const override = copy.sectionHeadings?.[type];
  return {
    eyebrow: override?.eyebrow?.trim() || fallback.eyebrow,
    title: override?.title?.trim() || fallback.title,
  };
}

// ============================================================================
// REVEAL — quiet scroll-in animation (reduced-motion safe via CSS)
// ============================================================================

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'li' | 'article' | 'section';
}

function Reveal({ children, className, delay = 0, as = 'div' }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={cx('ms-reveal', visible && 'is-visible', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

// ============================================================================
// SECTION HEADER — shared eyebrow + serif title + optional intro
// ============================================================================

interface SectionHeaderProps {
  index?: string;
  eyebrow: string;
  title: string;
  intro?: string | null;
}

function SectionHeader({ index, eyebrow, title, intro }: SectionHeaderProps) {
  return (
    <Reveal className="ms-section-head">
      <div className="ms-eyebrow-row">
        {index && <span className="ms-eyebrow-index">{index}</span>}
        <span className="ms-eyebrow">{eyebrow}</span>
      </div>
      <h2 className="ms-section-title">{title}</h2>
      {intro && <p className="ms-section-intro">{intro}</p>}
    </Reveal>
  );
}

// ============================================================================
// NAVIGATION
// ============================================================================

const NAV_LABELS: Record<string, string> = {
  hero: 'Top',
  projects: 'Projects',
  about: 'About',
  experience: 'Experience',
  skills: 'Skills',
  education: 'Education',
  awards: 'Awards',
  certifications: 'Certifications',
  github: 'Open Source',
  contact: 'Contact',
};

interface NavigationProps {
  profile: TemplateProfileData;
  sections: Array<{ type: string; enabled: boolean }>;
}

export function MSNavigation({ profile, sections }: NavigationProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayName = getDisplayName(profile.firstName, profile.lastName);
  const email = profile.contactInfo?.email;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const navItems = sections
    .filter((s) => s.enabled && !['navigation', 'footer', 'hero'].includes(s.type))
    .map((s) => ({ id: s.type, label: NAV_LABELS[s.type] ?? s.type }));

  const scrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(`ms-${sectionId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMobileOpen(false);
  }, []);

  const scrollTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMobileOpen(false);
  }, []);

  return (
    <>
      <nav className={cx('ms-nav', scrolled && 'ms-nav--scrolled')}>
        <div className="ms-nav-inner">
          <button className="ms-nav-mark" onClick={scrollTop} aria-label="Back to top">
            {displayName}
          </button>

          <div className="ms-nav-links">
            {navItems.map((item) => (
              <button
                key={item.id}
                className="ms-nav-link"
                onClick={() => scrollToSection(item.id)}
              >
                {item.label}
              </button>
            ))}
            {email && (
              <a className="ms-nav-cta" href={`mailto:${email}`}>
                Get in touch
              </a>
            )}
          </div>

          <button
            className="ms-nav-toggle"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            <span className={cx('ms-nav-toggle-bar', mobileOpen && 'is-open-1')} />
            <span className={cx('ms-nav-toggle-bar', mobileOpen && 'is-open-2')} />
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="ms-nav-overlay">
          {navItems.map((item, i) => (
            <button
              key={item.id}
              className="ms-nav-overlay-link"
              style={{ transitionDelay: `${60 + i * 40}ms` }}
              onClick={() => scrollToSection(item.id)}
            >
              {item.label}
            </button>
          ))}
          {email && (
            <a className="ms-nav-overlay-cta" href={`mailto:${email}`}>
              Get in touch
            </a>
          )}
        </div>
      )}
    </>
  );
}

// ============================================================================
// HERO
// ============================================================================

interface HeroProps {
  profile: TemplateProfileData;
  copy: TemplateCopy;
  portraitStyle?: PortraitStyle;
}

function HeroPortrait({ url, style }: { url: string; style: PortraitStyleId }) {
  return (
    <figure className={cx('ms-hero-portrait', `ms-hero-portrait--${style}`)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" loading="eager" decoding="async" />
    </figure>
  );
}

export function MSHero({ profile, copy, portraitStyle = DEFAULT_PORTRAIT_STYLE }: HeroProps) {
  const displayName = getDisplayName(profile.firstName, profile.lastName);
  const headline = copy.heroHeadline || profile.headline || 'Designing things worth looking at.';
  const socialLinks = profile.links.filter((l) =>
    ['GITHUB', 'LINKEDIN', 'TWITTER', 'X', 'INSTAGRAM', 'DRIBBBLE', 'BEHANCE', 'YOUTUBE'].includes(
      l.type.toUpperCase()
    )
  );

  const scrollNext = useCallback(() => {
    const hero = document.getElementById('ms-hero');
    const next = hero?.nextElementSibling as HTMLElement | null;
    next?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const portraitUrl = isUploadedPhotoUrl(profile.avatarUrl) ? profile.avatarUrl : null;
  const activeStyle = portraitUrl ? portraitStyle : null;

  const renderPortrait = (slotClassName: string, delay = 80) =>
    portraitUrl ? (
      <Reveal className={slotClassName} delay={delay}>
        <HeroPortrait url={portraitUrl} style={portraitStyle} />
      </Reveal>
    ) : null;

  const eyebrow = (
    <Reveal className="ms-hero-eyebrow-wrap" delay={0}>
      <div className="ms-hero-eyebrow-copy">
        <span className="ms-eyebrow">{displayName}</span>
        {profile.headline && <span className="ms-hero-role">{profile.headline}</span>}
      </div>
    </Reveal>
  );

  const headlineBlock = (
    <Reveal delay={90}>
      <h1 className="ms-hero-headline">{headline}</h1>
    </Reveal>
  );

  const introBody = (
    <>
      {eyebrow}

      {activeStyle === 'style-4' &&
        renderPortrait('ms-hero-portrait-slot ms-hero-portrait-slot--banner', 60)}

      {activeStyle === 'style-5' &&
        renderPortrait('ms-hero-portrait-slot ms-hero-portrait-slot--float', 60)}

      {activeStyle === 'style-1' ? (
        <div className="ms-hero-lead ms-hero-lead--mark">
          {renderPortrait('ms-hero-portrait-slot ms-hero-portrait-slot--mark', 70)}
          <div className="ms-hero-lead-copy">{headlineBlock}</div>
        </div>
      ) : (
        headlineBlock
      )}

      {copy.heroSubtext && (
        <Reveal delay={180}>
          <p className="ms-hero-sub">{copy.heroSubtext}</p>
        </Reveal>
      )}

      <Reveal className="ms-hero-meta" delay={260}>
        {profile.location && (
          <span className="ms-hero-meta-item">
            <span className="ms-dot" /> Based in {profile.location}
          </span>
        )}
        <span className="ms-hero-meta-item ms-hero-available">
          <span className="ms-dot ms-dot--live" /> Available for work
        </span>
        {socialLinks.length > 0 && <SocialLinksRow links={socialLinks} />}
      </Reveal>
    </>
  );

  return (
    <section id="ms-hero" className={cx('ms-hero', activeStyle && `ms-hero--${activeStyle}`)}>
      <div className="ms-container">
        <div className="ms-hero-grid">
          {activeStyle === 'style-3' &&
            renderPortrait('ms-hero-portrait-slot ms-hero-portrait-slot--column', 100)}

          <div
            className={cx('ms-hero-text', activeStyle === 'style-5' && 'ms-hero-text--has-float')}
            {...{ [PORTFOLIO_THUMBNAIL_FOCUS_ATTR]: '' }}
          >
            {introBody}
          </div>

          {activeStyle === 'style-2' &&
            renderPortrait('ms-hero-portrait-slot ms-hero-portrait-slot--column', 100)}
        </div>
      </div>

      <button className="ms-scroll-cue" onClick={scrollNext} aria-label="Scroll to work">
        <span className="ms-scroll-cue-label">Scroll</span>
        <span className="ms-scroll-cue-line" />
      </button>
    </section>
  );
}

// ============================================================================
// WORK / PROJECTS — the image-forward showcase
// ============================================================================

interface WorkProps {
  profile: TemplateProfileData;
  copy: TemplateCopy;
  index?: string;
  layout?: WorkStyle;
}

export function MSWork({ profile, copy, index, layout = DEFAULT_WORK_STYLE }: WorkProps) {
  const projects = profile.projects.filter((p) => p.isVisible && p.showOnPortfolio);
  if (projects.length === 0) return null;

  const intro = copy.sectionIntros?.projects ?? null;
  const { eyebrow, title } = resolveHeading(copy, 'projects');

  // The oversized "feature" card is unique to the editorial layout; the grid
  // and gallery layouts keep every project at equal weight.
  const allowFeature = layout === 'editorial';

  return (
    <section id="ms-projects" className={cx('ms-section ms-work', `ms-work--${layout}`)}>
      <div className="ms-container">
        <SectionHeader index={index} eyebrow={eyebrow} title={title} intro={intro} />

        <div className="ms-work-grid">
          {projects.map((project, i) => {
            const narrative = copy.projectNarratives?.[project.title];
            const description = narrative || project.description;
            const href = project.url || project.repoUrl || undefined;
            const hasImage = Boolean(project.imageUrl);
            // Only the image-led editorial layout earns the wide "feature"
            // treatment; a text-only card has no media to fill the extra column.
            const feature = allowFeature && i === 0 && projects.length > 1 && hasImage;

            const body = (
              <div className="ms-work-body">
                <div className="ms-work-headline-row">
                  <h3 className="ms-work-title">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {project.title}
                      </a>
                    ) : (
                      project.title
                    )}
                  </h3>
                  {project.ghStars != null && project.ghStars > 0 && (
                    <span className="ms-work-stars">★ {project.ghStars}</span>
                  )}
                </div>

                {description && <p className="ms-work-desc">{description}</p>}

                {project.techStack.length > 0 && (
                  <ul className="ms-tag-list">
                    {project.techStack.slice(0, 6).map((tech, t) => (
                      <li key={t} className="ms-tag">
                        {tech}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );

            // Text-forward card — used when a project has no image. Instead of a
            // large initial-letter placeholder, the card becomes an intentional
            // editorial block with an index numeral, accent rule, and a link.
            if (!hasImage) {
              const Wrapper = href ? 'a' : 'div';
              return (
                <Reveal as="article" key={project.id} className="ms-work-card ms-work-card--text">
                  <Wrapper
                    className="ms-work-text-inner"
                    {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    <div className="ms-work-text-head">
                      <span className="ms-work-text-index">{pad2(i)}</span>
                      <span className="ms-work-text-rule" aria-hidden="true" />
                      {href && (
                        <span className="ms-work-text-cta">
                          View
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              d="M7 17 17 7M9 7h8v8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      )}
                    </div>
                    {body}
                  </Wrapper>
                </Reveal>
              );
            }

            return (
              <Reveal
                as="article"
                key={project.id}
                className={cx('ms-work-card', feature && 'ms-work-card--feature')}
              >
                <a
                  className="ms-work-media"
                  href={href}
                  target={href ? '_blank' : undefined}
                  rel={href ? 'noopener noreferrer' : undefined}
                  tabIndex={href ? 0 : -1}
                  aria-label={project.title}
                >
                  <span className="ms-work-index">{pad2(i)}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={project.imageUrl as string} alt={project.title} loading="lazy" />
                  {href && (
                    <span className="ms-work-view">
                      View
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </a>

                {body}
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// ABOUT
// ============================================================================

interface AboutProps {
  profile: TemplateProfileData;
  copy: TemplateCopy;
  enrichment?: TemplateAIEnrichment | null;
  index?: string;
  layout?: AboutStyle;
}

export function MSAbout({
  profile,
  copy,
  enrichment,
  index,
  layout = DEFAULT_ABOUT_STYLE,
}: AboutProps) {
  const displayName = getDisplayName(profile.firstName, profile.lastName);
  const yearsExp = computeYearsOfExperience(profile.workExperiences);
  const projectCount = profile.projects.filter((p) => p.isVisible && p.showOnPortfolio).length;
  const aboutText = copy.aboutText || profile.summary || '';
  const { eyebrow } = resolveHeading(copy, 'about');

  const stats: Array<{ label: string; value: string }> =
    enrichment?.stats && enrichment.stats.length > 0
      ? enrichment.stats
      : [
          ...(yearsExp > 0 ? [{ label: 'Years experience', value: `${yearsExp}+` }] : []),
          ...(projectCount > 0 ? [{ label: 'Projects shipped', value: `${projectCount}` }] : []),
        ];

  return (
    <section id="ms-about" className={cx('ms-section ms-about', `ms-about--${layout}`)}>
      <div className="ms-container">
        <div className="ms-about-grid">
          <div className="ms-about-aside">
            <div className="ms-eyebrow-row">
              {index && <span className="ms-eyebrow-index">{index}</span>}
              <span className="ms-eyebrow">{eyebrow}</span>
            </div>
            {enrichment?.highlightFacts && enrichment.highlightFacts.length > 0 && (
              <ul className="ms-fact-list">
                {enrichment.highlightFacts.slice(0, 4).map((fact, i) => (
                  <li key={i} className="ms-fact">
                    {fact}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ms-about-main">
            <Reveal>
              <h2 className="ms-section-title ms-about-title">
                {copy.aboutTitle || `Hello, I'm ${displayName}.`}
              </h2>
            </Reveal>

            {aboutText && (
              <Reveal delay={80}>
                <p className="ms-about-text">{aboutText}</p>
              </Reveal>
            )}

            {copy.pullQuote && (
              <Reveal delay={140}>
                <blockquote className="ms-pull-quote">{copy.pullQuote}</blockquote>
              </Reveal>
            )}

            {stats.length > 0 && (
              <Reveal className="ms-stats" delay={180}>
                {stats.slice(0, 4).map((stat, i) => (
                  <div key={i} className="ms-stat">
                    <span className="ms-stat-value">{stat.value}</span>
                    <span className="ms-stat-label">{stat.label}</span>
                  </div>
                ))}
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// EXPERIENCE — editorial list
// ============================================================================

interface ExperienceProps {
  profile: TemplateProfileData;
  copy: TemplateCopy;
  index?: string;
}

export function MSExperience({ profile, copy, index }: ExperienceProps) {
  const items = profile.workExperiences.filter((e) => e.isVisible);
  if (items.length === 0) return null;

  const intro = copy.experienceNarrative || copy.sectionIntros?.experience || null;
  const { eyebrow, title } = resolveHeading(copy, 'experience');

  return (
    <section id="ms-experience" className="ms-section ms-experience">
      <div className="ms-container">
        <SectionHeader index={index} eyebrow={eyebrow} title={title} intro={intro} />

        <ol className="ms-exp-list">
          {items.map((exp) => (
            <Reveal as="li" key={exp.id} className="ms-exp-row">
              <span className="ms-exp-period">
                {formatYearRange(exp.startDate, exp.endDate, exp.isCurrent)}
              </span>
              <div className="ms-exp-main">
                <h3 className="ms-exp-role">{exp.role}</h3>
                <div className="ms-exp-company">
                  {exp.company}
                  {exp.location && <span className="ms-exp-location"> — {exp.location}</span>}
                </div>
                {exp.bullets.length > 0 && <p className="ms-exp-desc">{exp.bullets[0]}</p>}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ============================================================================
// SKILLS
// ============================================================================

interface SkillsProps {
  profile: TemplateProfileData;
  copy: TemplateCopy;
  index?: string;
  layout?: SkillsStyle;
}

export function MSSkills({ profile, copy, index, layout = DEFAULT_SKILLS_STYLE }: SkillsProps) {
  const flatSkills = profile.skills.filter((s) => s.isVisible);
  const hasGroups = profile.skillGroups.length > 0;
  if (flatSkills.length === 0 && !hasGroups) return null;

  const { eyebrow, title } = resolveHeading(copy, 'skills');

  return (
    <section id="ms-skills" className={cx('ms-section ms-skills', `ms-skills--${layout}`)}>
      <div className="ms-container">
        <SectionHeader index={index} eyebrow={eyebrow} title={title} />

        <div className="ms-skills-body">
          {hasGroups ? (
            profile.skillGroups.map((group) => (
              <Reveal as="div" key={group.id} className="ms-skill-group">
                <h3 className="ms-skill-group-name">{group.name}</h3>
                <ul className="ms-tag-list">
                  {group.skills.map((skill) => (
                    <li key={skill.id} className="ms-tag">
                      {skill.name}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))
          ) : (
            <Reveal as="div" className="ms-skill-group">
              <ul className="ms-tag-list">
                {flatSkills.map((skill) => (
                  <li key={skill.id} className="ms-tag">
                    {skill.name}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// EDUCATION
// ============================================================================

interface EducationProps {
  profile: TemplateProfileData;
  copy: TemplateCopy;
  index?: string;
}

export function MSEducation({ profile, copy, index }: EducationProps) {
  const items = profile.educations.filter((e) => e.isVisible);
  if (items.length === 0) return null;

  const { eyebrow, title } = resolveHeading(copy, 'education');

  return (
    <section id="ms-education" className="ms-section ms-education">
      <div className="ms-container">
        <SectionHeader index={index} eyebrow={eyebrow} title={title} />

        <ol className="ms-exp-list">
          {items.map((edu) => (
            <Reveal as="li" key={edu.id} className="ms-exp-row">
              <span className="ms-exp-period">
                {formatYearRange(edu.startDate, edu.endDate, edu.isCurrent)}
              </span>
              <div className="ms-exp-main">
                <h3 className="ms-exp-role">
                  {edu.degree
                    ? `${edu.degree}${edu.fieldOfStudy ? `, ${edu.fieldOfStudy}` : ''}`
                    : edu.fieldOfStudy || 'Studies'}
                </h3>
                <div className="ms-exp-company">{edu.institution}</div>
                {edu.gpa && <p className="ms-exp-desc">GPA {edu.gpa}</p>}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ============================================================================
// AWARDS
// ============================================================================

interface AwardsProps {
  profile: TemplateProfileData;
  copy: TemplateCopy;
  index?: string;
}

export function MSAwards({ profile, copy, index }: AwardsProps) {
  const items = profile.awards.filter((a) => a.isVisible);
  if (items.length === 0) return null;

  const { eyebrow, title } = resolveHeading(copy, 'awards');

  return (
    <section id="ms-awards" className="ms-section ms-awards">
      <div className="ms-container">
        <SectionHeader index={index} eyebrow={eyebrow} title={title} />

        <ol className="ms-exp-list">
          {items.map((award) => (
            <Reveal as="li" key={award.id} className="ms-exp-row">
              <span className="ms-exp-period">
                {award.date ? formatYearRange(award.date, null, false) : ''}
              </span>
              <div className="ms-exp-main">
                <h3 className="ms-exp-role">{award.title}</h3>
                {award.issuer && <div className="ms-exp-company">{award.issuer}</div>}
                {award.description && <p className="ms-exp-desc">{award.description}</p>}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ============================================================================
// CERTIFICATIONS
// ============================================================================

interface CertificationsProps {
  profile: TemplateProfileData;
  copy: TemplateCopy;
  index?: string;
}

export function MSCertifications({ profile, copy, index }: CertificationsProps) {
  const items = profile.certifications.filter((c) => c.isVisible);
  if (items.length === 0) return null;

  const { eyebrow, title } = resolveHeading(copy, 'certifications');

  return (
    <section id="ms-certifications" className="ms-section ms-certs">
      <div className="ms-container">
        <SectionHeader index={index} eyebrow={eyebrow} title={title} />

        <ul className="ms-cert-list">
          {items.map((cert) => (
            <Reveal as="li" key={cert.id} className="ms-cert-item">
              <div className="ms-cert-main">
                <span className="ms-cert-name">{cert.name}</span>
                <span className="ms-cert-issuer">{cert.issuer}</span>
              </div>
              {cert.credentialUrl && (
                <a
                  className="ms-cert-link"
                  href={cert.credentialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Verify
                </a>
              )}
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ============================================================================
// GITHUB / OPEN SOURCE
// ============================================================================

interface GithubProps {
  profile: TemplateProfileData;
  copy: TemplateCopy;
  index?: string;
}

export function MSGithub({ profile, copy, index }: GithubProps) {
  if (!profile.github) return null;
  const { github } = profile;
  const intro = copy.githubNarrative || null;
  const { eyebrow, title } = resolveHeading(copy, 'github');

  const stats = [
    { label: 'Repositories', value: github.publicRepos },
    { label: 'Stars', value: github.totalStars },
    { label: 'Followers', value: github.followers },
  ];

  return (
    <section id="ms-github" className="ms-section ms-github">
      <div className="ms-container">
        <SectionHeader index={index} eyebrow={eyebrow} title={title} intro={intro} />

        <Reveal className="ms-github-stats" delay={60}>
          {stats.map((stat) => (
            <div key={stat.label} className="ms-github-stat">
              <span className="ms-github-stat-value">{stat.value}</span>
              <span className="ms-github-stat-label">{stat.label}</span>
            </div>
          ))}
        </Reveal>

        {github.primaryLanguages.length > 0 && (
          <ul className="ms-tag-list ms-github-langs">
            {github.primaryLanguages.map((lang, i) => (
              <li key={i} className="ms-tag">
                {lang}
              </li>
            ))}
          </ul>
        )}

        <a
          className="ms-text-link ms-github-link"
          href={`https://github.com/${github.username}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View GitHub profile
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    </section>
  );
}

// ============================================================================
// CONTACT
// ============================================================================

interface ContactProps {
  profile: TemplateProfileData;
  copy: TemplateCopy;
}

export function MSContact({ profile, copy }: ContactProps) {
  const email = profile.contactInfo?.email;
  const allLinks = profile.links;

  return (
    <section id="ms-contact" className="ms-section ms-contact">
      <div className="ms-container">
        <Reveal className="ms-contact-inner">
          <span className="ms-eyebrow">{copy.contactSubtext || 'Get in touch'}</span>
          <h2 className="ms-contact-title">{copy.contactTitle || "Let's work together"}</h2>

          {email && (
            <a className="ms-contact-email" href={`mailto:${email}`}>
              {email}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}

          <div className="ms-contact-foot">
            {profile.location && <span className="ms-contact-loc">{profile.location}</span>}
            {allLinks.length > 0 && <SocialLinksRow links={allLinks} variant="text" />}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ============================================================================
// FOOTER
// ============================================================================

interface FooterProps {
  profile: TemplateProfileData;
}

export function MSFooter({ profile }: FooterProps) {
  const displayName = getDisplayName(profile.firstName, profile.lastName);
  const year = new Date().getFullYear();

  return (
    <footer id="ms-footer" className="ms-footer">
      <div className="ms-container">
        <div className="ms-footer-inner">
          <span className="ms-footer-name">{displayName}</span>
          <span className="ms-footer-meta">
            © {year} · Built with{' '}
            <a href="https://follio.app" target="_blank" rel="noopener noreferrer">
              Follio
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
