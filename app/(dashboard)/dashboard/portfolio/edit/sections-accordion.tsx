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
import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Github,
  GraduationCap,
  GripVertical,
  Mail,
  Palette,
  PenLine,
  Search,
  Sparkles,
  User,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  resolveAboutStyle,
  resolveEffectiveAvatar,
  resolveEffectiveProjectImage,
  resolvePortraitStyle,
  resolveSkillsStyle,
  resolveWorkStyle,
} from '@/lib/portfolio/templates/overrides';
import { isUploadedPhotoUrl } from '@/lib/portfolio/templates/media';
import {
  ABOUT_STYLES,
  SKILLS_STYLES,
  WORK_STYLES,
} from '@/lib/portfolio/templates/minimal-studio/section-styles';
import { cn } from '@/lib/utils';

import { ImageRow } from './image-row';
import {
  AboutStyleThumbnail,
  LayoutStylePicker,
  SkillsStyleThumbnail,
  WorkStyleThumbnail,
} from './layout-style-picker';
import { PortraitStylePicker } from './portrait-style-picker';
import { StylePanel } from './style-panel';
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
  TemplateStyleConfig,
  WorkStyle,
} from '@/lib/portfolio/templates/types';

const SECTION_ICONS: Record<TemplateSectionType, LucideIcon> = {
  navigation: Sparkles,
  hero: Sparkles,
  about: User,
  experience: Building2,
  projects: Briefcase,
  skills: Wrench,
  education: GraduationCap,
  certifications: BadgeCheck,
  awards: Award,
  github: Github,
  blog: PenLine,
  contact: Mail,
  footer: Sparkles,
};

interface SectionsAccordionProps {
  draft: TemplatePortfolio;
  profile: TemplateProfileData;
  template: EditorTemplateInfo;
  emptyByType: Partial<Record<string, boolean>>;
  onSections: (sections: TemplateSectionConfig[]) => void;
  onCopy: (patch: Partial<TemplateCopy>) => void;
  onStyle: (patch: Partial<TemplateStyleConfig>) => void;
  onOverrides: (next: TemplatePortfolioOverrides) => void;
}

export function SectionsAccordion({
  draft,
  profile,
  template,
  emptyByType,
  onSections,
  onCopy,
  onStyle,
  onOverrides,
}: SectionsAccordionProps) {
  const structuralFirst = draft.sections.filter((s) => s.type === 'navigation');
  const structuralLast = draft.sections.filter((s) => s.type === 'footer');
  const content = draft.sections.filter((s) => !STRUCTURAL_SECTION_TYPES.includes(s.type));

  const [expandedId, setExpandedId] = useState<string | null>(content[0]?.id ?? 'design');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const rebuild = (nextContent: TemplateSectionConfig[]) => {
    const merged = [...structuralFirst, ...nextContent, ...structuralLast];
    onSections(merged.map((s, index) => ({ ...s, order: index })));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = content.findIndex((s) => s.id === active.id);
    const newIndex = content.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    rebuild(arrayMove(content, oldIndex, newIndex));
  };

  const toggleVisibility = (id: string, enabled: boolean) => {
    rebuild(content.map((s) => (s.id === id ? { ...s, enabled } : s)));
  };

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  // ── Override mutation helpers ──────────────────────────────────────
  const ov: TemplatePortfolioOverrides = draft.overrides ?? {};

  const setAvatar = (value: string | null | undefined) => {
    const next: TemplatePortfolioOverrides = { ...ov };
    if (value === undefined) delete next.avatarUrl;
    else next.avatarUrl = value;
    onOverrides(next);
  };

  const setPortraitStyle = (style: PortraitStyle) => {
    onOverrides({ ...ov, portraitStyle: style });
  };

  const setWorkStyle = (style: WorkStyle) => {
    onOverrides({ ...ov, workStyle: style });
  };

  const setAboutStyle = (style: AboutStyle) => {
    onOverrides({ ...ov, aboutStyle: style });
  };

  const setSkillsStyle = (style: SkillsStyle) => {
    onOverrides({ ...ov, skillsStyle: style });
  };

  const isMinimalStudio = draft.templateId === 'minimal-studio';

  const setProjectImage = (projectId: string, value: string | null | undefined) => {
    const projectImages = { ...(ov.projectImages ?? {}) };
    if (value === undefined) delete projectImages[projectId];
    else projectImages[projectId] = value;
    onOverrides({ ...ov, projectImages });
  };

  // ── Section heading helpers ────────────────────────────────────────
  const headings = draft.copy.sectionHeadings ?? {};

  const setHeading = (type: TemplateSectionType, field: 'eyebrow' | 'title', value: string) => {
    const current = headings[type] ?? {};
    onCopy({ sectionHeadings: { ...headings, [type]: { ...current, [field]: value } } });
  };

  /**
   * Editable "Label" (small eyebrow) and "Heading" (large title) for any section
   * the template provides defaults for. Blank fields fall back to those defaults,
   * shown here as placeholders. The title field is hidden for sections whose
   * heading lives in a dedicated field (e.g. About uses its own Heading below).
   */
  const renderHeadingFields = (type: TemplateSectionType, options?: { titleField?: boolean }) => {
    const defaults = template.defaultHeadings[type];
    if (!defaults) return null;
    const current = headings[type] ?? {};
    const showTitle = (options?.titleField ?? true) && Boolean(defaults.title);
    return (
      <>
        <Field label="Label" hint="The small line above the heading.">
          <Input
            value={current.eyebrow ?? ''}
            onChange={(e) => setHeading(type, 'eyebrow', e.target.value)}
            placeholder={defaults.eyebrow}
          />
        </Field>
        {showTitle && (
          <Field label="Heading">
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

  const renderBody = (type: TemplateSectionType) => {
    switch (type) {
      case 'hero': {
        const effectiveAvatar = resolveEffectiveAvatar(profile.avatarUrl, ov);
        const showPortraitLayout =
          draft.templateId === 'minimal-studio' && isUploadedPhotoUrl(effectiveAvatar);

        return (
          <div className="space-y-4">
            <Field label="Headline">
              <Textarea
                value={draft.copy.heroHeadline}
                onChange={(e) => onCopy({ heroHeadline: e.target.value })}
                rows={2}
                placeholder="A bold one-line statement of who you are"
              />
            </Field>
            <Field label="Subtext">
              <Textarea
                value={draft.copy.heroSubtext}
                onChange={(e) => onCopy({ heroSubtext: e.target.value })}
                rows={3}
                placeholder="A short supporting sentence below the headline"
              />
            </Field>
            <Field
              label="Portrait"
              hint="Upload a photo to show in your intro. Social avatars are not used."
            >
              <ImageRow
                shape="square"
                imageUrl={effectiveAvatar}
                category="avatar"
                canReset={
                  Object.prototype.hasOwnProperty.call(ov, 'avatarUrl') &&
                  Boolean(profile.avatarUrl)
                }
                onUploaded={(url) => setAvatar(url)}
                onRemove={() => setAvatar(null)}
                onReset={() => setAvatar(undefined)}
              />
            </Field>
            {showPortraitLayout && (
              <Field
                label="Portrait style"
                hint="Five editorial layouts — each changes size, shape, and placement."
              >
                <PortraitStylePicker value={resolvePortraitStyle(ov)} onChange={setPortraitStyle} />
              </Field>
            )}
          </div>
        );
      }

      case 'about':
        return (
          <div className="space-y-4">
            {renderHeadingFields('about', { titleField: false })}
            <Field label="Heading">
              <Input
                value={draft.copy.aboutTitle}
                onChange={(e) => onCopy({ aboutTitle: e.target.value })}
                placeholder="e.g. Hello, I'm Jordan"
              />
            </Field>
            <Field label="Body">
              <Textarea
                value={draft.copy.aboutText}
                onChange={(e) => onCopy({ aboutText: e.target.value })}
                rows={5}
                placeholder="A couple of sentences about your work and approach"
              />
            </Field>
            {isMinimalStudio && (
              <Field label="Layout" hint="Three coherent ways to arrange this section.">
                <LayoutStylePicker
                  options={ABOUT_STYLES}
                  value={resolveAboutStyle(ov)}
                  onChange={setAboutStyle}
                  renderThumbnail={(id) => <AboutStyleThumbnail id={id} />}
                />
              </Field>
            )}
          </div>
        );

      case 'contact':
        return (
          <div className="space-y-4">
            <Field label="Label" hint="The small line above the heading.">
              <Input
                value={draft.copy.contactSubtext}
                onChange={(e) => onCopy({ contactSubtext: e.target.value })}
                placeholder="e.g. Get in touch"
              />
            </Field>
            <Field label="Heading">
              <Input
                value={draft.copy.contactTitle}
                onChange={(e) => onCopy({ contactTitle: e.target.value })}
                placeholder="e.g. Let's work together"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Your email and social links come from your profile.
            </p>
          </div>
        );

      case 'projects': {
        const projects = profile.projects.filter((p) => p.isVisible && p.showOnPortfolio);
        if (projects.length === 0) {
          return (
            <div className="space-y-4">
              {renderHeadingFields('projects')}
              <ManagedNote label="projects" />
            </div>
          );
        }
        return (
          <div className="space-y-4">
            {renderHeadingFields('projects')}
            {isMinimalStudio && (
              <Field label="Layout" hint="Three coherent ways to arrange your projects.">
                <LayoutStylePicker
                  options={WORK_STYLES}
                  value={resolveWorkStyle(ov)}
                  onChange={setWorkStyle}
                  renderThumbnail={(id) => <WorkStyleThumbnail id={id} />}
                />
              </Field>
            )}
            <p className="text-xs text-muted-foreground">
              Add an image per project. Projects without one use a clean text-only card.
            </p>
            <ul className="space-y-3">
              {projects.map((project) => {
                const keyed = Boolean(
                  ov.projectImages &&
                  Object.prototype.hasOwnProperty.call(ov.projectImages, project.id)
                );
                return (
                  <li key={project.id} className="space-y-1.5">
                    <span className="block truncate text-xs font-medium text-foreground/80">
                      {project.title}
                    </span>
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
                  </li>
                );
              })}
            </ul>
          </div>
        );
      }

      case 'skills': {
        const hasSkills = profile.skills.some((s) => s.isVisible) || profile.skillGroups.length > 0;
        return (
          <div className="space-y-4">
            {renderHeadingFields('skills')}
            {isMinimalStudio && hasSkills && (
              <Field label="Layout" hint="Three coherent ways to arrange your skills.">
                <LayoutStylePicker
                  options={SKILLS_STYLES}
                  value={resolveSkillsStyle(ov)}
                  onChange={setSkillsStyle}
                  renderThumbnail={(id) => <SkillsStyleThumbnail id={id} />}
                />
              </Field>
            )}
            <ManagedNote label="skills" />
          </div>
        );
      }

      default: {
        const headingFields = renderHeadingFields(type);
        return (
          <div className="space-y-4">
            {headingFields}
            <ManagedNote label={SECTION_LABELS[type].toLowerCase()} />
          </div>
        );
      }
    }
  };

  return (
    <div className="space-y-2.5">
      <p className="px-1 text-xs text-muted-foreground">
        Reorder, show or hide sections, and edit each one below.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={content.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2.5">
            {content.map((section) => (
              <SortableSectionCard
                key={section.id}
                section={section}
                icon={SECTION_ICONS[section.type]}
                title={SECTION_LABELS[section.type]}
                isEmpty={Boolean(emptyByType[section.type])}
                isExpanded={expandedId === section.id}
                onToggleExpand={() => toggleExpand(section.id)}
                onToggleVisibility={(enabled) => toggleVisibility(section.id, enabled)}
              >
                {renderBody(section.type)}
              </SortableSectionCard>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Pinned utility panels — not page sections, not reorderable */}
      <div className="space-y-2.5 pt-1.5">
        <UtilityCard
          icon={Palette}
          title="Design"
          isExpanded={expandedId === 'design'}
          onToggleExpand={() => toggleExpand('design')}
        >
          <StylePanel style={draft.style} template={template} onChange={onStyle} />
        </UtilityCard>

        <UtilityCard
          icon={Search}
          title="SEO & sharing"
          isExpanded={expandedId === 'seo'}
          onToggleExpand={() => toggleExpand('seo')}
        >
          <div className="space-y-4">
            <Field label="Page title">
              <Input
                value={draft.copy.seoTitle}
                onChange={(e) => onCopy({ seoTitle: e.target.value })}
                placeholder="Shown in browser tabs and search results"
              />
            </Field>
            <Field label="Meta description">
              <Textarea
                value={draft.copy.seoDescription}
                onChange={(e) => onCopy({ seoDescription: e.target.value })}
                rows={3}
                placeholder="A short summary for search engines and link previews"
              />
            </Field>
          </div>
        </UtilityCard>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION CARD (draggable, with visibility)
// ============================================================================

interface SortableSectionCardProps {
  section: TemplateSectionConfig;
  icon: LucideIcon;
  title: string;
  isEmpty: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleVisibility: (enabled: boolean) => void;
  children: React.ReactNode;
}

function SortableSectionCard({
  section,
  icon: Icon,
  title,
  isEmpty,
  isExpanded,
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
      className={cn(
        'overflow-hidden rounded-xl border bg-card',
        isDragging && 'z-10 shadow-lg',
        !section.enabled && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-1.5 px-2 py-2">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Reorder ${title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left"
        >
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
              isExpanded ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-medium">{title}</span>
          {isEmpty && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Empty
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onToggleVisibility(!section.enabled)}
          className="rounded p-1.5 text-muted-foreground hover:text-foreground"
          aria-label={section.enabled ? `Hide ${title}` : `Show ${title}`}
          title={section.enabled ? 'Hide section' : 'Show section'}
        >
          {section.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={onToggleExpand}
          className="rounded p-1.5 text-muted-foreground hover:text-foreground"
          aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
        >
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', isExpanded && '-rotate-180 text-primary')}
          />
        </button>
      </div>

      {isExpanded && (
        <div className="border-t bg-muted/40 px-4 pb-4 pt-4 duration-200 animate-in fade-in-0 slide-in-from-top-1">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// UTILITY CARD (pinned: Design, SEO) — no drag, no visibility
// ============================================================================

interface UtilityCardProps {
  icon: LucideIcon;
  title: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  children: React.ReactNode;
}

function UtilityCard({
  icon: Icon,
  title,
  isExpanded,
  onToggleExpand,
  children,
}: UtilityCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
      >
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            isExpanded ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex-1 truncate text-sm font-medium">{title}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isExpanded && '-rotate-180 text-primary'
          )}
        />
      </button>

      {isExpanded && (
        <div className="border-t bg-muted/40 px-4 pb-4 pt-4 duration-200 animate-in fade-in-0 slide-in-from-top-1">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SMALL SHARED BITS
// ============================================================================

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

/** Note shown for sections whose content is managed in the resume Builder. */
function ManagedNote({ label }: { label: string }) {
  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      <p>This section is built automatically from your {label} in your profile.</p>
      <Link
        href="/builder"
        className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
      >
        Edit in Builder
        <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}
