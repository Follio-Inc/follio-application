'use client';

/**
 * Developer Dark Template — All Section Components
 *
 * Each section is a self-contained component that receives profile data
 * and template copy, then renders pixel-perfect HTML using the template's
 * CSS classes. No AI. No generation. Pure deterministic rendering.
 */

import { useCallback, useEffect, useState } from 'react';

import type { TemplateCopy, TemplateProfileData } from '../types';

import { SocialLinksRow } from './social-icons';
import { computeYearsOfExperience, formatDateRange, getDisplayName } from './utils';

// ============================================================================
// NAVIGATION
// ============================================================================

interface NavigationProps {
  profile: TemplateProfileData;
  sections: Array<{ type: string; enabled: boolean }>;
}

export function DDNavigation({ profile, sections }: NavigationProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const displayName = getDisplayName(profile.firstName, profile.lastName);

  // Build nav items from enabled sections
  const navItems = sections
    .filter((s) => s.enabled && !['navigation', 'footer'].includes(s.type))
    .map((s) => ({
      id: s.type,
      label: s.type === 'hero' ? 'Home' : s.type.charAt(0).toUpperCase() + s.type.slice(1),
    }));

  const scrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(`dd-${sectionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMobileOpen(false);
    }
  }, []);

  return (
    <>
      <nav className={`dd-nav ${scrolled ? 'dd-nav--scrolled' : ''}`}>
        <div className="dd-nav-inner">
          <a
            className="dd-nav-logo"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <span className="dd-nav-logo-icon">&lt;/&gt;</span>
            <span>{displayName}</span>
          </a>

          <div className="dd-nav-links">
            {navItems.map((item) => (
              <button
                key={item.id}
                className="dd-nav-link"
                onClick={() => scrollToSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            className="dd-nav-menu-btn"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="dd-nav-mobile">
          <button
            className="dd-nav-menu-btn"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            style={{ position: 'absolute', top: '1rem', right: '1.5rem' }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {navItems.map((item) => (
            <button
              key={item.id}
              className="dd-nav-mobile-link"
              onClick={() => scrollToSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ============================================================================
// HERO SECTION
// ============================================================================

interface HeroProps {
  profile: TemplateProfileData;
  copy: TemplateCopy;
}

export function DDHero({ profile, copy }: HeroProps) {
  const displayName = getDisplayName(profile.firstName, profile.lastName);

  const scrollToNext = useCallback(() => {
    const hero = document.getElementById('dd-hero');
    if (hero?.nextElementSibling) {
      hero.nextElementSibling.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <section id="dd-hero" className="dd-hero">
      <div className="dd-container">
        <div className="dd-hero-grid">
          {/* Left: Content */}
          <div className="dd-hero-content">
            <div className="dd-accent-dash dd-animate-in" />

            <h1 className="dd-hero-name dd-animate-in dd-animate-delay-1">
              {copy.heroHeadline || `I'm ${displayName}`}
            </h1>

            <p className="dd-body dd-animate-in dd-animate-delay-2" style={{ maxWidth: '28rem' }}>
              {copy.heroSubtext || profile.headline || ''}
            </p>

            <div className="dd-animate-in dd-animate-delay-3">
              <SocialLinksRow
                links={profile.links.filter((l) =>
                  ['GITHUB', 'LINKEDIN', 'TWITTER', 'YOUTUBE', 'DRIBBBLE', 'BEHANCE'].includes(
                    l.type.toUpperCase()
                  )
                )}
              />
            </div>

            <button
              className="dd-scroll-cta dd-animate-in dd-animate-delay-4"
              onClick={scrollToNext}
              aria-label="Scroll down"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          {/* Right: Photo + Sidebar */}
          <div className="dd-hero-right">
            {profile.avatarUrl && (
              <div className="dd-hero-image-wrapper dd-animate-in dd-animate-delay-2">
                <div className="dd-hero-image">
                  <img src={profile.avatarUrl} alt={displayName} />
                  <div className="dd-hero-image-overlay" />
                </div>
              </div>
            )}

            <div
              className="dd-animate-in dd-animate-delay-3"
              style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}
            >
              {profile.summary && (
                <div className="dd-hero-sidebar-block">
                  <h3>About Me</h3>
                  <p>
                    {profile.summary.length > 150
                      ? profile.summary.slice(0, 150) + '...'
                      : profile.summary}
                  </p>
                  <button
                    className="dd-cta-link"
                    onClick={() => {
                      const el = document.getElementById('dd-about');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    Learn More
                  </button>
                </div>
              )}

              {profile.projects.filter((p) => p.isVisible && p.showOnPortfolio).length > 0 && (
                <div className="dd-hero-sidebar-block">
                  <h3>My Work</h3>
                  <p>
                    {profile.projects.filter((p) => p.isVisible && p.showOnPortfolio).length}{' '}
                    projects showcasing my skills and experience.
                  </p>
                  <button
                    className="dd-cta-link"
                    onClick={() => {
                      const el = document.getElementById('dd-projects');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    View Projects
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// ABOUT SECTION
// ============================================================================

interface AboutProps {
  profile: TemplateProfileData;
  copy: TemplateCopy;
}

export function DDAbout({ profile, copy }: AboutProps) {
  const displayName = getDisplayName(profile.firstName, profile.lastName);
  const yearsExp = computeYearsOfExperience(profile.workExperiences);
  const projectCount = profile.projects.filter((p) => p.isVisible).length;

  return (
    <section id="dd-about" className="dd-section">
      <div className="dd-container">
        <div className="dd-about-grid">
          {/* Left: Content */}
          <div>
            <div className="dd-accent-dash" />
            <h2 className="dd-section-title">
              {copy.aboutTitle || `Nice to meet you, I'm ${displayName}`}
            </h2>
            <p className="dd-about-text">{copy.aboutText || profile.summary || ''}</p>
            <button
              className="dd-cta-link"
              onClick={() => {
                const el = document.getElementById('dd-projects');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              {copy.primaryCtaLabel || 'Browse Portfolio'}
            </button>

            {/* Stats */}
            {(yearsExp > 0 || projectCount > 0) && (
              <div className="dd-stats-row">
                {yearsExp > 0 && (
                  <div>
                    <div className="dd-stat">
                      <span className="dd-stat-value">{yearsExp}</span>
                      <span className="dd-stat-suffix">+</span>
                    </div>
                    <div className="dd-stat-label">
                      Years of
                      <br />
                      experience
                    </div>
                  </div>
                )}
                {projectCount > 0 && (
                  <div>
                    <div className="dd-stat">
                      <span className="dd-stat-value">{projectCount}</span>
                      <span className="dd-stat-suffix">+</span>
                    </div>
                    <div className="dd-stat-label">
                      Successful
                      <br />
                      projects
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Photo */}
          {profile.avatarUrl && (
            <div className="dd-about-image">
              <img src={profile.avatarUrl} alt={displayName} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// EXPERIENCE SECTION
// ============================================================================

interface ExperienceProps {
  profile: TemplateProfileData;
}

export function DDExperience({ profile }: ExperienceProps) {
  const visibleExperiences = profile.workExperiences.filter((e) => e.isVisible);
  if (visibleExperiences.length === 0) return null;

  return (
    <section id="dd-experience" className="dd-section">
      <div className="dd-container">
        <div className="dd-accent-dash" />
        <h2 className="dd-section-title">Experience</h2>

        <div className="dd-experience-list">
          {visibleExperiences.map((exp) => (
            <div key={exp.id} className="dd-experience-item">
              <div className="dd-experience-date">
                {formatDateRange(exp.startDate, exp.endDate, exp.isCurrent)}
              </div>
              <div>
                <div className="dd-experience-role">{exp.role}</div>
                <div className="dd-experience-company">{exp.company}</div>
                {exp.bullets.length > 0 && (
                  <ul className="dd-experience-bullets">
                    {exp.bullets.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// PROJECTS SECTION
// ============================================================================

interface ProjectsProps {
  profile: TemplateProfileData;
}

export function DDProjects({ profile }: ProjectsProps) {
  const visibleProjects = profile.projects.filter((p) => p.isVisible && p.showOnPortfolio);
  if (visibleProjects.length === 0) return null;

  return (
    <section id="dd-projects" className="dd-section">
      <div className="dd-container">
        <div className="dd-accent-dash" />
        <h2 className="dd-section-title">Portfolio</h2>

        <div className="dd-projects-grid">
          {visibleProjects.map((project) => (
            <a
              key={project.id}
              href={project.url || project.repoUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="dd-project-card"
              style={{ textDecoration: 'none' }}
            >
              {/* Project Image */}
              <div className="dd-project-image">
                {project.imageUrl ? (
                  <img src={project.imageUrl} alt={project.title} />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '2rem',
                      fontWeight: 700,
                      color: 'var(--dd-text-muted)',
                      opacity: 0.3,
                    }}
                  >
                    {project.title.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="dd-project-body">
                {/* Tech Stack Tags */}
                {project.techStack.length > 0 && (
                  <div className="dd-project-tags">
                    {project.techStack.slice(0, 4).map((tech, i) => (
                      <span key={i} className="dd-project-tag">
                        {tech}
                      </span>
                    ))}
                  </div>
                )}

                <div className="dd-project-title">{project.title}</div>

                {project.description && (
                  <div className="dd-project-desc">{project.description}</div>
                )}

                {/* GitHub Meta */}
                {(project.ghStars != null || project.ghLanguage) && (
                  <div className="dd-project-meta">
                    {project.ghLanguage && (
                      <span className="dd-project-meta-item">
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: 'var(--dd-accent)',
                          }}
                        />
                        {project.ghLanguage}
                      </span>
                    )}
                    {project.ghStars != null && project.ghStars > 0 && (
                      <span className="dd-project-meta-item">★ {project.ghStars}</span>
                    )}
                    {project.ghForks != null && project.ghForks > 0 && (
                      <span className="dd-project-meta-item">⑂ {project.ghForks}</span>
                    )}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// SKILLS SECTION
// ============================================================================

interface SkillsProps {
  profile: TemplateProfileData;
}

export function DDSkills({ profile }: SkillsProps) {
  const visibleSkills = profile.skills.filter((s) => s.isVisible);
  if (visibleSkills.length === 0 && profile.skillGroups.length === 0) return null;

  // Use skill groups if available, otherwise create a flat list
  const hasGroups = profile.skillGroups.length > 0;

  return (
    <section id="dd-skills" className="dd-section">
      <div className="dd-container">
        <div className="dd-accent-dash" />
        <h2 className="dd-section-title">Skills</h2>

        <div className="dd-skills-grid">
          {hasGroups ? (
            profile.skillGroups.map((group) => (
              <div key={group.id}>
                <div className="dd-skill-group-title">{group.name}</div>
                <div className="dd-skill-list">
                  {group.skills.map((skill) => (
                    <span key={skill.id} className="dd-skill-pill">
                      {skill.name}
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="dd-skill-list">
                {visibleSkills.map((skill) => (
                  <span key={skill.id} className="dd-skill-pill">
                    {skill.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// EDUCATION SECTION
// ============================================================================

interface EducationProps {
  profile: TemplateProfileData;
}

export function DDEducation({ profile }: EducationProps) {
  const visibleEducation = profile.educations.filter((e) => e.isVisible);
  if (visibleEducation.length === 0) return null;

  return (
    <section id="dd-education" className="dd-section">
      <div className="dd-container">
        <div className="dd-accent-dash" />
        <h2 className="dd-section-title">Education</h2>

        <div className="dd-education-list">
          {visibleEducation.map((edu) => (
            <div key={edu.id} className="dd-education-item">
              <div className="dd-experience-date">
                {formatDateRange(edu.startDate, edu.endDate, edu.isCurrent)}
              </div>
              <div>
                <div className="dd-education-degree">
                  {edu.degree
                    ? `${edu.degree}${edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ''}`
                    : edu.fieldOfStudy || 'Degree'}
                </div>
                <div className="dd-education-school">{edu.institution}</div>
                {edu.gpa && <div className="dd-education-field">GPA: {edu.gpa}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// CERTIFICATIONS SECTION
// ============================================================================

interface CertificationsProps {
  profile: TemplateProfileData;
}

export function DDCertifications({ profile }: CertificationsProps) {
  const visibleCerts = profile.certifications.filter((c) => c.isVisible);
  if (visibleCerts.length === 0) return null;

  return (
    <section id="dd-certifications" className="dd-section">
      <div className="dd-container">
        <div className="dd-accent-dash" />
        <h2 className="dd-section-title">Certifications</h2>

        <div className="dd-cert-list">
          {visibleCerts.map((cert) => (
            <a
              key={cert.id}
              href={cert.credentialUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="dd-cert-card"
              style={{ textDecoration: 'none' }}
            >
              <div className="dd-cert-icon">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <div className="dd-cert-name">{cert.name}</div>
                <div className="dd-cert-issuer">{cert.issuer}</div>
                {cert.issueDate && (
                  <div className="dd-cert-date">
                    Issued{' '}
                    {new Date(cert.issueDate).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// GITHUB SECTION
// ============================================================================

interface GithubProps {
  profile: TemplateProfileData;
}

export function DDGithub({ profile }: GithubProps) {
  if (!profile.github) return null;

  const { github } = profile;

  return (
    <section id="dd-github" className="dd-section">
      <div className="dd-container">
        <div className="dd-accent-dash" />
        <h2 className="dd-section-title">Open Source</h2>

        <div className="dd-github-stats">
          <div className="dd-github-stat-card">
            <div className="dd-github-stat-value">{github.publicRepos}</div>
            <div className="dd-github-stat-label">Repositories</div>
          </div>
          <div className="dd-github-stat-card">
            <div className="dd-github-stat-value">{github.totalStars}</div>
            <div className="dd-github-stat-label">Stars</div>
          </div>
          <div className="dd-github-stat-card">
            <div className="dd-github-stat-value">{github.followers}</div>
            <div className="dd-github-stat-label">Followers</div>
          </div>
          <div className="dd-github-stat-card">
            <div className="dd-github-stat-value">{github.primaryLanguages.length}</div>
            <div className="dd-github-stat-label">Languages</div>
          </div>
        </div>

        {github.primaryLanguages.length > 0 && (
          <div className="dd-skill-list" style={{ marginTop: '1rem' }}>
            {github.primaryLanguages.map((lang, i) => (
              <span key={i} className="dd-skill-pill">
                {lang}
              </span>
            ))}
          </div>
        )}

        <div style={{ marginTop: '1.5rem' }}>
          <a
            href={`https://github.com/${github.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="dd-cta-link"
          >
            View GitHub Profile
          </a>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// CONTACT SECTION
// ============================================================================

interface ContactProps {
  profile: TemplateProfileData;
  copy: TemplateCopy;
}

export function DDContact({ profile, copy }: ContactProps) {
  return (
    <section id="dd-contact" className="dd-section">
      <div className="dd-container">
        <div className="dd-contact-grid">
          {/* Left: Info */}
          <div>
            <div className="dd-accent-dash" />
            <h2 className="dd-section-title">{copy.contactTitle || "Let's work together"}</h2>
            <p className="dd-contact-info-text">{copy.contactSubtext || 'Get in touch with me'}</p>

            {/* Social icons */}
            <div style={{ marginBottom: '1.5rem' }}>
              <SocialLinksRow links={profile.links} />
            </div>

            {/* Contact details */}
            {profile.contactInfo?.email && (
              <div className="dd-contact-detail">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
                </svg>
                <a
                  href={`mailto:${profile.contactInfo.email}`}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  {profile.contactInfo.email}
                </a>
              </div>
            )}
            {profile.location && (
              <div className="dd-contact-detail">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {profile.location}
              </div>
            )}
          </div>

          {/* Right: Contact Form (visual only — mailto on submit) */}
          <div>
            <form
              className="dd-contact-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (profile.contactInfo?.email) {
                  window.location.href = `mailto:${profile.contactInfo.email}`;
                }
              }}
            >
              <input type="text" placeholder="Enter your name" className="dd-input" readOnly />
              <input type="email" placeholder="Your email address" className="dd-input" readOnly />
              <input type="text" placeholder="Subject" className="dd-input" readOnly />
              <textarea
                placeholder="Write me a message"
                className="dd-input dd-textarea"
                readOnly
              />
              <button type="submit" className="dd-btn-primary" style={{ alignSelf: 'flex-start' }}>
                Contact me
                <span>→</span>
              </button>
            </form>
          </div>
        </div>
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

export function DDFooter({ profile }: FooterProps) {
  const displayName = getDisplayName(profile.firstName, profile.lastName);
  const year = new Date().getFullYear();

  return (
    <footer id="dd-footer" className="dd-footer">
      <div className="dd-container">
        <div className="dd-footer-inner">
          <span className="dd-footer-text">
            © {year} {displayName}. All rights reserved.
          </span>
          <span className="dd-footer-text">
            Built with{' '}
            <a
              href="https://follio.app"
              target="_blank"
              rel="noopener noreferrer"
              className="dd-footer-link"
            >
              Follio
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}

// ============================================================================
// SECTION COMPONENT MAP
// ============================================================================

/**
 * Maps section type → component.
 * Used by the template renderer to dynamically render enabled sections.
 */
export const SECTION_MAP: Record<string, React.ComponentType<Record<string, unknown>>> = {
  hero: DDHero as unknown as React.ComponentType<Record<string, unknown>>,
  about: DDAbout as unknown as React.ComponentType<Record<string, unknown>>,
  experience: DDExperience as unknown as React.ComponentType<Record<string, unknown>>,
  projects: DDProjects as unknown as React.ComponentType<Record<string, unknown>>,
  skills: DDSkills as unknown as React.ComponentType<Record<string, unknown>>,
  education: DDEducation as unknown as React.ComponentType<Record<string, unknown>>,
  certifications: DDCertifications as unknown as React.ComponentType<Record<string, unknown>>,
  github: DDGithub as unknown as React.ComponentType<Record<string, unknown>>,
  contact: DDContact as unknown as React.ComponentType<Record<string, unknown>>,
};
