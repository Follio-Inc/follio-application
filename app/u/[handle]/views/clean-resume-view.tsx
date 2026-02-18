'use client';

import { Check, Copy, Grid3X3, Printer } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cleanPhoneDisplay } from '@/components/ui/phone-input';
import { getPortfolioPath } from '@/lib/url';
import { formatDate } from '@/lib/utils';
import type {
  CustomSectionContent,
  CustomSectionItem,
  InterestItem,
  InterestsSectionContent,
  LanguageItem,
  LanguagesSectionContent,
  ProfileSection,
  PublicationItem,
  PublicationsSectionContent,
  PublicProfile,
  VolunteeringItem,
  VolunteeringSectionContent,
} from '@/types';

interface CleanResumeViewProps {
  profile: PublicProfile;
  profileHandle?: string;
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

function ResumeHeader({ profile }: { profile: PublicProfile }) {
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const showPhoto =
    (profile as Record<string, unknown>).resumeShowPhoto === true && profile.avatarUrl;

  // Build contact line items
  const contactItems: string[] = [];

  if (profile.location) {
    contactItems.push(profile.location);
  }

  // For public profiles, the server already filters email/phone based on
  // emailPublic/phonePublic. For the builder preview (which sends full
  // ContactInfo), we check the flags directly.
  const ci = profile.contactInfo as Record<string, unknown> | null;
  console.log('[ResumeView] contactInfo:', {
    email: profile.contactInfo?.email,
    phone: profile.contactInfo?.phone,
    emailPublic: ci?.emailPublic,
    phonePublic: ci?.phonePublic,
  });
  if (profile.contactInfo?.email && ci?.emailPublic !== false) {
    contactItems.push(profile.contactInfo.email);
  }

  if (profile.contactInfo?.phone && ci?.phonePublic !== false) {
    contactItems.push(cleanPhoneDisplay(profile.contactInfo.phone));
  }

  // Add visible links (visibility controlled solely by the eye icon / isVisible flag)
  profile.links?.forEach((link) => {
    if ((link as Record<string, unknown>).isVisible === false) return;
    // Clean URL for display (remove https://, www.)
    const displayUrl = link.url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '');
    contactItems.push(displayUrl);
  });

  return (
    <header className="resume-header relative">
      {showPhoto ? (
        <div className="flex items-start gap-4">
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
// SUMMARY SECTION
// ============================================================================

function SummarySection({ summary }: { summary: string }) {
  return (
    <section className="resume-section">
      <SectionDivider title="SUMMARY" />
      <p className="resume-summary">{summary}</p>
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
      {bullets && bullets.length > 0 && (
        <ul className="resume-bullets">
          {bullets.map((bullet, index) => (
            <li key={index}>{bullet}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExperienceSection({ experiences }: { experiences: PublicProfile['workExperiences'] }) {
  const visibleExperiences =
    experiences?.filter((exp) => (exp as Record<string, unknown>).isVisible !== false) || [];
  if (visibleExperiences.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="EXPERIENCE" />
      <div className="resume-entries">
        {visibleExperiences.map((exp) => (
          <ExperienceEntry
            key={exp.id}
            role={exp.role}
            company={exp.company}
            location={exp.location}
            startDate={exp.startDate}
            endDate={exp.endDate}
            isCurrent={exp.isCurrent}
            bullets={exp.bullets}
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
  const visibleEducations =
    educations?.filter((edu) => (edu as Record<string, unknown>).isVisible !== false) || [];
  if (visibleEducations.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="EDUCATION" />
      <div className="resume-entries">
        {visibleEducations.map((edu) => {
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

  // If we have skill groups, display grouped (filtering hidden skills)
  if (skillGroups && skillGroups.length > 0) {
    const filteredGroups = skillGroups
      .map((group) => ({
        ...group,
        skills: group.skills.filter((s) => (s as Record<string, unknown>).isVisible !== false),
      }))
      .filter((group) => group.skills.length > 0);

    if (filteredGroups.length === 0) return null;

    return (
      <section className="resume-section">
        <SectionDivider title="SKILLS" />
        <div className="resume-skills-grouped">
          {filteredGroups.map((group) => (
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

  // Otherwise, display flat list (filtering hidden)
  const visibleSkills =
    skills?.filter((s) => (s as Record<string, unknown>).isVisible !== false) || [];
  if (visibleSkills.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="SKILLS" />
      <p className="resume-skills-flat">{visibleSkills.map((s) => s.name).join(', ')}</p>
    </section>
  );
}

// ============================================================================
// PROJECTS SECTION
// ============================================================================

function ProjectsSection({ projects }: { projects: PublicProfile['projects'] }) {
  // Filter visible projects
  const visibleProjects =
    projects?.filter((p) => p.isVisible !== false && p.showOnResume !== false) || [];

  if (visibleProjects.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="PROJECTS" />
      <div className="resume-entries">
        {visibleProjects.map((project) => {
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
              {description && <p className="resume-entry-description">{description}</p>}
              {project.highlights && project.highlights.length > 0 && (
                <ul className="resume-bullets">
                  {project.highlights.map((highlight, index) => (
                    <li key={index}>{highlight}</li>
                  ))}
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
  const visibleCerts =
    certifications?.filter((c) => (c as Record<string, unknown>).isVisible !== false) || [];
  if (visibleCerts.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="CERTIFICATIONS" />
      <div className="resume-entries resume-entries-compact">
        {visibleCerts.map((cert) => {
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
  const visibleAwards =
    awards?.filter((a) => (a as Record<string, unknown>).isVisible !== false) || [];
  if (visibleAwards.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="AWARDS & RECOGNITION" />
      <div className="resume-entries resume-entries-compact">
        {visibleAwards.map((award) => {
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
// ACTIONS BAR
// ============================================================================

function ResumeActions({
  resumeRef,
  profileHandle,
}: {
  resumeRef: React.RefObject<HTMLDivElement | null>;
  profileHandle?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!resumeRef.current) return;

    // Get the text content, preserving some structure
    const text = resumeRef.current.innerText;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [resumeRef]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="resume-actions print:hidden">
      {profileHandle && (
        <a href={getPortfolioPath(profileHandle)}>
          <Button
            variant="outline"
            size="sm"
            className="resume-action-button"
            title="View Portfolio"
          >
            <Grid3X3 className="h-4 w-4" />
            <span>Portfolio</span>
          </Button>
        </a>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="resume-action-button"
        title="Copy to clipboard"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        <span>{copied ? 'Copied!' : 'Copy'}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrint}
        className="resume-action-button"
        title="Print or save as PDF"
      >
        <Printer className="h-4 w-4" />
        <span>Print</span>
      </Button>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CleanResumeView({ profile, profileHandle }: CleanResumeViewProps) {
  const resumeRef = useRef<HTMLDivElement>(null);

  // Get section data
  // If no sections exist yet (legacy/new profile), default to showing everything
  const hasNoSections = !profile.sections || profile.sections.length === 0;

  const getSectionByType = (type: string) =>
    (profile.sections || []).find((s: ProfileSection) => s.type === type && s.isVisible);

  // Check if a section type should be visible
  // Shows everything by default when no sections are configured
  const isSectionVisible = (type: string) => hasNoSections || !!getSectionByType(type);

  const customSections = (profile.sections || [])
    .filter((s: ProfileSection) => s.type === 'CUSTOM' && s.isVisible)
    .sort((a: ProfileSection, b: ProfileSection) => a.sortOrder - b.sortOrder);

  // Extract specialized sections
  const volunteeringSection = getSectionByType('VOLUNTEERING');
  const languagesSection = getSectionByType('LANGUAGES');
  const publicationsSection = getSectionByType('PUBLICATIONS');
  const interestsSection = getSectionByType('INTERESTS');

  const volunteeringItems = volunteeringSection
    ? (volunteeringSection.customContent as unknown as VolunteeringSectionContent)?.items || []
    : [];
  const languageItems = languagesSection
    ? (languagesSection.customContent as unknown as LanguagesSectionContent)?.items || []
    : [];
  const publicationItems = publicationsSection
    ? (publicationsSection.customContent as unknown as PublicationsSectionContent)?.items || []
    : [];
  const interestItems = interestsSection
    ? (interestsSection.customContent as unknown as InterestsSectionContent)?.items || []
    : [];

  return (
    <>
      <ResumeActions resumeRef={resumeRef} profileHandle={profileHandle} />

      <article ref={resumeRef} className="resume-paper">
        <ResumeHeader profile={profile} />

        {profile.summary && <SummarySection summary={profile.summary} />}

        {isSectionVisible('EXPERIENCE') && (
          <ExperienceSection experiences={profile.workExperiences} />
        )}

        {isSectionVisible('EDUCATION') && <EducationSection educations={profile.educations} />}

        {isSectionVisible('SKILLS') && <SkillsSection profile={profile} />}

        {isSectionVisible('PROJECTS') && <ProjectsSection projects={profile.projects} />}

        {isSectionVisible('CERTIFICATIONS') && (
          <CertificationsSection certifications={profile.certifications} />
        )}

        {isSectionVisible('AWARDS') && <AwardsSection awards={profile.awards} />}

        <PublicationsSection items={publicationItems} />

        <VolunteeringSection items={volunteeringItems} />

        <LanguagesSection items={languageItems} />

        <InterestsSection items={interestItems} />

        {customSections.map((section) => (
          <CustomSection key={section.id} section={section} />
        ))}
      </article>
    </>
  );
}
