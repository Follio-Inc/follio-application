'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowUpRight, ChevronDown, Eye, EyeOff, GripVertical } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PortfolioRichTextEditor } from '@/components/portfolio/portfolio-rich-text-editor';
import { isUploadedPhotoUrl } from '@/lib/portfolio/templates/media';
import { isPortfolioTextEmpty } from '@/lib/portfolio/rich-html';
import {
  ABOUT_STYLES,
  SKILLS_STYLES,
  WORK_STYLES,
} from '@/lib/portfolio/templates/minimal-studio/section-styles';
import {
  resolveAboutStyle,
  resolveEffectiveAvatar,
  resolveEffectiveProjectImage,
  resolvePortraitStyle,
  resolveSkillsStyle,
  resolveWorkStyle,
} from '@/lib/portfolio/templates/overrides';
import { cn } from '@/lib/utils';

import { ImageRow } from './image-row';
import {
  AboutStyleThumbnail,
  LayoutStylePicker,
  SkillsStyleThumbnail,
  WorkStyleThumbnail,
} from './layout-style-picker';
import { PortraitStylePicker } from './portrait-style-picker';
import { SECTION_LABELS, STRUCTURAL_SECTION_TYPES, type EditorTemplateInfo } from './types';

import type {
  AboutStyle,
  PortraitStyle,
  SkillsStyle,
  TemplateCopy,
  TemplatePortfolio,
  TemplatePortfolioOverrides,
  TemplateProfileData,
  TemplateSectionConfig,
  TemplateSectionType,
  WorkStyle,
} from '@/lib/portfolio/templates/types';

const ENTRY_SINGULAR: Partial<Record<TemplateSectionType, string>> = {
  experience: 'experience',
  projects: 'project',
  education: 'education',
  certifications: 'certification',
  awards: 'award',
};

/**
 * Shared field names for the section text stack. Every content section uses the
 * same vocabulary so multi-level copy feels consistent across the editor:
 *
 *   Label   → small line above the heading
 *   Heading → main title
 *   Subtext → supporting paragraph under the heading
 *
 * Optional extras keep their own names (Quote, Button) when they are not part
 * of that three-level stack.
 */
const FIELD_HINTS = {
  label: 'Small line above the heading.',
  heading: 'Main title for this section.',
  subtext: 'Supporting text — Body, Heading, or Quote styles, plus alignment.',
} as const;

type EditingEntry = {
  sectionType: TemplateSectionType;
  entryId: string;
};

type EntryInfo = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
};

interface PortfolioContentEditorProps {
  draft: TemplatePortfolio;
  content: TemplateProfileData;
  template: EditorTemplateInfo;
  emptyByType: Partial<Record<string, boolean>>;
  /** When set, expand and scroll to this section (from preview click). */
  focusSectionId?: string | null;
  onFocusSectionHandled?: () => void;
  /** Scroll the live preview to this section (editor-driven navigation only). */
  onScrollPreviewToSection?: (sectionId: string) => void;
  onSections: (sections: TemplateSectionConfig[]) => void;
  onCopy: (patch: Partial<TemplateCopy>) => void;
  onOverrides: (next: TemplatePortfolioOverrides) => void;
  onContent: (next: TemplateProfileData) => void;
}

function formatDateRange(start?: string | null, end?: string | null, isCurrent?: boolean): string {
  const fmt = (d: string) => {
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  if (!start) return '';
  const startStr = fmt(start);
  if (!startStr) return '';
  if (isCurrent) return `${startStr} – Present`;
  if (end) {
    const endStr = fmt(end);
    return endStr ? `${startStr} – ${endStr}` : startStr;
  }
  return startStr;
}

function getSectionEntryCount(
  type: TemplateSectionType,
  content: TemplateProfileData
): number | null {
  switch (type) {
    case 'experience':
      return content.workExperiences.filter((e) => e.isVisible).length;
    case 'projects':
      return content.projects.filter((p) => p.isVisible && p.showOnPortfolio).length;
    case 'skills':
      return content.skills.filter((s) => s.isVisible).length;
    case 'education':
      return content.educations.filter((e) => e.isVisible).length;
    case 'certifications':
      return content.certifications.filter((c) => c.isVisible).length;
    case 'awards':
      return content.awards.filter((a) => a.isVisible).length;
    default:
      return null;
  }
}

export function PortfolioContentEditor({
  draft,
  content,
  template,
  emptyByType,
  focusSectionId,
  onFocusSectionHandled,
  onScrollPreviewToSection,
  onSections,
  onCopy,
  onOverrides,
  onContent,
}: PortfolioContentEditorProps) {
  const structuralFirst = draft.sections.filter((s) => s.type === 'navigation');
  const structuralLast = draft.sections.filter((s) => s.type === 'footer');
  /** Sections this template can render — hide orphans (e.g. blog on Developer). */
  const contentSections = draft.sections.filter(
    (s) => !STRUCTURAL_SECTION_TYPES.includes(s.type) && template.supportedSections.includes(s.type)
  );

  // Start collapsed — expand only when the user opens a section or preview focuses one.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<EditingEntry | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const rebuild = useCallback(
    (nextContent: TemplateSectionConfig[]) => {
      // Preserve unsupported sections so switching templates can restore them.
      const unsupported = draft.sections.filter(
        (s) =>
          !STRUCTURAL_SECTION_TYPES.includes(s.type) && !template.supportedSections.includes(s.type)
      );
      const merged = [...structuralFirst, ...nextContent, ...unsupported, ...structuralLast];
      onSections(merged.map((s, index) => ({ ...s, order: index })));
    },
    [onSections, structuralFirst, structuralLast, draft.sections, template.supportedSections]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = contentSections.findIndex((s) => s.id === active.id);
    const newIndex = contentSections.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    rebuild(arrayMove(contentSections, oldIndex, newIndex));
  };

  const toggleVisibility = (id: string, enabled: boolean) => {
    rebuild(contentSections.map((s) => (s.id === id ? { ...s, enabled } : s)));
  };

  const jumpToSection = useCallback(
    (id: string, options?: { scrollPreview?: boolean }) => {
      setEditingEntry(null);
      setExpandedId(id);
      requestAnimationFrame(() => {
        document.getElementById(`portfolio-section-${id}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
      if (options?.scrollPreview !== false) {
        onScrollPreviewToSection?.(id);
      }
    },
    [onScrollPreviewToSection]
  );

  useEffect(() => {
    if (!focusSectionId) return;

    // Preview already shows this section — only sync the left editor.
    jumpToSection(focusSectionId, { scrollPreview: false });
    setHighlightId(focusSectionId);
    onFocusSectionHandled?.();

    const timer = window.setTimeout(() => setHighlightId(null), 2200);
    return () => window.clearTimeout(timer);
  }, [focusSectionId, jumpToSection, onFocusSectionHandled]);

  const ov: TemplatePortfolioOverrides = draft.overrides ?? {};
  const isMinimalStudio = draft.templateId === 'minimal-studio';

  const patchOverrides = (patch: Partial<TemplatePortfolioOverrides>) => {
    onOverrides({ ...ov, ...patch });
  };

  const setAvatar = (value: string | null | undefined) => {
    const next: TemplatePortfolioOverrides = { ...ov };
    if (value === undefined) delete next.avatarUrl;
    else next.avatarUrl = value;
    onOverrides(next);
  };

  const setProjectImage = (projectId: string, value: string | null | undefined) => {
    const projectImages = { ...(ov.projectImages ?? {}) };
    if (value === undefined) delete projectImages[projectId];
    else projectImages[projectId] = value;
    onOverrides({ ...ov, projectImages });
  };

  const headings = draft.copy.sectionHeadings ?? {};

  const setHeading = (type: TemplateSectionType, field: 'eyebrow' | 'title', value: string) => {
    const current = headings[type] ?? {};
    onCopy({ sectionHeadings: { ...headings, [type]: { ...current, [field]: value } } });
  };

  const renderHeadingFields = (type: TemplateSectionType, options?: { titleField?: boolean }) => {
    const defaults = template.defaultHeadings[type];
    if (!defaults) return null;
    const current = headings[type] ?? {};
    const showEyebrow = Boolean(defaults.eyebrow);
    const showTitle = (options?.titleField ?? true) && Boolean(defaults.title);
    if (!showEyebrow && !showTitle) return null;
    return (
      <>
        {showEyebrow && (
          <Field label="Label" hint={FIELD_HINTS.label}>
            <Input
              value={current.eyebrow ?? ''}
              onChange={(e) => setHeading(type, 'eyebrow', e.target.value)}
              placeholder={defaults.eyebrow}
            />
          </Field>
        )}
        {showTitle && (
          <Field label="Heading" hint={FIELD_HINTS.heading}>
            <Input
              value={current.title ?? ''}
              onChange={(e) => setHeading(type, 'title', e.target.value)}
              placeholder={defaults.title}
            />
          </Field>
        )}
      </>
    );
  };

  const renderSectionSubtext = (
    value: string,
    onChange: (value: string) => void,
    placeholder: string
  ) => (
    <Field label="Subtext" hint={FIELD_HINTS.subtext}>
      <PortfolioRichTextEditor
        value={value}
        onChange={(html) => onChange(isPortfolioTextEmpty(html) ? '' : html)}
        placeholder={placeholder}
        minHeight="100px"
      />
    </Field>
  );

  const setSectionIntro = (type: TemplateSectionType, value: string) => {
    onCopy({
      sectionIntros: {
        ...(draft.copy.sectionIntros ?? {}),
        [type]: value,
      },
    });
  };

  const clearProjectNarrative = (title: string) => {
    const narratives = draft.copy.projectNarratives;
    if (!narratives || !(title in narratives)) return;
    const next = { ...narratives };
    delete next[title];
    onCopy({ projectNarratives: next });
  };

  const updateExperience = (
    id: string,
    patch: Partial<TemplateProfileData['workExperiences'][number]>
  ) => {
    onContent({
      ...content,
      workExperiences: content.workExperiences.map((exp) =>
        exp.id === id ? { ...exp, ...patch } : exp
      ),
    });
  };

  const updateProject = (id: string, patch: Partial<TemplateProfileData['projects'][number]>) => {
    const existing = content.projects.find((project) => project.id === id);
    if (existing && ('description' in patch || 'title' in patch)) {
      clearProjectNarrative(existing.title);
    }
    onContent({
      ...content,
      projects: content.projects.map((project) =>
        project.id === id ? { ...project, ...patch } : project
      ),
    });
  };

  const updateEducation = (
    id: string,
    patch: Partial<TemplateProfileData['educations'][number]>
  ) => {
    onContent({
      ...content,
      educations: content.educations.map((edu) => (edu.id === id ? { ...edu, ...patch } : edu)),
    });
  };

  const updateSkill = (id: string, name: string) => {
    onContent({
      ...content,
      skills: content.skills.map((skill) => (skill.id === id ? { ...skill, name } : skill)),
      skillGroups: content.skillGroups.map((group) => ({
        ...group,
        skills: group.skills.map((skill) => (skill.id === id ? { ...skill, name } : skill)),
      })),
    });
  };

  const updateCertification = (
    id: string,
    patch: Partial<TemplateProfileData['certifications'][number]>
  ) => {
    onContent({
      ...content,
      certifications: content.certifications.map((cert) =>
        cert.id === id ? { ...cert, ...patch } : cert
      ),
    });
  };

  const updateAward = (id: string, patch: Partial<TemplateProfileData['awards'][number]>) => {
    onContent({
      ...content,
      awards: content.awards.map((award) => (award.id === id ? { ...award, ...patch } : award)),
    });
  };

  const getEntries = useCallback(
    (type: TemplateSectionType): EntryInfo[] => {
      switch (type) {
        case 'experience':
          return content.workExperiences
            .filter((e) => e.isVisible)
            .map((exp) => ({
              id: exp.id,
              title: exp.role || 'Untitled role',
              subtitle: exp.company || undefined,
              meta: formatDateRange(exp.startDate, exp.endDate, exp.isCurrent) || undefined,
            }));
        case 'projects':
          return content.projects
            .filter((p) => p.isVisible && p.showOnPortfolio)
            .map((project) => ({
              id: project.id,
              title: project.title || 'Untitled project',
              subtitle: project.description || undefined,
            }));
        case 'education':
          return content.educations
            .filter((e) => e.isVisible)
            .map((edu) => ({
              id: edu.id,
              title:
                [edu.degree, edu.fieldOfStudy].filter(Boolean).join(' in ') ||
                edu.institution ||
                'Education',
              subtitle: edu.institution || undefined,
              meta: formatDateRange(edu.startDate, edu.endDate, edu.isCurrent) || undefined,
            }));
        case 'certifications':
          return content.certifications
            .filter((c) => c.isVisible)
            .map((cert) => ({
              id: cert.id,
              title: cert.name || 'Untitled certification',
              subtitle: cert.issuer || undefined,
              meta: cert.issueDate ? formatDateRange(cert.issueDate) || undefined : undefined,
            }));
        case 'awards':
          return content.awards
            .filter((a) => a.isVisible)
            .map((award) => ({
              id: award.id,
              title: award.title || 'Untitled award',
              subtitle: award.issuer || undefined,
              meta: award.date ? formatDateRange(award.date) || undefined : undefined,
            }));
        default:
          return [];
      }
    },
    [content]
  );

  const renderEntryForm = (type: TemplateSectionType, entryId: string) => {
    switch (type) {
      case 'experience': {
        const exp = content.workExperiences.find((e) => e.id === entryId);
        if (!exp) return <MissingEntryNote />;
        return (
          <div className="space-y-4">
            <Field label="Role">
              <Input
                value={exp.role}
                onChange={(e) => updateExperience(exp.id, { role: e.target.value })}
              />
            </Field>
            <Field label="Company">
              <Input
                value={exp.company}
                onChange={(e) => updateExperience(exp.id, { company: e.target.value })}
              />
            </Field>
            <Field label="Location">
              <Input
                value={exp.location ?? ''}
                onChange={(e) =>
                  updateExperience(exp.id, {
                    location: e.target.value.trim() ? e.target.value : null,
                  })
                }
                placeholder="City, Country"
              />
            </Field>
            <Field label="Summary" hint="One short highlight — use Body, Heading, or Quote styles.">
              <PortfolioRichTextEditor
                value={exp.bullets[0] ?? ''}
                onChange={(html) =>
                  updateExperience(exp.id, {
                    bullets: isPortfolioTextEmpty(html) ? [] : [html],
                  })
                }
                placeholder="What you achieved or owned in this role"
                minHeight="88px"
              />
            </Field>
          </div>
        );
      }
      case 'projects': {
        const project = content.projects.find((p) => p.id === entryId);
        if (!project) return <MissingEntryNote />;
        const keyed = Boolean(
          ov.projectImages && Object.prototype.hasOwnProperty.call(ov.projectImages, project.id)
        );
        return (
          <div className="space-y-4">
            <Field label="Title">
              <Input
                value={project.title}
                onChange={(e) => updateProject(project.id, { title: e.target.value })}
              />
            </Field>
            <Field label="Description" hint="1–2 sentences. Use Body, Heading, or Quote styles.">
              <PortfolioRichTextEditor
                value={project.description ?? ''}
                onChange={(html) =>
                  updateProject(project.id, {
                    description: isPortfolioTextEmpty(html) ? null : html,
                  })
                }
                placeholder="What this project is and why it matters"
                minHeight="100px"
              />
            </Field>
            <Field label="Image" hint="Optional — text-only cards work well too.">
              <ImageRow
                shape="square"
                imageUrl={resolveEffectiveProjectImage(
                  project.id,
                  project.imageUrl,
                  draft.overrides
                )}
                category="project"
                canReset={keyed && Boolean(project.imageUrl)}
                onUploaded={(url) => setProjectImage(project.id, url)}
                onRemove={() => setProjectImage(project.id, null)}
                onReset={() => setProjectImage(project.id, undefined)}
              />
            </Field>
          </div>
        );
      }
      case 'education': {
        const edu = content.educations.find((e) => e.id === entryId);
        if (!edu) return <MissingEntryNote />;
        return (
          <div className="space-y-4">
            <Field label="Institution">
              <Input
                value={edu.institution}
                onChange={(e) => updateEducation(edu.id, { institution: e.target.value })}
              />
            </Field>
            <Field label="Degree">
              <Input
                value={edu.degree ?? ''}
                onChange={(e) =>
                  updateEducation(edu.id, {
                    degree: e.target.value.trim() ? e.target.value : null,
                  })
                }
              />
            </Field>
            <Field label="Field of study">
              <Input
                value={edu.fieldOfStudy ?? ''}
                onChange={(e) =>
                  updateEducation(edu.id, {
                    fieldOfStudy: e.target.value.trim() ? e.target.value : null,
                  })
                }
              />
            </Field>
            <Field label="GPA">
              <Input
                value={edu.gpa ?? ''}
                onChange={(e) =>
                  updateEducation(edu.id, {
                    gpa: e.target.value.trim() ? e.target.value : null,
                  })
                }
                placeholder="Optional"
              />
            </Field>
          </div>
        );
      }
      case 'certifications': {
        const cert = content.certifications.find((c) => c.id === entryId);
        if (!cert) return <MissingEntryNote />;
        return (
          <div className="space-y-4">
            <Field label="Name">
              <Input
                value={cert.name}
                onChange={(e) => updateCertification(cert.id, { name: e.target.value })}
              />
            </Field>
            <Field label="Issuer">
              <Input
                value={cert.issuer}
                onChange={(e) => updateCertification(cert.id, { issuer: e.target.value })}
              />
            </Field>
          </div>
        );
      }
      case 'awards': {
        const award = content.awards.find((a) => a.id === entryId);
        if (!award) return <MissingEntryNote />;
        return (
          <div className="space-y-4">
            <Field label="Title">
              <Input
                value={award.title}
                onChange={(e) => updateAward(award.id, { title: e.target.value })}
              />
            </Field>
            <Field label="Issuer">
              <Input
                value={award.issuer ?? ''}
                onChange={(e) =>
                  updateAward(award.id, {
                    issuer: e.target.value.trim() ? e.target.value : null,
                  })
                }
              />
            </Field>
            <Field label="Description">
              <PortfolioRichTextEditor
                value={award.description ?? ''}
                onChange={(html) =>
                  updateAward(award.id, {
                    description: isPortfolioTextEmpty(html) ? null : html,
                  })
                }
                placeholder="What this award recognizes"
                minHeight="72px"
              />
            </Field>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const renderEntryList = (type: TemplateSectionType) => {
    const entries = getEntries(type);
    const singular = ENTRY_SINGULAR[type] ?? 'item';

    if (entries.length === 0) {
      return <BuilderEmptyState label={singular} />;
    }

    return (
      <div className="space-y-1.5">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setEditingEntry({ sectionType: type, entryId: entry.id })}
            className="group/entry flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card px-3.5 py-3 text-left transition-colors hover:border-border hover:bg-muted/40"
          >
            <span className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{entry.title}</p>
              {entry.subtitle && (
                <p className="truncate text-xs text-muted-foreground">{entry.subtitle}</p>
              )}
            </span>
            {entry.meta && (
              <span className="shrink-0 text-xs text-muted-foreground/70">{entry.meta}</span>
            )}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 -rotate-90 text-muted-foreground/40 transition-colors group-hover/entry:text-muted-foreground" />
          </button>
        ))}
        <BuilderLinkNote>
          Add or remove {singular}s in the{' '}
          <Link
            href="/builder"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            resume builder
          </Link>
          .
        </BuilderLinkNote>
      </div>
    );
  };

  const renderBody = (type: TemplateSectionType) => {
    switch (type) {
      case 'hero': {
        const effectiveAvatar = resolveEffectiveAvatar(content.avatarUrl, ov);
        const showPortraitLayout = isMinimalStudio && isUploadedPhotoUrl(effectiveAvatar);
        return (
          <div className="space-y-4">
            <Field label="Heading" hint={FIELD_HINTS.heading}>
              <Textarea
                value={draft.copy.heroHeadline}
                onChange={(e) => onCopy({ heroHeadline: e.target.value })}
                rows={2}
                placeholder="A bold one-line statement of who you are"
              />
            </Field>
            <Field label="Subtext" hint={FIELD_HINTS.subtext}>
              <PortfolioRichTextEditor
                value={draft.copy.heroSubtext}
                onChange={(html) => onCopy({ heroSubtext: isPortfolioTextEmpty(html) ? '' : html })}
                placeholder="A short supporting sentence below the heading"
                minHeight="88px"
              />
            </Field>
            <Field label="Portrait" hint="Upload a photo for this section.">
              <ImageRow
                shape="square"
                imageUrl={effectiveAvatar}
                category="avatar"
                canReset={
                  Object.prototype.hasOwnProperty.call(ov, 'avatarUrl') &&
                  Boolean(content.avatarUrl)
                }
                onUploaded={(url) => setAvatar(url)}
                onRemove={() => setAvatar(null)}
                onReset={() => setAvatar(undefined)}
              />
            </Field>
            {showPortraitLayout && (
              <Field label="Portrait layout" hint="How your photo sits with the heading.">
                <PortraitStylePicker
                  value={resolvePortraitStyle(ov)}
                  onChange={(style: PortraitStyle) => patchOverrides({ portraitStyle: style })}
                />
              </Field>
            )}
          </div>
        );
      }

      case 'about':
        return (
          <div className="space-y-4">
            {renderHeadingFields('about', { titleField: false })}
            <Field label="Heading" hint={FIELD_HINTS.heading}>
              <Input
                value={draft.copy.aboutTitle}
                onChange={(e) => onCopy({ aboutTitle: e.target.value })}
                placeholder="e.g. Hello, I'm Jordan"
              />
            </Field>
            <Field label="Subtext" hint={FIELD_HINTS.subtext}>
              <PortfolioRichTextEditor
                value={draft.copy.aboutText}
                onChange={(html) => onCopy({ aboutText: isPortfolioTextEmpty(html) ? '' : html })}
                placeholder="A couple of sentences about your work and approach"
                minHeight="140px"
              />
            </Field>
            <Field label="Quote" hint="Optional highlighted line under the subtext.">
              <PortfolioRichTextEditor
                value={draft.copy.pullQuote ?? ''}
                onChange={(html) => onCopy({ pullQuote: isPortfolioTextEmpty(html) ? null : html })}
                placeholder="A memorable line that captures your approach"
                minHeight="72px"
              />
            </Field>
            {isMinimalStudio && (
              <Field label="Layout" hint="How this section is arranged on the page.">
                <LayoutStylePicker
                  options={ABOUT_STYLES}
                  value={resolveAboutStyle(ov)}
                  onChange={(style: AboutStyle) => patchOverrides({ aboutStyle: style })}
                  renderThumbnail={(id) => <AboutStyleThumbnail id={id} />}
                />
              </Field>
            )}
          </div>
        );

      case 'contact':
        return (
          <div className="space-y-4">
            <Field label="Label" hint={FIELD_HINTS.label}>
              <Input
                value={draft.copy.contactSubtext}
                onChange={(e) => onCopy({ contactSubtext: e.target.value })}
                placeholder="e.g. Get in touch"
              />
            </Field>
            <Field label="Heading" hint={FIELD_HINTS.heading}>
              <Input
                value={draft.copy.contactTitle}
                onChange={(e) => onCopy({ contactTitle: e.target.value })}
                placeholder="e.g. Let's work together"
              />
            </Field>
            <Field label="Button" hint="Contact CTA shown in the nav and contact section.">
              <Input
                value={draft.copy.primaryCtaLabel}
                onChange={(e) => onCopy({ primaryCtaLabel: e.target.value })}
                placeholder="e.g. Get in touch"
              />
            </Field>
            <ManagedElsewhereCard
              title="Email & links"
              description="Contact details come from your resume profile."
            />
          </div>
        );

      case 'experience':
      case 'projects':
      case 'education':
      case 'certifications':
      case 'awards':
        return (
          <div className="space-y-4">
            {renderHeadingFields(type)}
            {(type === 'experience' || type === 'projects') &&
              renderSectionSubtext(
                type === 'experience'
                  ? (draft.copy.experienceNarrative ?? draft.copy.sectionIntros?.experience ?? '')
                  : (draft.copy.sectionIntros?.projects ?? ''),
                (value) => {
                  if (type === 'experience') {
                    onCopy({
                      experienceNarrative: value.trim() ? value : null,
                      sectionIntros: {
                        ...(draft.copy.sectionIntros ?? {}),
                        experience: value,
                      },
                    });
                  } else {
                    setSectionIntro('projects', value);
                  }
                },
                type === 'experience'
                  ? 'A short career arc or framing for this section'
                  : 'A short line framing your featured work'
              )}
            {type === 'projects' && isMinimalStudio && getEntries('projects').length > 0 && (
              <Field label="Layout" hint="How your projects are arranged on the page.">
                <LayoutStylePicker
                  options={WORK_STYLES}
                  value={resolveWorkStyle(ov)}
                  onChange={(style: WorkStyle) => patchOverrides({ workStyle: style })}
                  renderThumbnail={(id) => <WorkStyleThumbnail id={id} />}
                />
              </Field>
            )}
            {renderEntryList(type)}
          </div>
        );

      case 'skills': {
        const visibleSkills = content.skills.filter((s) => s.isVisible);
        const groupedSkillIds = new Set(
          content.skillGroups.flatMap((g) => g.skills.map((s) => s.id))
        );
        const ungrouped = visibleSkills.filter((s) => !groupedSkillIds.has(s.id));
        const hasSkills = visibleSkills.length > 0 || content.skillGroups.length > 0;

        return (
          <div className="space-y-4">
            {renderHeadingFields('skills')}
            {isMinimalStudio && hasSkills && (
              <Field label="Layout" hint="How your skills are arranged on the page.">
                <LayoutStylePicker
                  options={SKILLS_STYLES}
                  value={resolveSkillsStyle(ov)}
                  onChange={(style: SkillsStyle) => patchOverrides({ skillsStyle: style })}
                  renderThumbnail={(id) => <SkillsStyleThumbnail id={id} />}
                />
              </Field>
            )}
            {!hasSkills ? (
              <BuilderEmptyState label="skill" />
            ) : (
              <div className="space-y-4">
                {content.skillGroups.map((group) => (
                  <div key={group.id} className="space-y-2">
                    <p className="text-xs font-medium text-foreground/80">{group.name}</p>
                    <ul className="space-y-2">
                      {group.skills.map((skill) => (
                        <li key={skill.id}>
                          <Input
                            value={skill.name}
                            onChange={(e) => updateSkill(skill.id, e.target.value)}
                            aria-label={`Skill in ${group.name}`}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {ungrouped.length > 0 && (
                  <div className="space-y-2">
                    {content.skillGroups.length > 0 && (
                      <p className="text-xs font-medium text-foreground/80">Other</p>
                    )}
                    <ul className="space-y-2">
                      {ungrouped.map((skill) => (
                        <li key={skill.id}>
                          <Input
                            value={skill.name}
                            onChange={(e) => updateSkill(skill.id, e.target.value)}
                            aria-label="Skill"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <BuilderLinkNote>
                  Add, group, or remove skills in the{' '}
                  <Link
                    href="/builder"
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    resume builder
                  </Link>
                  .
                </BuilderLinkNote>
              </div>
            )}
          </div>
        );
      }

      case 'github':
        return (
          <div className="space-y-4">
            {renderHeadingFields('github')}
            {renderSectionSubtext(
              draft.copy.githubNarrative ?? draft.copy.sectionIntros?.github ?? '',
              (value) => {
                onCopy({
                  githubNarrative: value.trim() ? value : null,
                  sectionIntros: {
                    ...(draft.copy.sectionIntros ?? {}),
                    github: value,
                  },
                });
              },
              'What your open-source work says about you'
            )}
            <ManagedElsewhereCard
              title="Open source"
              description={
                content.github?.username
                  ? `Showing public work from @${content.github.username}.`
                  : 'Connect GitHub in the resume builder to show your open-source work.'
              }
            />
          </div>
        );

      case 'blog':
        return (
          <div className="space-y-4">
            {renderHeadingFields('blog')}
            <ManagedElsewhereCard
              title="Writing"
              description={
                content.blogPosts.filter((b) => b.isVisible).length > 0
                  ? 'Posts come from your connected writing sources.'
                  : 'Connect a writing source in the resume builder to show posts here.'
              }
            />
          </div>
        );

      default: {
        const headingFields = renderHeadingFields(type);
        return (
          <div className="space-y-4">
            {headingFields}
            <ManagedElsewhereCard
              title={SECTION_LABELS[type]}
              description="This section uses your portfolio content. Adjust visibility and order above."
            />
          </div>
        );
      }
    }
  };

  const sectionNav = useMemo(
    () =>
      contentSections.map((section) => ({
        id: section.id,
        label: SECTION_LABELS[section.type],
        enabled: section.enabled,
      })),
    [contentSections]
  );

  // Focused entry edit — full panel like resume builder
  if (editingEntry) {
    const title = SECTION_LABELS[editingEntry.sectionType];
    return (
      <div className="space-y-5 px-5 py-5">
        <button
          type="button"
          onClick={() => setEditingEntry(null)}
          className="-ml-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span>Back to {title}</span>
        </button>
        <div>
          <p className="mb-4 text-xs text-muted-foreground">
            Editing {ENTRY_SINGULAR[editingEntry.sectionType] ?? 'item'} — changes save
            automatically.
          </p>
          {renderEntryForm(editingEntry.sectionType, editingEntry.entryId)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 py-5">
      {sectionNav.length > 3 && (
        <nav
          aria-label="Jump to section"
          className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto pb-1"
        >
          {sectionNav.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => jumpToSection(section.id)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                expandedId === section.id
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground',
                !section.enabled && 'opacity-50'
              )}
            >
              {section.label}
            </button>
          ))}
        </nav>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={contentSections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3 pl-5">
            {contentSections.map((section) => (
              <SortableSectionCard
                key={section.id}
                section={section}
                title={SECTION_LABELS[section.type]}
                entryCount={getSectionEntryCount(section.type, content)}
                isEmpty={Boolean(emptyByType[section.type])}
                isExpanded={expandedId === section.id}
                isHighlighted={highlightId === section.id}
                onToggleExpand={() => {
                  const nextId = expandedId === section.id ? null : section.id;
                  setExpandedId(nextId);
                  if (nextId) {
                    onScrollPreviewToSection?.(nextId);
                  }
                }}
                onToggleVisibility={(enabled) => toggleVisibility(section.id, enabled)}
              >
                {renderBody(section.type)}
              </SortableSectionCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface SortableSectionCardProps {
  section: TemplateSectionConfig;
  title: string;
  entryCount: number | null;
  isEmpty: boolean;
  isExpanded: boolean;
  isHighlighted?: boolean;
  onToggleExpand: () => void;
  onToggleVisibility: (enabled: boolean) => void;
  children: React.ReactNode;
}

function SortableSectionCard({
  section,
  title,
  entryCount,
  isEmpty,
  isExpanded,
  isHighlighted,
  onToggleExpand,
  onToggleVisibility,
  children,
}: SortableSectionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`portfolio-section-${section.id}`}
      className={cn(
        'group/section relative scroll-mt-14',
        isDragging && 'z-10 opacity-90 shadow-lg'
      )}
    >
      {/* Grip outside the card — matches resume builder */}
      <button
        type="button"
        className={cn(
          'absolute -left-1 top-3.5 -translate-x-full',
          'flex h-8 w-6 cursor-grab items-center justify-center rounded-md',
          'text-muted-foreground/40 opacity-0 transition-opacity',
          'hover:text-muted-foreground focus-visible:opacity-100 group-hover/section:opacity-100',
          isDragging && 'cursor-grabbing opacity-100'
        )}
        aria-label={`Reorder ${title}`}
        title="Drag to reorder section"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div
        className={cn(
          'overflow-hidden rounded-lg border transition-colors duration-150',
          isExpanded
            ? 'border-border bg-card ring-1 ring-primary/15'
            : 'border-border/60 bg-card hover:border-border',
          isHighlighted && 'ring-2 ring-primary/50',
          !section.enabled && 'opacity-50'
        )}
      >
        <div className="flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-2">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex min-w-0 flex-1 items-center gap-2.5 px-1 py-1.5 text-left"
          >
            <span
              className={cn(
                'truncate text-sm font-medium transition-colors duration-150',
                isExpanded ? 'text-foreground' : 'text-foreground/90'
              )}
            >
              {title}
            </span>
            {entryCount !== null && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums',
                  entryCount === 0 ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
                )}
              >
                {entryCount}
              </span>
            )}
            {isEmpty && entryCount === null && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Empty
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onToggleVisibility(!section.enabled)}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              'opacity-0 focus-visible:opacity-100 group-hover/section:opacity-100',
              section.enabled
                ? 'text-muted-foreground/40 hover:text-muted-foreground'
                : 'text-muted-foreground opacity-100'
            )}
            aria-label={section.enabled ? `Hide ${title}` : `Show ${title}`}
            title={section.enabled ? 'Hide section' : 'Show section'}
          >
            {section.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onToggleExpand}
            className="rounded-md p-1.5 text-muted-foreground/50 hover:text-muted-foreground"
            aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
          >
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform duration-200',
                isExpanded && '-rotate-180 text-primary'
              )}
            />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="border-t border-border/60 bg-muted/30 px-4 pb-5 pt-4">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-foreground/80">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function BuilderEmptyState({ label }: { label: string }) {
  return (
    <Link
      href="/builder"
      className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-8 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
    >
      <span>No {label} in this portfolio yet</span>
      <span className="inline-flex items-center gap-1 text-xs font-medium">
        Add in resume builder
        <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

function BuilderLinkNote({ children }: { children: React.ReactNode }) {
  return <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">{children}</p>;
}

function ManagedElsewhereCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/80 px-3.5 py-3">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      <Link
        href="/builder"
        className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-2 hover:underline"
      >
        Open resume builder
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function MissingEntryNote() {
  return (
    <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
      This item is no longer available.
    </p>
  );
}
