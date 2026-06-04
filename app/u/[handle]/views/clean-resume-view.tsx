'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { containsHtmlFormatting, isHtmlEmpty } from '@/lib/html-utils';
import { cleanPhoneDisplay } from '@/lib/phone';
import { buildResumeDesignStyles, parseResumeDesign } from '@/lib/resume-design';
import { formatDate } from '@/lib/utils';
import { applyVisibilityFilter, type FilteredProfile } from '@/lib/visibility';
import type {
    CustomSectionContent,
    CustomSectionItem,
    InterestItem,
    LanguageItem,
    ProfileSection,
    PublicationItem,
    PublicProfile,
    VolunteeringItem,
} from '@/types';
import { HEADER_SECTION_TYPES, type ResumeDesign, type ResumeFontFamily } from '@/types';

import { PublicResumeActions } from './public-resume-actions';
import { ResumeFontLoader } from './resume-font-loader';

interface CleanResumeViewProps {
  profile: PublicProfile;
  profileHandle?: string;
  /**
   * Visitor auth context (resolved server-side). When provided, the
   * floating action cluster is rendered (Copy text / Download / Share).
   * Omit when rendering inside the builder preview, where these are
   * handled by `<PreviewFloatingActions>` instead.
   */
  authState?: 'owner' | 'authenticated' | 'anonymous';
  /** Callback when the floating justify-all button is toggled (for persistence). */
  onJustifyToggle?: (justified: boolean) => void;
  /** Builder mode: whether all rich-text content is currently justified */
  allContentJustified?: boolean;
  /** Builder mode: callback to justify all rich-text content */
  onJustifyAll?: () => void;
}

// ============================================================================
// SECTION DIVIDER COMPONENT
// ============================================================================

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="resume-section-header">
      <h2 className="resume-section-title">{title}</h2>
      <div className="resume-section-line" />
    </div>
  );
}

// ============================================================================
// DATE FORMATTER HELPER
// ============================================================================

function formatResumeDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  return formatDate(date, { month: 'short', year: 'numeric' });
}

function formatDateRange(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  isCurrent?: boolean
): string {
  const start = formatResumeDate(startDate);
  const end = isCurrent ? 'Present' : formatResumeDate(endDate);
  if (!start && !end) return '';
  if (!start) return end;
  return `${start} – ${end}`;
}

// ============================================================================
// HEADER SECTION
// ============================================================================

function ResumeHeader({ profile }: { profile: FilteredProfile }) {
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

  const showPhoto =
    (profile as unknown as Record<string, unknown>).resumeShowPhoto === true &&
    profile.avatarUrl &&
    profile._photosVisible;

  // Build contact line items — respects user-configured headerFieldsOrder
  const contactItems: string[] = (() => {
    // Build a map: id → display string
    const itemMap = new Map<string, string>();

    if (profile.location) {
      itemMap.set('location', profile.location);
    }
    if (profile.contactInfo?.email) {
      itemMap.set('email', profile.contactInfo.email);
    }
    if (profile.contactInfo?.phone) {
      itemMap.set('phone', cleanPhoneDisplay(profile.contactInfo.phone));
    }

    // Links — already filtered by applyVisibilityFilter (section + entry level)
    profile.links?.forEach((link) => {
      const displayUrl = link.url
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '');
      itemMap.set(link.id, displayUrl);
    });

    const storedOrder = (profile.contactInfo as Record<string, unknown> | null)?.headerFieldsOrder;
    const order = Array.isArray(storedOrder) ? (storedOrder as string[]) : null;

    if (order && order.length > 0) {
      const ordered: string[] = [];
      const seen = new Set<string>();
      for (const id of order) {
        const val = itemMap.get(id);
        if (val && !seen.has(id)) {
          ordered.push(val);
          seen.add(id);
        }
      }
      // Append items not in the stored order
      for (const [id, val] of itemMap) {
        if (!seen.has(id)) ordered.push(val);
      }
      return ordered;
    }

    // Fallback: default order
    return Array.from(itemMap.values());
  })();

  return (
    <header className="resume-header relative">
      {showPhoto ? (
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profile.avatarUrl!}
            alt={fullName}
            className="h-20 w-20 rounded-full object-cover print:h-16 print:w-16"
            style={{ flexShrink: 0 }}
          />
          <div className="min-w-0 flex-1">
            <h1 className="resume-name">{fullName}</h1>
            {profile.headline && <p className="resume-headline">{profile.headline}</p>}
            {contactItems.length > 0 && (
              <p className="resume-contact-line">
                {contactItems.map((item, index) => (
                  <span key={index}>
                    {index > 0 && <span className="resume-contact-separator"> | </span>}
                    <span className="resume-contact-item">{item}</span>
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <h1 className="resume-name">{fullName}</h1>
          {profile.headline && <p className="resume-headline">{profile.headline}</p>}
          {contactItems.length > 0 && (
            <p className="resume-contact-line">
              {contactItems.map((item, index) => (
                <span key={index}>
                  {index > 0 && <span className="resume-contact-separator"> | </span>}
                  <span className="resume-contact-item">{item}</span>
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </header>
  );
}

// ============================================================================
// RICH HTML HELPER
// ============================================================================

/**
 * Render a string that may contain HTML formatting from the rich text editor.
 * Falls back to plain text rendering when no HTML is detected.
 */
function RichHtml({
  html,
  className,
  as: Tag = 'div',
}: {
  html: string;
  className?: string;
  as?: 'div' | 'p' | 'span';
}) {
  if (containsHtmlFormatting(html)) {
    return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <Tag className={className}>{html}</Tag>;
}

// ============================================================================
// SUMMARY SECTION
// ============================================================================

function SummarySection({ summary }: { summary: string }) {
  return (
    <section className="resume-section">
      <SectionDivider title="SUMMARY" />
      <RichHtml html={summary} className="resume-summary resume-rich-html" />
    </section>
  );
}

// ============================================================================
// EXPERIENCE SECTION
// ============================================================================

interface ExperienceEntryProps {
  role: string;
  company: string;
  location?: string | null;
  startDate: Date | string | null | undefined;
  endDate: Date | string | null | undefined;
  isCurrent?: boolean;
  bullets: string[];
  /** Complete editor HTML — when present, rendered directly for perfect fidelity. */
  bulletsHtml?: string | null;
  tags?: string[];
}

function ExperienceEntry({
  role,
  company,
  location,
  startDate,
  endDate,
  isCurrent,
  bullets,
  bulletsHtml,
}: ExperienceEntryProps) {
  const dateRange = formatDateRange(startDate, endDate, isCurrent);
  const companyLine = [company, location].filter(Boolean).join(', ');

  return (
    <div className="resume-entry">
      <div className="resume-entry-header">
        <div className="resume-entry-title-block">
          <h3 className="resume-entry-title">{role}</h3>
          <p className="resume-entry-subtitle">{companyLine}</p>
        </div>
        <span className="resume-entry-date">{dateRange}</span>
      </div>
      {/* Prefer bulletsHtml for perfect rendering (alignment, bullet style, etc.). */}
      {/* Fall back to bullets[] for backward compat / when bulletsHtml is absent. */}
      {bulletsHtml ? (
        <div dangerouslySetInnerHTML={{ __html: bulletsHtml }} />
      ) : (
        bullets &&
        bullets.length > 0 && (
          <ul className="resume-bullets">
            {bullets.map((bullet, index) =>
              containsHtmlFormatting(bullet) ? (
                <li key={index} dangerouslySetInnerHTML={{ __html: bullet }} />
              ) : (
                <li key={index}>{bullet}</li>
              )
            )}
          </ul>
        )
      )}
    </div>
  );
}

function ExperienceSection({ experiences }: { experiences: PublicProfile['workExperiences'] }) {
  if (!experiences || experiences.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="EXPERIENCE" />
      <div className="resume-entries">
        {experiences.map((exp) => (
          <ExperienceEntry
            key={exp.id}
            role={exp.role}
            company={exp.company}
            location={exp.location}
            startDate={exp.startDate}
            endDate={exp.endDate}
            isCurrent={exp.isCurrent}
            bullets={exp.bullets}
            bulletsHtml={exp.bulletsHtml}
            tags={exp.tags}
          />
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// EDUCATION SECTION
// ============================================================================

function EducationSection({ educations }: { educations: PublicProfile['educations'] }) {
  if (!educations || educations.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="EDUCATION" />
      <div className="resume-entries">
        {educations.map((edu) => {
          const degreeLine = [edu.degree, edu.fieldOfStudy].filter(Boolean).join(' in ');
          const dateRange = formatDateRange(edu.startDate, edu.endDate, edu.isCurrent);

          return (
            <div key={edu.id} className="resume-entry">
              <div className="resume-entry-header">
                <div className="resume-entry-title-block">
                  <h3 className="resume-entry-title">{degreeLine || edu.institution}</h3>
                  {degreeLine && <p className="resume-entry-subtitle">{edu.institution}</p>}
                </div>
                <span className="resume-entry-date">{dateRange}</span>
              </div>
              {(edu.gpa || edu.activities) && (
                <div className="resume-entry-details">
                  {edu.gpa && <p>GPA: {edu.gpa}</p>}
                  {edu.activities && <p>{edu.activities}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// SKILLS SECTION
// ============================================================================

function SkillsSection({ profile }: { profile: PublicProfile }) {
  const { skills, skillGroups } = profile;

  // If we have skill groups, display grouped (already filtered by applyVisibilityFilter)
  if (skillGroups && skillGroups.length > 0) {
    return (
      <section className="resume-section">
        <SectionDivider title="SKILLS" />
        <div className="resume-skills-grouped">
          {skillGroups.map((group) => (
            <div key={group.id} className="resume-skill-group">
              <span className="resume-skill-group-name">{group.name}:</span>{' '}
              <span className="resume-skill-group-items">
                {group.skills.map((s) => s.name).join(', ')}
              </span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Otherwise, display flat list (already filtered by applyVisibilityFilter)
  if (!skills || skills.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="SKILLS" />
      <p className="resume-skills-flat">{skills.map((s) => s.name).join(', ')}</p>
    </section>
  );
}

// ============================================================================
// PROJECTS SECTION
// ============================================================================

function ProjectsSection({ projects }: { projects: PublicProfile['projects'] }) {
  if (!projects || projects.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="PROJECTS" />
      <div className="resume-entries">
        {projects.map((project) => {
          const dateRange = formatDateRange(project.startDate, project.endDate, project.isCurrent);
          const description = project.customDescription || project.shortDesc || project.description;

          return (
            <div key={project.id} className="resume-entry">
              <div className="resume-entry-header">
                <div className="resume-entry-title-block">
                  <h3 className="resume-entry-title">
                    {project.title}
                    {project.url && (
                      <a
                        href={project.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="resume-project-link"
                      >
                        {' '}
                        ↗
                      </a>
                    )}
                  </h3>
                  {project.techStack && project.techStack.length > 0 && (
                    <p className="resume-entry-tech">{project.techStack.join(', ')}</p>
                  )}
                </div>
                {dateRange && <span className="resume-entry-date">{dateRange}</span>}
              </div>
              {description && (
                <RichHtml
                  html={description}
                  className="resume-entry-description resume-rich-html"
                  as="div"
                />
              )}
              {project.highlights && project.highlights.length > 0 && (
                <ul className="resume-bullets">
                  {project.highlights.map((highlight, index) =>
                    containsHtmlFormatting(highlight) ? (
                      <li key={index} dangerouslySetInnerHTML={{ __html: highlight }} />
                    ) : (
                      <li key={index}>{highlight}</li>
                    )
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// CERTIFICATIONS SECTION
// ============================================================================

function CertificationsSection({
  certifications,
}: {
  certifications: PublicProfile['certifications'];
}) {
  if (!certifications || certifications.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="CERTIFICATIONS" />
      <div className="resume-entries resume-entries-compact">
        {certifications.map((cert) => {
          const issuedDate = formatResumeDate(cert.issueDate);
          const expDate = cert.expirationDate ? formatResumeDate(cert.expirationDate) : null;

          return (
            <div key={cert.id} className="resume-entry-inline">
              <span className="resume-entry-inline-title">{cert.name}</span>
              <span className="resume-entry-inline-issuer"> — {cert.issuer}</span>
              {issuedDate && (
                <span className="resume-entry-inline-date">
                  {' '}
                  ({issuedDate}
                  {expDate && `, expires ${expDate}`})
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// AWARDS SECTION
// ============================================================================

function AwardsSection({ awards }: { awards: PublicProfile['awards'] }) {
  if (!awards || awards.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="AWARDS & RECOGNITION" />
      <div className="resume-entries resume-entries-compact">
        {awards.map((award) => {
          const awardDate = formatResumeDate(award.date);

          return (
            <div key={award.id} className="resume-entry-inline">
              <span className="resume-entry-inline-title">{award.title}</span>
              {award.issuer && (
                <span className="resume-entry-inline-issuer"> — {award.issuer}</span>
              )}
              {awardDate && <span className="resume-entry-inline-date"> ({awardDate})</span>}
              {award.description && (
                <p className="resume-entry-inline-description">{award.description}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// PUBLICATIONS SECTION
// ============================================================================

function PublicationsSection({ items }: { items: PublicationItem[] }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="PUBLICATIONS" />
      <div className="resume-entries resume-entries-compact">
        {items.map((pub) => (
          <div key={pub.id} className="resume-publication">
            <p className="resume-publication-title">
              {pub.url ? (
                <a href={pub.url} target="_blank" rel="noopener noreferrer">
                  {pub.title}
                </a>
              ) : (
                pub.title
              )}
            </p>
            {pub.authors && <p className="resume-publication-authors">{pub.authors}</p>}
            <p className="resume-publication-meta">
              {[pub.publisher, pub.date].filter(Boolean).join(', ')}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// VOLUNTEERING SECTION
// ============================================================================

function VolunteeringSection({ items }: { items: VolunteeringItem[] }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="VOLUNTEERING" />
      <div className="resume-entries">
        {items.map((vol) => {
          const dateRange =
            vol.startDate || vol.endDate || vol.isCurrent
              ? `${vol.startDate || ''} – ${vol.isCurrent ? 'Present' : vol.endDate || ''}`
              : '';

          return (
            <div key={vol.id} className="resume-entry">
              <div className="resume-entry-header">
                <div className="resume-entry-title-block">
                  <h3 className="resume-entry-title">{vol.role}</h3>
                  <p className="resume-entry-subtitle">{vol.organization}</p>
                </div>
                {dateRange && <span className="resume-entry-date">{dateRange}</span>}
              </div>
              {vol.description && <p className="resume-entry-description">{vol.description}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// LANGUAGES SECTION
// ============================================================================

function LanguagesSection({ items }: { items: LanguageItem[] }) {
  if (!items || items.length === 0) return null;

  const getProficiencyLabel = (proficiency: string) => {
    const labels: Record<string, string> = {
      NATIVE: 'Native',
      FLUENT: 'Fluent',
      ADVANCED: 'Advanced',
      INTERMEDIATE: 'Intermediate',
      BASIC: 'Basic',
    };
    return labels[proficiency] || proficiency;
  };

  return (
    <section className="resume-section">
      <SectionDivider title="LANGUAGES" />
      <p className="resume-languages">
        {items.map((lang, index) => (
          <span key={lang.id}>
            {index > 0 && ', '}
            {lang.language} ({getProficiencyLabel(lang.proficiency)})
          </span>
        ))}
      </p>
    </section>
  );
}

// ============================================================================
// INTERESTS SECTION
// ============================================================================

function InterestsSection({ items }: { items: InterestItem[] }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="INTERESTS" />
      <p className="resume-interests">{items.map((i) => i.name).join(', ')}</p>
    </section>
  );
}

// ============================================================================
// CUSTOM SECTIONS
// ============================================================================

function CustomSection({ section }: { section: ProfileSection }) {
  const content = section.customContent as CustomSectionContent | null;
  const items = content?.items || [];
  const freeformContent = content?.content;

  if (items.length === 0 && !freeformContent) return null;

  return (
    <section className="resume-section">
      <SectionDivider title={section.title.toUpperCase()} />

      {items.length > 0 && (
        <div className="resume-entries">
          {items.map((item: CustomSectionItem) => {
            const dateRange =
              item.startDate || item.endDate || item.isCurrent
                ? `${item.startDate || ''} – ${item.isCurrent ? 'Present' : item.endDate || ''}`
                : '';

            return (
              <div key={item.id} className="resume-entry">
                <div className="resume-entry-header">
                  <div className="resume-entry-title-block">
                    <h3 className="resume-entry-title">{item.title}</h3>
                    {item.subtitle && <p className="resume-entry-subtitle">{item.subtitle}</p>}
                  </div>
                  {dateRange && <span className="resume-entry-date">{dateRange}</span>}
                </div>
                {item.description && <p className="resume-entry-description">{item.description}</p>}
                {item.tags && item.tags.length > 0 && (
                  <p className="resume-entry-tags">{item.tags.join(', ')}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {freeformContent && <p className="resume-freeform">{freeformContent}</p>}
    </section>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CleanResumeView({ profile: rawProfile, authState }: CleanResumeViewProps) {
  const resumeRef = useRef<HTMLDivElement>(null);

  // ── Justify-all local state (derived from design, toggleable) ─────────
  const parsedDesign = useMemo(
    () => parseResumeDesign(rawProfile.resumeDesign) as ResumeDesign | null,
    [rawProfile.resumeDesign]
  );
  const [justifyAll, setJustifyAll] = useState(parsedDesign?.justifyAll ?? false);

  // Sync local state when the design prop changes (e.g. from designer panel)
  useEffect(() => {
    setJustifyAll(parsedDesign?.justifyAll ?? false);
  }, [parsedDesign?.justifyAll]);

  // ── Centralized visibility filtering ──────────────────────────────────
  // Apply section-level visibility once. After this, every array/field is
  // already empty or null when its section is hidden, so sub-components
  // never need to check section visibility themselves.
  const profile = applyVisibilityFilter(rawProfile, { resumeContext: true });

  // ── Resume design settings → CSS custom properties ────────────────────
  const designStyles = useMemo(
    () => buildResumeDesignStyles(parseResumeDesign(rawProfile.resumeDesign)),
    [rawProfile]
  );

  // ── Sections ordered by user-configured sortOrder ─────────────────────
  // Header sections (BASIC_INFO, LINKS) are always rendered as
  // the header block; body sections follow in their sortOrder.
  const bodySections = (profile.sections || [])
    .filter((s: ProfileSection) => !HEADER_SECTION_TYPES.includes(s.type))
    .sort((a: ProfileSection, b: ProfileSection) => a.sortOrder - b.sortOrder);

  // ── Helper to extract custom-content items from a section ─────────────
  const getCustomContentItems = <T,>(section: ProfileSection): T[] => {
    const content = section.customContent as unknown as { items?: T[] } | null;
    return content?.items || [];
  };

  // ── Render a body section by its type ─────────────────────────────────
  const renderSection = (section: ProfileSection) => {
    switch (section.type) {
      case 'SUMMARY':
        return profile.summary && !isHtmlEmpty(profile.summary) ? (
          <SummarySection key={section.id} summary={profile.summary} />
        ) : null;
      case 'EXPERIENCE':
        return <ExperienceSection key={section.id} experiences={profile.workExperiences} />;
      case 'EDUCATION':
        return <EducationSection key={section.id} educations={profile.educations} />;
      case 'SKILLS':
        return <SkillsSection key={section.id} profile={profile} />;
      case 'PROJECTS':
        return <ProjectsSection key={section.id} projects={profile.projects} />;
      case 'CERTIFICATIONS':
        return <CertificationsSection key={section.id} certifications={profile.certifications} />;
      case 'AWARDS':
        return <AwardsSection key={section.id} awards={profile.awards} />;
      case 'PUBLICATIONS':
        return (
          <PublicationsSection
            key={section.id}
            items={getCustomContentItems<PublicationItem>(section)}
          />
        );
      case 'VOLUNTEERING':
        return (
          <VolunteeringSection
            key={section.id}
            items={getCustomContentItems<VolunteeringItem>(section)}
          />
        );
      case 'LANGUAGES':
        return (
          <LanguagesSection key={section.id} items={getCustomContentItems<LanguageItem>(section)} />
        );
      case 'INTERESTS':
        return (
          <InterestsSection key={section.id} items={getCustomContentItems<InterestItem>(section)} />
        );
      case 'CUSTOM':
        return <CustomSection key={section.id} section={section} />;
      default:
        return null;
    }
  };

  // ── Determine the font family for the font loader ——————————
  const activeFontFamily = (parseResumeDesign(rawProfile.resumeDesign) as ResumeDesign | null)
    ?.fontFamily as ResumeFontFamily | undefined;

  // Anchor element for the kebab menu — sits at the resume's top-right.
  // Stored in state (rather than a plain ref) so `<PublicResumeActions>`
  // re-renders once the DOM node is available and can portal the kebab
  // into it.
  const [kebabAnchor, setKebabAnchor] = useState<HTMLDivElement | null>(null);

  return (
    <>
      <ResumeFontLoader fontFamily={activeFontFamily} />
      {authState ? (
        <PublicResumeActions
          resumeRef={resumeRef}
          profileId={rawProfile.id}
          handle={rawProfile.handle}
          firstName={rawProfile.firstName ?? null}
          resumeTitle={rawProfile.resumeTitle || 'Untitled Resume'}
          resumeVisibility={rawProfile.resumeVisibility ?? 'PRIVATE'}
          authState={authState}
          kebabContainer={kebabAnchor}
        />
      ) : null}

      <div className="resume-paper-wrapper group/resume relative">
        {/* Kebab anchor — sits *outside* the resume's right margin,
            vertically aligned with the top of the paper. The actual
            menu is portalled in by `<PublicResumeActions>` so it
            shares state with the bottom cluster (no logic
            duplication). Hidden when there's no visitor (i.e. inside
            the builder preview). */}
        {authState ? (
          <div
            ref={setKebabAnchor}
            className="absolute left-full top-0 z-20 ml-2 print:hidden"
            aria-hidden="true"
          />
        ) : null}

        <article
          ref={resumeRef}
          className={['resume-paper', justifyAll && 'resume-justify-all'].filter(Boolean).join(' ')}
          style={designStyles}
        >
          <ResumeHeader profile={profile} />

          {/* Render body sections in user-configured sortOrder */}
          {bodySections.map(renderSection)}
        </article>
      </div>
    </>
  );
}
