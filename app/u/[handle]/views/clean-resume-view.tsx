'use client';

import { createContext, useContext, useMemo, useRef, useState } from 'react';

import { useResolvedResumeColorTheme } from '@/lib/hooks/use-resume-color-theme';
import {
  containsHtmlFormatting,
  isHtmlEmpty,
  resumeBulletInnerHtml,
  resumeEntryBodyHtml,
  sanitizeRichHtml,
} from '@/lib/html-utils';
import {
  buildResumeAtelierContactFields,
  formatAtelierYearRange,
  type AtelierContactKind,
} from '@/lib/resume/atelier';
import {
  buildResumeContactItems,
  buildResumeStudioContactFields,
  getResumeFullName,
  shouldShowResumePhoto,
} from '@/lib/resume/contact';
import type { ResumeGlance } from '@/lib/resume/glance';
import {
  highlightsByEntry,
  markPhrasesInHtml,
  type EntryHighlights,
  type GlanceInsert,
} from '@/lib/resume/glance-marks';
import { resolveHeaderComposition, isPhotoBeforeText } from '@/lib/resume/header-layout';
import {
  redlineDataProps,
  redlineListHtml,
  type ResumeRedline,
  type RoleRedline,
} from '@/lib/resume-edit/redline';
import { getResumeTemplateId, isResumeAtelierRailSectionType } from '@/lib/resume/templates';
import {
  buildResumeDesignStyles,
  mergeResumeDesign,
  parseResumeDesign,
  resolveResumeFonts,
  resolveResumePageLayout,
} from '@/lib/resume-design';
import { isPagedPageLayout } from '@/lib/resume/page-layout';
import { resolveSkillCategoryLabel, skillGroupsHaveCategoryLabels } from '@/lib/skills/groups';
import { displayTotalExperience } from '@/lib/total-experience';
import { formatDate } from '@/lib/utils';
import { applyVisibilityFilter, type FilteredProfile } from '@/lib/visibility';
import {
  parseHeadingTags,
  resolveExperienceHeadingTags,
  type HeadingTag,
} from '@/lib/heading-tags';
import type {
  CustomSectionContent,
  CustomSectionItem,
  InterestItem,
  LanguageItem,
  ProfileSection,
  PublicationItem,
  PublicProfile,
  ReferenceItem,
  VolunteeringItem,
} from '@/types';
import {
  ResumeEntrySubtitle,
  ResumeEntryTitle,
} from '@/components/heading-tags/resume-heading-tags';
import { displayEntryDurationFrom } from '@/lib/entry-duration';
import { ResumeEntryGroups } from '@/components/section-subheadings/resume-entry-groups';
import { HEADER_SECTION_TYPES, type ResumeDesign } from '@/types';

import { ResumePagedStack } from '@/components/resume-paged-stack';
import { FileText } from 'lucide-react';

import { ViewHighlightsButton } from '@/components/resume-presentation/view-highlights-button';

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
  /**
   * When set, a flying "View Highlights" control sits on the resume's
   * top-right and opens this Follio URL. Omit in the builder, thumbnails,
   * and print preview — those surfaces mount their own control or none.
   */
  viewHighlightsHref?: string;
  /** Toggle the stored glance on this same resume. Takes precedence over href. */
  onViewHighlights?: () => void;
  highlightsOpen?: boolean;
  /**
   * Stored highlights to draw into the resume: marker phrases in the bullets,
   * and an impact box plus skill tags under each company heading. Omit or pass
   * null to show the resume unchanged.
   */
  highlights?: ResumeGlance | null;
  /**
   * Suggested edits to draw into the resume while they are reviewed: rewritten
   * lines in a marker with added words in green, new bullets in green, and
   * removed bullets struck in red. Builder preview only.
   */
  redline?: ResumeRedline | null;
}

// ============================================================================
// SECTION DIVIDER COMPONENT
// ============================================================================

function SectionDivider({ title, tag }: { title: string; tag?: string | null }) {
  return (
    <div className="resume-section-header">
      <div className="resume-section-heading">
        <h2 className="resume-section-title">{title}</h2>
        {tag ? <span className="resume-section-tag">{tag}</span> : null}
      </div>
      <div className="resume-section-line" />
    </div>
  );
}

function AtelierContactIcon({ kind }: { kind: AtelierContactKind }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };

  if (kind === 'phone') {
    return (
      <svg {...common}>
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.35a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.75.32 1.54.55 2.35.68A2 2 0 0 1 22 16.92z" />
      </svg>
    );
  }
  if (kind === 'email') {
    return (
      <svg {...common}>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
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
  if (!end) return start;
  return `${start} – ${end}`;
}

// ============================================================================
// SUGGESTED EDITS
// ============================================================================

/** Suggested edits drawn into the resume while the owner reviews them in the builder. */
const RedlineContext = createContext<ResumeRedline | null>(null);

// ============================================================================
// HEADER SECTION
// ============================================================================

function ResumeHeadline({ headline }: { headline?: string | null }) {
  const mark = useContext(RedlineContext)?.headline;
  if (mark) {
    return (
      <p
        className="resume-headline"
        {...redlineDataProps(mark)}
        dangerouslySetInnerHTML={{ __html: mark.html }}
      />
    );
  }
  return headline ? <p className="resume-headline">{headline}</p> : null;
}

function ResumeHeaderIdentityText({
  fullName,
  headline,
  contactItems,
}: {
  fullName: string;
  headline?: string | null;
  contactItems: string[];
}) {
  return (
    <div className="resume-header-text min-w-0">
      <h1 className="resume-name">{fullName}</h1>
      <ResumeHeadline headline={headline} />
      {contactItems.length > 0 ? (
        <p className="resume-contact-line">
          {contactItems.map((item, index) => (
            <span key={index}>
              {index > 0 && <span className="resume-contact-separator"> | </span>}
              <span className="resume-contact-item">{item}</span>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function ResumeHeader({
  profile,
  showContact = true,
}: {
  profile: FilteredProfile;
  /** When false, contact moves to the sidebar column (Sidebar template). */
  showContact?: boolean;
}) {
  const fullName = getResumeFullName(profile);
  const showPhoto = shouldShowResumePhoto(profile);
  const contactItems = showContact ? buildResumeContactItems(profile) : [];
  const design = mergeResumeDesign(parseResumeDesign(profile.resumeDesign));
  const composition = resolveHeaderComposition(showPhoto, design.headerPhotoLayout);

  const photo = showPhoto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={profile.avatarUrl!}
      alt={fullName}
      className="resume-header-photo rounded-full object-cover"
    />
  ) : null;

  const text = (
    <ResumeHeaderIdentityText
      fullName={fullName}
      headline={profile.headline}
      contactItems={contactItems}
    />
  );

  return (
    <header className="resume-header relative" data-header-composition={composition}>
      {composition === 'text' ? (
        text
      ) : (
        <div className="resume-header-identity">
          {isPhotoBeforeText(composition) ? (
            <>
              {photo}
              {text}
            </>
          ) : (
            <>
              {text}
              {photo}
            </>
          )}
        </div>
      )}
    </header>
  );
}

function SleekHeader({ profile }: { profile: FilteredProfile }) {
  const fullName = getResumeFullName(profile);
  const showPhoto = shouldShowResumePhoto(profile);
  const contactItems = buildResumeContactItems(profile);
  const design = mergeResumeDesign(parseResumeDesign(profile.resumeDesign));
  const composition = resolveHeaderComposition(showPhoto, design.headerPhotoLayout);

  const photo = showPhoto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={profile.avatarUrl!} alt={fullName} className="resume-sleek-photo" />
  ) : null;

  const text = (
    <div className="resume-header-text min-w-0">
      <h1 className="resume-name">{fullName}</h1>
      <ResumeHeadline headline={profile.headline} />
    </div>
  );

  return (
    <header className="resume-header resume-sleek-header" data-header-composition={composition}>
      <div className="resume-sleek-identity resume-header-identity">
        {composition === 'text' || !showPhoto ? (
          text
        ) : isPhotoBeforeText(composition) ? (
          <>
            {photo}
            {text}
          </>
        ) : (
          <>
            {text}
            {photo}
          </>
        )}
      </div>
      {contactItems.length > 0 ? (
        <ul className="resume-sleek-contact">
          {contactItems.map((item) => (
            <li key={item} className="resume-sleek-contact-item">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}

function StudioHeader({ profile }: { profile: FilteredProfile }) {
  const fullName = getResumeFullName(profile);
  const showPhoto = shouldShowResumePhoto(profile);
  const contactFields = buildResumeStudioContactFields(profile);
  const design = mergeResumeDesign(parseResumeDesign(profile.resumeDesign));
  const composition = resolveHeaderComposition(showPhoto, design.headerPhotoLayout);

  const photo = showPhoto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={profile.avatarUrl!} alt={fullName} className="resume-studio-photo" />
  ) : null;

  const text = (
    <div className="resume-studio-identity-text resume-header-text">
      <h1 className="resume-name">{fullName}</h1>
      <ResumeHeadline headline={profile.headline} />
    </div>
  );

  return (
    <header className="resume-header resume-studio-header" data-header-composition={composition}>
      <div className="resume-studio-identity resume-header-identity">
        {composition === 'text' || !showPhoto ? (
          text
        ) : isPhotoBeforeText(composition) ? (
          <>
            {photo}
            {text}
          </>
        ) : (
          <>
            {text}
            {photo}
          </>
        )}
      </div>
      {contactFields.length > 0 ? (
        <ul className="resume-studio-contact">
          {contactFields.map((field) => (
            <li key={field.id} className="resume-studio-contact-item">
              {field.value}
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}

function AtelierHeader({ profile }: { profile: FilteredProfile }) {
  const fullName = getResumeFullName(profile);
  const contactFields = buildResumeAtelierContactFields(profile);

  return (
    <header className="resume-header resume-atelier-header">
      <div className="resume-atelier-identity">
        <h1 className="resume-name">{fullName}</h1>
        <ResumeHeadline headline={profile.headline} />
      </div>
      {contactFields.length > 0 ? (
        <ul className="resume-atelier-contact">
          {contactFields.map((field) => (
            <li key={field.id} className="resume-atelier-contact-item">
              <span className="resume-atelier-contact-icon">
                <AtelierContactIcon kind={field.kind} />
              </span>
              <span>{field.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
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
    return (
      <Tag className={className} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }} />
    );
  }
  return <Tag className={className}>{html}</Tag>;
}

/** Experience highlights and education notes share this body renderer. */
function ResumeEntryBody({
  html,
  bullets,
  phrases,
  redline,
}: {
  html?: string | null;
  bullets?: string[] | null;
  /** Words already in the body to draw with a marker. */
  phrases?: readonly string[];
  /** Suggested bullet edits for this entry. */
  redline?: RoleRedline;
}) {
  const sanitized = resumeEntryBodyHtml({ html, bullets });
  const markup = redline ? redlineListHtml(sanitized, redline) : sanitized;
  if (!markup) return null;
  const marked = phrases?.length ? markPhrasesInHtml(markup, phrases) : markup;
  return <div dangerouslySetInnerHTML={{ __html: marked }} />;
}

/** Impact summary, then skill tags. In the flow, so everything below moves down. */
function GlanceInserts({ insert }: { insert: GlanceInsert }) {
  return (
    <div className="glance-inserts" data-copy-exclude>
      {insert.summary ? (
        <p className="glance-summary">
          <span className="sr-only">Impact: </span>
          {insert.summary}
        </p>
      ) : null}
      {insert.skills.length > 0 ? (
        <ul className="glance-skills" aria-label="Top skills">
          {insert.skills.map((skill) => (
            <li key={skill}>{skill}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ============================================================================
// SUMMARY SECTION
// ============================================================================

function SummarySection({ summary, title = 'SUMMARY' }: { summary: string; title?: string }) {
  const mark = useContext(RedlineContext)?.summary;
  return (
    <section className="resume-section">
      <SectionDivider title={title} />
      {mark ? (
        <div
          className="resume-summary resume-rich-html"
          {...redlineDataProps(mark)}
          dangerouslySetInnerHTML={{ __html: mark.html }}
        />
      ) : (
        <RichHtml html={summary} className="resume-summary resume-rich-html" />
      )}
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
  headingTags?: HeadingTag[];
  duration?: string | null;
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
  headingTags = [],
  duration,
  variant = 'default',
  highlight,
  redline,
}: ExperienceEntryProps & {
  variant?: 'default' | 'atelier';
  highlight?: EntryHighlights;
  redline?: RoleRedline;
}) {
  const dateRange =
    variant === 'atelier'
      ? formatAtelierYearRange(startDate, endDate, isCurrent)
      : formatDateRange(startDate, endDate, isCurrent);
  const companyLine = [company, location].filter(Boolean).join(', ');
  const bulletsBlock = (
    <ResumeEntryBody
      html={bulletsHtml}
      bullets={bullets}
      phrases={highlight?.phrases}
      redline={redline}
    />
  );
  const inserts = highlight?.insert ? <GlanceInserts insert={highlight.insert} /> : null;

  if (variant === 'atelier') {
    return (
      <div className="resume-entry resume-atelier-exp">
        <div className="resume-atelier-exp-grid">
          <span className="resume-entry-date">{dateRange}</span>
          <div className="resume-atelier-exp-body">
            <ResumeEntryTitle tags={headingTags}>
              <h3 className="resume-entry-title">{company}</h3>
            </ResumeEntryTitle>
            <ResumeEntrySubtitle duration={duration}>
              <p className="resume-entry-subtitle">{role}</p>
            </ResumeEntrySubtitle>
            {inserts}
            {bulletsBlock}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="resume-entry">
      <div className="resume-entry-header">
        <div className="resume-entry-title-block">
          <ResumeEntryTitle tags={headingTags}>
            <h3 className="resume-entry-title">{role}</h3>
          </ResumeEntryTitle>
          <ResumeEntrySubtitle duration={duration}>
            <p className="resume-entry-subtitle">{companyLine}</p>
          </ResumeEntrySubtitle>
        </div>
        {dateRange ? <span className="resume-entry-date">{dateRange}</span> : null}
      </div>
      {inserts}
      {bulletsBlock}
    </div>
  );
}

function ExperienceSection({
  experiences,
  totalExperience,
  totalExperienceVisible,
  totalExperienceShowYears,
  totalExperienceShowMonths,
  variant = 'default',
  highlights,
  subHeadings,
}: {
  experiences: PublicProfile['workExperiences'];
  totalExperience?: string | null;
  totalExperienceVisible?: boolean | null;
  totalExperienceShowYears?: boolean | null;
  totalExperienceShowMonths?: boolean | null;
  variant?: 'default' | 'atelier';
  highlights?: ResumeGlance | null;
  subHeadings?: unknown;
}) {
  const redline = useContext(RedlineContext);
  if (!experiences || experiences.length === 0) return null;

  const tag = displayTotalExperience(totalExperience, experiences, totalExperienceVisible, {
    showYears: totalExperienceShowYears,
    showMonths: totalExperienceShowMonths,
  });
  const byEntry = highlightsByEntry(experiences, highlights);

  return (
    <section className="resume-section">
      <SectionDivider title={variant === 'atelier' ? 'WORK EXPERIENCE' : 'EXPERIENCE'} tag={tag} />
      <ResumeEntryGroups items={experiences} subHeadings={subHeadings}>
        {(exp) => (
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
            headingTags={resolveExperienceHeadingTags(exp)}
            duration={displayEntryDurationFrom(exp)}
            variant={variant}
            highlight={byEntry.get(exp.id)}
            redline={redline?.roles.get(exp.id)}
          />
        )}
      </ResumeEntryGroups>
    </section>
  );
}

// ============================================================================
// EDUCATION SECTION
// ============================================================================

function EducationSection({
  educations,
  variant = 'default',
  subHeadings,
}: {
  educations: PublicProfile['educations'];
  variant?: 'default' | 'atelier';
  subHeadings?: unknown;
}) {
  if (!educations || educations.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="EDUCATION" />
      <ResumeEntryGroups items={educations} subHeadings={subHeadings}>
        {(edu) => {
          const degreeLine = [edu.degree, edu.fieldOfStudy].filter(Boolean).join(' in ');
          const dateRange =
            variant === 'atelier'
              ? formatAtelierYearRange(edu.startDate, edu.endDate, edu.isCurrent)
              : formatDateRange(edu.startDate, edu.endDate, edu.isCurrent);

          const body = <ResumeEntryBody html={edu.description} />;
          const details =
            edu.gpa || edu.activities ? (
              <div className="resume-entry-details">
                {edu.gpa && <p>GPA: {edu.gpa}</p>}
                {edu.activities && <p>{edu.activities}</p>}
              </div>
            ) : null;

          const headingTags = parseHeadingTags(edu.headingTags);
          const duration = displayEntryDurationFrom(edu);
          const subtitle = degreeLine ? (
            <p className="resume-entry-subtitle">{edu.institution}</p>
          ) : null;

          if (variant === 'atelier') {
            return (
              <div key={edu.id} className="resume-entry resume-atelier-edu">
                <ResumeEntryTitle tags={headingTags}>
                  <h3 className="resume-entry-title">{degreeLine || edu.institution}</h3>
                </ResumeEntryTitle>
                <ResumeEntrySubtitle duration={duration}>{subtitle}</ResumeEntrySubtitle>
                {(dateRange || edu.location) && (
                  <p className="resume-atelier-edu-meta">
                    {[dateRange, edu.location].filter(Boolean).join(' · ')}
                  </p>
                )}
                {body}
                {details}
              </div>
            );
          }

          return (
            <div key={edu.id} className="resume-entry">
              <div className="resume-entry-header">
                <div className="resume-entry-title-block">
                  <ResumeEntryTitle tags={headingTags}>
                    <h3 className="resume-entry-title">{degreeLine || edu.institution}</h3>
                  </ResumeEntryTitle>
                  <ResumeEntrySubtitle duration={duration}>{subtitle}</ResumeEntrySubtitle>
                </div>
                {dateRange ? <span className="resume-entry-date">{dateRange}</span> : null}
              </div>
              {body}
              {details}
            </div>
          );
        }}
      </ResumeEntryGroups>
    </section>
  );
}

// ============================================================================
// SKILLS SECTION
// ============================================================================

function SkillsSection({
  profile,
  stacked = false,
}: {
  profile: PublicProfile;
  /** Atelier: one skill per line when categories are absent and content is plain. */
  stacked?: boolean;
}) {
  const { skills, skillGroups } = profile;
  const visibleGroups = (skillGroups ?? []).filter(
    (group) => group.skills.length > 0 || !isHtmlEmpty(group.skillsHtml)
  );
  const groupNames = visibleGroups.map((group) => group.name);
  const hasCategoryLabels = skillGroupsHaveCategoryLabels(visibleGroups);
  const hasRichHtml = visibleGroups.some(
    (group) => group.skillsHtml && !isHtmlEmpty(group.skillsHtml)
  );

  // Rich HTML (and/or category labels): render each group with optional bold label.
  if (visibleGroups.length > 0 && (hasCategoryLabels || hasRichHtml)) {
    return (
      <section className="resume-section">
        <SectionDivider title="SKILLS" />
        <div className="resume-skills-grouped">
          {visibleGroups.map((group) => {
            const label = resolveSkillCategoryLabel(group.name, groupNames);
            const html =
              group.skillsHtml && !isHtmlEmpty(group.skillsHtml) ? group.skillsHtml : null;
            const items = group.skills.map((s) => s.name).join(', ');

            return (
              <div key={group.id} className="resume-skill-group">
                {label ? <span className="resume-skill-group-name">{label}: </span> : null}
                {html ? (
                  <div
                    className="resume-skill-group-items resume-rich-html resume-skill-group-rich"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }}
                  />
                ) : (
                  <span className="resume-skill-group-items">{items}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const flatNames =
    visibleGroups.length > 0
      ? visibleGroups.flatMap((group) => group.skills.map((s) => s.name))
      : (skills ?? []).map((s) => s.name);

  if (flatNames.length === 0) return null;

  if (stacked) {
    return (
      <section className="resume-section">
        <SectionDivider title="SKILLS" />
        <ul className="resume-skills-stack">
          {flatNames.map((name) => (
            <li key={name} className="resume-skills-stack-item">
              {name}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="resume-section">
      <SectionDivider title="SKILLS" />
      <p className="resume-skills-flat">{flatNames.join(', ')}</p>
    </section>
  );
}

// ============================================================================
// PROJECTS SECTION
// ============================================================================

function ProjectsSection({
  projects,
  subHeadings,
}: {
  projects: PublicProfile['projects'];
  subHeadings?: unknown;
}) {
  if (!projects || projects.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="PROJECTS" />
      <ResumeEntryGroups items={projects} subHeadings={subHeadings}>
        {(project) => {
          const dateRange = formatDateRange(project.startDate, project.endDate, project.isCurrent);
          const description = project.customDescription || project.shortDesc || project.description;

          return (
            <div key={project.id} className="resume-entry">
              <div className="resume-entry-header">
                <div className="resume-entry-title-block">
                  <ResumeEntryTitle tags={parseHeadingTags(project.headingTags)}>
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
                  </ResumeEntryTitle>
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
                  {project.highlights.map((highlight, index) => (
                    <li
                      key={index}
                      dangerouslySetInnerHTML={{ __html: resumeBulletInnerHtml(highlight) }}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        }}
      </ResumeEntryGroups>
    </section>
  );
}

// ============================================================================
// CERTIFICATIONS SECTION
// ============================================================================

function CertificationsSection({
  certifications,
  subHeadings,
}: {
  certifications: PublicProfile['certifications'];
  subHeadings?: unknown;
}) {
  if (!certifications || certifications.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="CERTIFICATIONS" />
      <ResumeEntryGroups items={certifications} subHeadings={subHeadings} compact>
        {(cert) => {
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
        }}
      </ResumeEntryGroups>
    </section>
  );
}

// ============================================================================
// AWARDS SECTION
// ============================================================================

function AwardsSection({
  awards,
  title = 'AWARDS & RECOGNITION',
  subHeadings,
}: {
  awards: PublicProfile['awards'];
  title?: string;
  subHeadings?: unknown;
}) {
  if (!awards || awards.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title={title} />
      <ResumeEntryGroups items={awards} subHeadings={subHeadings} compact>
        {(award) => {
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
        }}
      </ResumeEntryGroups>
    </section>
  );
}

// ============================================================================
// PUBLICATIONS SECTION
// ============================================================================

function PublicationsSection({
  items,
  subHeadings,
}: {
  items: PublicationItem[];
  subHeadings?: unknown;
}) {
  if (!items || items.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="PUBLICATIONS" />
      <ResumeEntryGroups items={items} subHeadings={subHeadings} compact>
        {(pub) => (
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
        )}
      </ResumeEntryGroups>
    </section>
  );
}

// ============================================================================
// VOLUNTEERING SECTION
// ============================================================================

function VolunteeringSection({
  items,
  subHeadings,
}: {
  items: VolunteeringItem[];
  subHeadings?: unknown;
}) {
  if (!items || items.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="VOLUNTEERING" />
      <ResumeEntryGroups items={items} subHeadings={subHeadings}>
        {(vol) => {
          const dateRange =
            vol.startDate || vol.endDate || vol.isCurrent
              ? `${vol.startDate || ''} – ${vol.isCurrent ? 'Present' : vol.endDate || ''}`
              : '';

          return (
            <div key={vol.id} className="resume-entry">
              <div className="resume-entry-header">
                <div className="resume-entry-title-block">
                  <ResumeEntryTitle tags={parseHeadingTags(vol.tags)}>
                    <h3 className="resume-entry-title">{vol.role}</h3>
                  </ResumeEntryTitle>
                  <p className="resume-entry-subtitle">{vol.organization}</p>
                </div>
                {dateRange && <span className="resume-entry-date">{dateRange}</span>}
              </div>
              {vol.description && <p className="resume-entry-description">{vol.description}</p>}
            </div>
          );
        }}
      </ResumeEntryGroups>
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
// REFERENCES SECTION
// ============================================================================

function ReferencesSection({ items }: { items: ReferenceItem[] }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="resume-section">
      <SectionDivider title="REFERENCES" />
      <div className="resume-entries resume-entries-compact">
        {items.map((ref) => {
          const roleLine = [ref.title, ref.company].filter(Boolean).join(', ');
          const contactLine = [ref.email, ref.phone].filter(Boolean).join(' · ');

          return (
            <div key={ref.id} className="resume-reference">
              <p className="resume-reference-name">{ref.name}</p>
              {roleLine && <p className="resume-reference-role">{roleLine}</p>}
              {ref.relationship && (
                <p className="resume-reference-relationship">{ref.relationship}</p>
              )}
              {contactLine && <p className="resume-reference-contact">{contactLine}</p>}
            </div>
          );
        })}
      </div>
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
        <ResumeEntryGroups items={items} subHeadings={section.subHeadings}>
          {(item: CustomSectionItem) => {
            const dateRange =
              item.startDate || item.endDate || item.isCurrent
                ? `${item.startDate || ''} – ${item.isCurrent ? 'Present' : item.endDate || ''}`
                : '';

            return (
              <div key={item.id} className="resume-entry">
                <div className="resume-entry-header">
                  <div className="resume-entry-title-block">
                    <ResumeEntryTitle tags={parseHeadingTags(item.tags)}>
                      <h3 className="resume-entry-title">{item.title}</h3>
                    </ResumeEntryTitle>
                    {item.subtitle && <p className="resume-entry-subtitle">{item.subtitle}</p>}
                  </div>
                  {dateRange && <span className="resume-entry-date">{dateRange}</span>}
                </div>
                {item.description && <p className="resume-entry-description">{item.description}</p>}
              </div>
            );
          }}
        </ResumeEntryGroups>
      )}

      {freeformContent && <p className="resume-freeform">{freeformContent}</p>}
    </section>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CleanResumeView({
  profile: rawProfile,
  authState,
  viewHighlightsHref,
  onViewHighlights,
  highlightsOpen = false,
  highlights = null,
  redline = null,
}: CleanResumeViewProps) {
  const resumeRef = useRef<HTMLDivElement>(null);

  const parsedDesign = useMemo(
    () => parseResumeDesign(rawProfile.resumeDesign) as ResumeDesign | null,
    [rawProfile.resumeDesign]
  );

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

  const resolvedColorTheme = useResolvedResumeColorTheme(parsedDesign?.colorTheme);
  const pageLayout = resolveResumePageLayout(parsedDesign);

  // ── Sections ordered by user-configured sortOrder ─────────────────────
  // Header sections (BASIC_INFO, LINKS) are always rendered as
  // the header block; body sections follow in their sortOrder.
  const bodySections = (profile.sections || [])
    .filter((s: ProfileSection) => !HEADER_SECTION_TYPES.includes(s.type))
    .sort((a: ProfileSection, b: ProfileSection) => a.sortOrder - b.sortOrder);

  const templateId = getResumeTemplateId(parsedDesign?.templateId);
  const isSleek = templateId === 'sleek';
  const isStudio = templateId === 'studio';
  const isAtelier = templateId === 'atelier';
  const isLumen = templateId === 'lumen';
  const sidebarSections = isAtelier
    ? bodySections.filter((s) => isResumeAtelierRailSectionType(s.type))
    : [];
  const mainSections = isAtelier
    ? bodySections.filter((s) => !isResumeAtelierRailSectionType(s.type))
    : bodySections;

  // ── Helper to extract custom-content items from a section ─────────────
  const getCustomContentItems = <T,>(section: ProfileSection): T[] => {
    const content = section.customContent as unknown as { items?: T[] } | null;
    return content?.items || [];
  };

  // ── Render a body section by its type ─────────────────────────────────
  const renderSection = (section: ProfileSection) => {
    switch (section.type) {
      case 'SUMMARY':
        return (profile.summary && !isHtmlEmpty(profile.summary)) || redline?.summary ? (
          <SummarySection
            key={section.id}
            summary={profile.summary ?? ''}
            title={isAtelier ? 'PROFILE' : 'SUMMARY'}
          />
        ) : null;
      case 'EXPERIENCE':
        return (
          <ExperienceSection
            key={section.id}
            experiences={profile.workExperiences}
            totalExperience={profile.totalExperience}
            totalExperienceVisible={profile.totalExperienceVisible}
            totalExperienceShowYears={profile.totalExperienceShowYears}
            totalExperienceShowMonths={profile.totalExperienceShowMonths}
            variant={isAtelier ? 'atelier' : 'default'}
            highlights={highlights}
            subHeadings={section.subHeadings}
          />
        );
      case 'EDUCATION':
        return (
          <EducationSection
            key={section.id}
            educations={profile.educations}
            variant={isAtelier ? 'atelier' : 'default'}
            subHeadings={section.subHeadings}
          />
        );
      case 'SKILLS':
        return <SkillsSection key={section.id} profile={profile} stacked={isAtelier} />;
      case 'PROJECTS':
        return (
          <ProjectsSection
            key={section.id}
            projects={profile.projects}
            subHeadings={section.subHeadings}
          />
        );
      case 'CERTIFICATIONS':
        return (
          <CertificationsSection
            key={section.id}
            certifications={profile.certifications}
            subHeadings={section.subHeadings}
          />
        );
      case 'AWARDS':
        return (
          <AwardsSection
            key={section.id}
            awards={profile.awards}
            title={isAtelier ? 'AWARDS' : 'AWARDS & RECOGNITION'}
            subHeadings={section.subHeadings}
          />
        );
      case 'PUBLICATIONS':
        return (
          <PublicationsSection
            key={section.id}
            items={getCustomContentItems<PublicationItem>(section)}
            subHeadings={section.subHeadings}
          />
        );
      case 'VOLUNTEERING':
        return (
          <VolunteeringSection
            key={section.id}
            items={getCustomContentItems<VolunteeringItem>(section)}
            subHeadings={section.subHeadings}
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
      case 'REFERENCES':
        return (
          <ReferencesSection
            key={section.id}
            items={getCustomContentItems<ReferenceItem>(section)}
          />
        );
      case 'CUSTOM':
        return <CustomSection key={section.id} section={section} />;
      default:
        return null;
    }
  };

  // ── Fonts for Google Font loader ──────────────────────────
  const activeFonts = useMemo(() => {
    const fonts = resolveResumeFonts(parseResumeDesign(rawProfile.resumeDesign));
    return [fonts.body, fonts.name, fonts.title, fonts.heading, fonts.contact];
  }, [rawProfile.resumeDesign]);

  // Anchor element for the kebab menu — sits at the resume's top-right.
  // Stored in state (rather than a plain ref) so `<PublicResumeActions>`
  // re-renders once the DOM node is available and can portal the kebab
  // into it.
  const [kebabAnchor, setKebabAnchor] = useState<HTMLDivElement | null>(null);

  return (
    <>
      <ResumeFontLoader fonts={activeFonts} />
      {authState ? (
        <PublicResumeActions
          resumeRef={resumeRef}
          profileId={rawProfile.id}
          handle={rawProfile.handle}
          firstName={rawProfile.firstName ?? null}
          resumeTitle={rawProfile.resumeTitle || 'Untitled Resume'}
          resumeVisibility={rawProfile.resumeVisibility ?? 'PRIVATE'}
          resumePageLayout={pageLayout}
          authState={authState}
          kebabContainer={kebabAnchor}
        />
      ) : null}

      <div
        className="resume-paper-wrapper group/resume relative"
        data-resume-theme={resolvedColorTheme}
        data-page-layout={pageLayout}
      >
        {viewHighlightsHref || onViewHighlights ? (
          <div className="pointer-events-none sticky top-6 z-30 h-0 w-full print:hidden">
            <div className="absolute right-6 top-6">
              <ViewHighlightsButton
                href={onViewHighlights ? undefined : viewHighlightsHref}
                onClick={onViewHighlights}
                label={highlightsOpen ? 'View resume' : 'View Highlights'}
                icon={highlightsOpen ? <FileText className="h-[18px] w-[18px]" /> : undefined}
              />
            </div>
          </div>
        ) : null}

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

        <RedlineContext.Provider value={redline}>
          <ResumePagedStack
            enabled={isPagedPageLayout(pageLayout)}
            pageLayout={pageLayout === 'a4' ? 'a4' : 'letter'}
            contentRef={resumeRef}
          >
            <article
              className={[
                'resume-paper',
                isSleek && 'resume-paper--sleek',
                isStudio && 'resume-paper--studio',
                isAtelier && 'resume-paper--atelier',
                isLumen && 'resume-paper--lumen',
              ]
                .filter(Boolean)
                .join(' ')}
              data-resume-template={templateId}
              style={designStyles}
            >
              {isAtelier ? (
                <>
                  <AtelierHeader profile={profile} />
                  <div className="resume-atelier-layout">
                    <div className="resume-atelier-main">{mainSections.map(renderSection)}</div>
                    <aside className="resume-atelier-rail">
                      {sidebarSections.map(renderSection)}
                    </aside>
                  </div>
                </>
              ) : isStudio ? (
                <>
                  <StudioHeader profile={profile} />
                  <div className="resume-studio-body">{mainSections.map(renderSection)}</div>
                </>
              ) : (
                <>
                  {isSleek ? <SleekHeader profile={profile} /> : <ResumeHeader profile={profile} />}
                  {mainSections.map(renderSection)}
                </>
              )}
            </article>
          </ResumePagedStack>
        </RedlineContext.Provider>
      </div>
    </>
  );
}
