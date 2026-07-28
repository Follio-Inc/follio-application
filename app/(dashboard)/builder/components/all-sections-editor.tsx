'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronDown, Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { notifyProfileUpdated } from '@/lib/events';
import { useReorderPersist } from '@/lib/hooks/use-reorder-persist';
import { useSectionReorderPersist } from '@/lib/hooks/use-section-reorder-persist';
import { type EntryEditGuard, type RegisterEntryEditGuard } from '../lib/entry-edit-guard';
import {
  hasContactDraftChanges,
  hasProfileChanges,
  type ContactDraft,
} from '@/lib/stores/builder-store';
import { cn } from '@/lib/utils';

import { saveProfileDraft } from '../lib/save-profile-draft';
import { AddSectionDialog } from './add-section-dialog';
import { useBuilderStore } from './builder-store-provider';
import { FormSaveBar } from './form-save-bar';

import { AwardsSection } from '../[section]/awards-section';
import { CertificationsSection } from '../[section]/certifications-section';
import { CustomSection } from '../[section]/custom-section';
import { InterestsSection } from '../[section]/interests-section';
import { LanguagesSection } from '../[section]/languages-section';
import { PublicationsSection } from '../[section]/publications-section';
import { ReferencesSection } from '../[section]/references-section';
import { VolunteeringSection } from '../[section]/volunteering-section';
import { BasicInfoForm } from '../sections/basic-info-form';
import { ContactDetailsSection } from '../sections/contact-details-section';
import { EducationSection } from '../sections/education-section';
import { ExperienceSection } from '../sections/experience-section';
import { PhotosSection } from '../sections/photos-section';
import { ProjectsSection } from '../sections/projects-section';
import { SkillsSection } from '../sections/skills-section';
import { SummarySection } from '../sections/summary-section';

import type {
  Award as AwardType,
  Certification,
  Education,
  FullProfile,
  ProfileSection,
  Project,
  SectionType,
  WorkExperience,
} from '@/types';

// ──────────────────────────────────────────────
// Section type → editor mapping
// ──────────────────────────────────────────────

/** Section types we skip in the all-sections view (handled elsewhere or non-editable here).
 *  PHOTOS is merged into BASIC_INFO (Header), so it is skipped as a standalone row. */
const SKIPPED_SECTIONS = new Set(['SHARE', 'SETTINGS', 'GITHUB', 'LINKS', 'CONTACT', 'PHOTOS']);

/** Display titles for each section type */
const SECTION_TITLES: Record<string, string> = {
  BASIC_INFO: 'Header',
  PHOTOS: 'Photos',
  SUMMARY: 'Summary',
  EXPERIENCE: 'Work Experience',
  EDUCATION: 'Education',
  SKILLS: 'Skills',
  PROJECTS: 'Projects',
  LINKS: 'Links',
  AWARDS: 'Awards',
  CERTIFICATIONS: 'Certifications',
  PUBLICATIONS: 'Publications',
  VOLUNTEERING: 'Volunteering',
  LANGUAGES: 'Languages',
  INTERESTS: 'Interests',
  REFERENCES: 'References',
  CUSTOM: 'Custom Section',
};

/** Sections that render as entry cards when expanded (click entry → focused edit panel) */
const ENTRY_SECTIONS = new Set<string>([
  'EXPERIENCE',
  'EDUCATION',
  'PROJECTS',
  'AWARDS',
  'CERTIFICATIONS',
]);
const FORM_SECTION_TYPES = new Set(['BASIC_INFO', 'SUMMARY']);

/** Section types that are pinned at the top and NOT draggable */
const PINNED_SECTION_TYPES = new Set<string>(['BASIC_INFO']);

/** Stable DndContext id — must not use useId() (hydration mismatch in nested SSR trees). */
const SECTION_DND_CONTEXT_ID = 'builder-all-sections-dnd';

/** Singular display name for "Add ___" buttons */
const ENTRY_SINGULAR: Record<string, string> = {
  EXPERIENCE: 'Experience',
  EDUCATION: 'Education',
  PROJECTS: 'Project',
  AWARDS: 'Award',
  CERTIFICATIONS: 'Certification',
};

type EditingEntry = {
  sectionType: string;
  sectionId: string;
  entryId: string | 'new';
};

type EntryInfo = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  isVisible?: boolean;
};

/** API path prefix for each entry type (used for visibility toggle PATCH). */
const ENTRY_API_PATH: Record<string, string> = {
  EXPERIENCE: '/api/profile/experiences',
  EDUCATION: '/api/profile/education',
  PROJECTS: '/api/profile/projects',
  AWARDS: '/api/profile/awards',
  CERTIFICATIONS: '/api/profile/certifications',
};

/** Store key holding the entry array for each section type. */
const ENTRY_STORE_KEY: Record<string, keyof FullProfile> = {
  EXPERIENCE: 'workExperiences',
  EDUCATION: 'educations',
  PROJECTS: 'projects',
  AWARDS: 'awards',
  CERTIFICATIONS: 'certifications',
};

function formatDateRange(
  start?: Date | string | null,
  end?: Date | string | null,
  isCurrent?: boolean
): string {
  const fmt = (d: Date | string) => {
    const date = typeof d === 'string' ? new Date(d) : d;
    // Month-precision dates are stored as UTC; format in UTC to keep the month stable.
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  if (!start) return '';
  const startStr = fmt(start);
  if (isCurrent) return `${startStr} – Present`;
  if (end) return `${startStr} – ${fmt(end)}`;
  return startStr;
}

/** Entry count badge for list-based sections (null when not applicable). */
function getSectionEntryCount(sectionType: string, profile: FullProfile): number | null {
  switch (sectionType) {
    case 'EXPERIENCE':
      return profile.workExperiences.length;
    case 'EDUCATION':
      return profile.educations.length;
    case 'PROJECTS':
      return profile.projects.length;
    case 'AWARDS':
      return profile.awards.length;
    case 'CERTIFICATIONS':
      return profile.certifications.length;
    default:
      return null;
  }
}

// ──────────────────────────────────────────────
// Sortable Section Card (wraps each section accordion card)
// ──────────────────────────────────────────────

function SortableSectionCard({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group/sortable-section relative', isDragging && 'z-50 opacity-90 shadow-lg')}
    >
      {!disabled && (
        <button
          {...attributes}
          {...listeners}
          className={cn(
            'absolute -left-1 top-4 -translate-x-full',
            'flex h-8 w-6 cursor-grab items-center justify-center rounded-md',
            'text-muted-foreground/40 opacity-0 transition-opacity',
            'hover:text-muted-foreground focus-visible:opacity-100 group-hover/sortable-section:opacity-100',
            isDragging && 'cursor-grabbing opacity-100'
          )}
          title="Drag to reorder section"
          type="button"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────
// Sortable Entry Card (wraps each entry in list-based sections)
// ──────────────────────────────────────────────

function SortableEntryCard({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group/sortable-entry relative', isDragging && 'z-50 opacity-90 shadow-lg')}
    >
      {!disabled && (
        <button
          {...attributes}
          {...listeners}
          className={cn(
            'absolute -left-1 top-1/2 -translate-x-full -translate-y-1/2',
            'flex h-8 w-6 cursor-grab items-center justify-center rounded-md',
            'text-muted-foreground/40 opacity-0 transition-opacity',
            'hover:text-muted-foreground focus-visible:opacity-100 group-hover/sortable-entry:opacity-100',
            isDragging && 'cursor-grabbing opacity-100'
          )}
          title="Drag to reorder"
          type="button"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

type PendingEntryDelete = {
  sectionType: string;
  entryId: string;
  title: string;
};

export function AllSectionsEditor() {
  // ── Local state ──
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<EditingEntry | null>(null);
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);
  const [pendingEntryDelete, setPendingEntryDelete] = useState<PendingEntryDelete | null>(null);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);

  // ── Store state ──
  const draftProfile = useBuilderStore((s) => s.draftProfile);
  const savedProfile = useBuilderStore((s) => s.savedProfile);
  const contactDraft = useBuilderStore((s) => s.contactDraft);
  const savedContact = useBuilderStore((s) => s.savedContact);
  const isSaving = useBuilderStore((s) => s.isSaving);
  const updateDraft = useBuilderStore((s) => s.updateDraft);
  const updateContactDraft = useBuilderStore((s) => s.updateContactDraft);
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);
  const markSaved = useBuilderStore((s) => s.markSaved);
  const discardChanges = useBuilderStore((s) => s.discardChanges);
  const setSaving = useBuilderStore((s) => s.setSaving);
  const setInlineEditing = useBuilderStore((s) => s.setInlineEditing);

  // ── Derived state ──
  const profileChanged = hasProfileChanges(draftProfile, savedProfile);
  const contactChanged = hasContactDraftChanges(contactDraft, savedContact);
  const hasFormChanges = profileChanged || contactChanged;

  // ── DnD: Section reorder ──
  const sectionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleSectionReorderCommit = useCallback(
    (reorderedSections: ProfileSection[]) => {
      // Update sortOrder values to match new positions
      const updated = reorderedSections.map((s, i) => ({ ...s, sortOrder: i }));
      commitInlineChange({ sections: updated });
    },
    [commitInlineChange]
  );

  const persistSectionOrder = useSectionReorderPersist(handleSectionReorderCommit);

  // ── DnD: Entry reorder hooks ──
  const persistExperienceOrder = useReorderPersist<WorkExperience>('workExperience', (items) => {
    commitInlineChange({ workExperiences: items });
  });
  const persistEducationOrder = useReorderPersist<Education>('education', (items) => {
    commitInlineChange({ educations: items });
  });
  const persistProjectOrder = useReorderPersist<Project>('project', (items) => {
    commitInlineChange({ projects: items });
  });
  const persistAwardOrder = useReorderPersist<AwardType>('award', (items) => {
    commitInlineChange({ awards: items });
  });
  const persistCertificationOrder = useReorderPersist<Certification>('certification', (items) => {
    commitInlineChange({ certifications: items });
  });

  type AnyReorderFn = (items: Array<{ id: string }>) => Promise<void>;

  const entryReorderMap = useMemo<Record<string, AnyReorderFn>>(
    () => ({
      EXPERIENCE: persistExperienceOrder as unknown as AnyReorderFn,
      EDUCATION: persistEducationOrder as unknown as AnyReorderFn,
      PROJECTS: persistProjectOrder as unknown as AnyReorderFn,
      AWARDS: persistAwardOrder as unknown as AnyReorderFn,
      CERTIFICATIONS: persistCertificationOrder as unknown as AnyReorderFn,
    }),
    [
      persistExperienceOrder,
      persistEducationOrder,
      persistProjectOrder,
      persistAwardOrder,
      persistCertificationOrder,
    ]
  );

  // ── Handlers ──
  const handleProfileUpdate = useCallback(
    (updates: Partial<FullProfile>) => {
      updateDraft(updates);
    },
    [updateDraft]
  );

  const handleContactUpdate = useCallback(
    (updates: Partial<ContactDraft>) => {
      updateContactDraft(updates);

      // Sync contact fields back to draftProfile.contactInfo so that:
      // 1. The resume preview reflects the change immediately
      // 2. If ContactDetailsSection remounts (accordion collapse/expand),
      //    it rebuilds entries from the up-to-date contactInfo
      const ci = (draftProfile.contactInfo ?? {}) as Record<string, unknown>;
      const merged = { ...ci };
      let changed = false;
      for (const key of Object.keys(updates) as (keyof ContactDraft)[]) {
        if (updates[key] !== undefined && merged[key] !== updates[key]) {
          merged[key] = updates[key];
          changed = true;
        }
      }
      if (changed) {
        updateDraft({ contactInfo: merged as FullProfile['contactInfo'] });
      }
    },
    [updateContactDraft, updateDraft, draftProfile.contactInfo]
  );

  const handleInlineUpdate = useCallback(
    (updates: Partial<FullProfile>) => {
      commitInlineChange(updates);
    },
    [commitInlineChange]
  );

  const handleInlineEditingChange = useCallback(
    (isEditing: boolean) => {
      setInlineEditing(isEditing);
    },
    [setInlineEditing]
  );

  const handleSave = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      await saveProfileDraft({
        draftProfile,
        contactDraft,
        shouldSaveProfile: profileChanged,
        shouldSaveContact: contactChanged,
      });

      markSaved();
      notifyProfileUpdated();
      return true;
    } catch (error) {
      console.error('Save error:', error);
      return false;
    } finally {
      setSaving(false);
    }
  }, [profileChanged, contactChanged, draftProfile, contactDraft, markSaved, setSaving]);

  const handleDiscard = useCallback(() => {
    discardChanges();
  }, [discardChanges]);

  const handleFormSectionSave = useCallback(async () => {
    const didSave = await handleSave();
    if (didSave) {
      setExpandedSection(null);
    }
  }, [handleSave]);

  const handleFormSectionDiscard = useCallback(() => {
    if (hasFormChanges) {
      setShowDiscardWarning(true);
      return;
    }
    setExpandedSection(null);
  }, [hasFormChanges]);

  const handleConfirmDiscard = useCallback(() => {
    handleDiscard();
    setShowDiscardWarning(false);
    setExpandedSection(null);
  }, [handleDiscard]);

  const handleCancelDiscard = useCallback(() => {
    setShowDiscardWarning(false);
  }, []);

  // ── Entry card helpers ──

  /** Extract entry summaries for list-based sections */
  const getEntries = useCallback(
    (sectionType: string): EntryInfo[] => {
      switch (sectionType) {
        case 'EXPERIENCE':
          return draftProfile.workExperiences.map((exp) => ({
            id: exp.id,
            title: exp.role || 'Untitled Role',
            subtitle: exp.company || undefined,
            meta: formatDateRange(exp.startDate, exp.endDate, exp.isCurrent),
            isVisible: exp.isVisible,
          }));
        case 'EDUCATION':
          return draftProfile.educations.map((edu) => ({
            id: edu.id,
            title: [edu.degree, edu.fieldOfStudy].filter(Boolean).join(' in ') || 'Education',
            subtitle: edu.institution || undefined,
            meta: formatDateRange(edu.startDate, edu.endDate, edu.isCurrent),
            isVisible: edu.isVisible,
          }));
        case 'PROJECTS':
          return draftProfile.projects.map((proj) => ({
            id: proj.id,
            title: proj.title || 'Untitled Project',
            subtitle: proj.shortDesc || undefined,
            isVisible: proj.isVisible,
          }));
        case 'AWARDS':
          return draftProfile.awards.map((award) => ({
            id: award.id,
            title: award.title || 'Untitled Award',
            subtitle: award.issuer || undefined,
            meta: award.date ? formatDateRange(award.date) : undefined,
            isVisible: award.isVisible,
          }));
        case 'CERTIFICATIONS':
          return draftProfile.certifications.map((cert) => ({
            id: cert.id,
            title: cert.name || 'Untitled Certification',
            subtitle: cert.issuer || undefined,
            meta: cert.issueDate ? formatDateRange(cert.issueDate) : undefined,
            isVisible: cert.isVisible,
          }));
        default:
          return [];
      }
    },
    [draftProfile]
  );

  const handleEditComplete = useCallback(() => {
    setEditingEntry(null);
  }, []);

  /** Focused entry editor registers dirty-state here so Back can gate navigation. */
  const entryEditGuardRef = useRef<EntryEditGuard | null>(null);

  const registerEntryEditGuard = useCallback<RegisterEntryEditGuard>((guard) => {
    entryEditGuardRef.current = guard;
  }, []);

  const handleBackFromEntry = useCallback(() => {
    const guard = entryEditGuardRef.current;
    if (guard?.hasUnsavedChanges()) {
      guard.requestAttention();
      return;
    }
    handleEditComplete();
  }, [handleEditComplete]);

  // ── Entry visibility toggle ──
  const entryVisibilityAbortRef = useRef<AbortController | null>(null);

  const toggleEntryVisibility = useCallback(
    async (e: React.MouseEvent, sectionType: string, entryId: string) => {
      e.stopPropagation(); // Don't open the entry editor

      const storeKey = ENTRY_STORE_KEY[sectionType];
      const apiPath = ENTRY_API_PATH[sectionType];
      if (!storeKey || !apiPath) return;

      const items = (draftProfile[storeKey] as Array<{ id: string; isVisible?: boolean }>) || [];
      const entry = items.find((item) => item.id === entryId);
      if (!entry) return;

      const newVisible = !(entry.isVisible ?? true);
      const updatedItems = items.map((item) =>
        item.id === entryId ? { ...item, isVisible: newVisible } : item
      );

      // Optimistic update
      commitInlineChange({ [storeKey]: updatedItems });

      // Persist
      entryVisibilityAbortRef.current?.abort();
      const controller = new AbortController();
      entryVisibilityAbortRef.current = controller;

      try {
        const response = await fetch(`${apiPath}/${entryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isVisible: newVisible }),
          signal: controller.signal,
        });

        if (!response.ok) {
          console.error('Failed to persist entry visibility:', await response.text());
          commitInlineChange({ [storeKey]: items }); // revert
        } else {
          notifyProfileUpdated();
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Failed to persist entry visibility:', err);
        commitInlineChange({ [storeKey]: items }); // revert
      }
    },
    [draftProfile, commitInlineChange]
  );

  const requestEntryDelete = useCallback(
    (e: React.MouseEvent, sectionType: string, entry: EntryInfo) => {
      e.stopPropagation();
      setPendingEntryDelete({
        sectionType,
        entryId: entry.id,
        title: entry.title,
      });
    },
    []
  );

  const handleConfirmEntryDelete = useCallback(async () => {
    if (!pendingEntryDelete) return;

    const { sectionType, entryId } = pendingEntryDelete;
    const storeKey = ENTRY_STORE_KEY[sectionType];
    const apiPath = ENTRY_API_PATH[sectionType];
    if (!storeKey || !apiPath) {
      setPendingEntryDelete(null);
      return;
    }

    const items = (draftProfile[storeKey] as Array<{ id: string }>) || [];
    const previousItems = items;
    const updatedItems = items.filter((item) => item.id !== entryId);

    setIsDeletingEntry(true);
    commitInlineChange({ [storeKey]: updatedItems });

    try {
      const response = await fetch(`${apiPath}/${entryId}`, { method: 'DELETE' });
      if (!response.ok) {
        console.error('Failed to delete entry:', await response.text());
        commitInlineChange({ [storeKey]: previousItems });
        return;
      }

      if (editingEntry?.sectionType === sectionType && editingEntry.entryId === entryId) {
        setEditingEntry(null);
      }
      notifyProfileUpdated();
      setPendingEntryDelete(null);
    } catch (err) {
      console.error('Failed to delete entry:', err);
      commitInlineChange({ [storeKey]: previousItems });
    } finally {
      setIsDeletingEntry(false);
    }
  }, [pendingEntryDelete, draftProfile, commitInlineChange, editingEntry]);

  // ── Entry drag-end handler (generic for any entry section) ──
  const handleEntryDragEnd = useCallback(
    (sectionType: string, event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const entries = getEntries(sectionType);
      const oldIndex = entries.findIndex((e) => e.id === active.id);
      const newIndex = entries.findIndex((e) => e.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      // Get the actual data items for the reorder
      const persistFn = entryReorderMap[sectionType];
      if (!persistFn) return;

      let items: Array<{ id: string }>;
      switch (sectionType) {
        case 'EXPERIENCE':
          items = arrayMove([...draftProfile.workExperiences], oldIndex, newIndex);
          break;
        case 'EDUCATION':
          items = arrayMove([...draftProfile.educations], oldIndex, newIndex);
          break;
        case 'PROJECTS':
          items = arrayMove([...draftProfile.projects], oldIndex, newIndex);
          break;
        case 'AWARDS':
          items = arrayMove([...draftProfile.awards], oldIndex, newIndex);
          break;
        case 'CERTIFICATIONS':
          items = arrayMove([...draftProfile.certifications], oldIndex, newIndex);
          break;
        default:
          return;
      }

      persistFn(items);
    },
    [draftProfile, getEntries, entryReorderMap]
  );

  /** Render entry cards + "Add" button when a list-based section is expanded */
  const renderEntryList = useCallback(
    (section: ProfileSection) => {
      const entries = getEntries(section.type);
      const singularName = ENTRY_SINGULAR[section.type] || section.title || 'Item';

      if (entries.length === 0) {
        return (
          <button
            type="button"
            onClick={() =>
              setEditingEntry({
                sectionType: section.type,
                sectionId: section.id,
                entryId: 'new',
              })
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-background py-8 text-sm text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Add {singularName}
          </button>
        );
      }

      const entryIds = entries.map((e) => e.id);
      // eslint-disable-next-line react-hooks/rules-of-hooks -- stable section type per render cycle
      const dndId = `entry-dnd-${section.id}`;

      return (
        <div className="space-y-2">
          <DndContext
            id={dndId}
            sensors={sectionSensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => handleEntryDragEnd(section.type, event)}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext items={entryIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 pl-5">
                {entries.map((entry) => {
                  const entryHidden = entry.isVisible === false;
                  return (
                    <SortableEntryCard key={entry.id} id={entry.id}>
                      <div
                        className={cn(
                          'group/entry flex w-full items-center gap-3 rounded-xl bg-background px-3.5 py-3 text-left transition-colors hover:bg-background/80',
                          entryHidden && 'opacity-50'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setEditingEntry({
                              sectionType: section.type,
                              sectionId: section.id,
                              entryId: entry.id,
                            })
                          }
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-sm font-medium">{entry.title}</p>
                          {entry.subtitle && (
                            <p className="truncate text-xs text-muted-foreground">
                              {entry.subtitle}
                            </p>
                          )}
                        </button>
                        {entry.meta && (
                          <span className="shrink-0 text-xs text-muted-foreground/70">
                            {entry.meta}
                          </span>
                        )}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => toggleEntryVisibility(e, section.type, entry.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleEntryVisibility(
                                e as unknown as React.MouseEvent,
                                section.type,
                                entry.id
                              );
                            }
                          }}
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors',
                            'opacity-0 focus-visible:opacity-100 group-hover/entry:opacity-100',
                            entryHidden
                              ? 'text-muted-foreground opacity-100'
                              : 'text-muted-foreground/40 hover:text-muted-foreground'
                          )}
                          title={entryHidden ? 'Show on resume' : 'Hide from resume'}
                        >
                          {entryHidden ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => requestEntryDelete(e, section.type, entry)}
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors',
                            'opacity-0 focus-visible:opacity-100 group-hover/entry:opacity-100',
                            'text-muted-foreground/40 hover:text-destructive'
                          )}
                          title={`Delete ${singularName.toLowerCase()}`}
                          aria-label={`Delete ${entry.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingEntry({
                              sectionType: section.type,
                              sectionId: section.id,
                              entryId: entry.id,
                            })
                          }
                          className="shrink-0"
                          aria-label="Edit entry"
                        >
                          <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-muted-foreground/40 transition-colors group-hover/entry:text-muted-foreground" />
                        </button>
                      </div>
                    </SortableEntryCard>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={() =>
              setEditingEntry({
                sectionType: section.type,
                sectionId: section.id,
                entryId: 'new',
              })
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-background py-2.5 text-xs text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add {singularName}
          </button>
        </div>
      );
    },
    [getEntries, sectionSensors, handleEntryDragEnd, toggleEntryVisibility, requestEntryDelete]
  );

  /** Render a section editor with autoEditId for focused entry editing */
  const renderSectionEditor = useCallback(
    (sectionType: string, entryId: string | 'new') => {
      switch (sectionType) {
        case 'EXPERIENCE':
          return (
            <ExperienceSection
              experiences={draftProfile.workExperiences}
              profileId={draftProfile.id}
              onUpdate={(workExperiences) => handleInlineUpdate({ workExperiences })}
              onEditingStateChange={handleInlineEditingChange}
              autoEditId={entryId}
              onEditComplete={handleEditComplete}
              onRegisterEditGuard={registerEntryEditGuard}
            />
          );
        case 'EDUCATION':
          return (
            <EducationSection
              educations={draftProfile.educations}
              profileId={draftProfile.id}
              onUpdate={(educations) => handleInlineUpdate({ educations })}
              autoEditId={entryId}
              onEditComplete={handleEditComplete}
              onRegisterEditGuard={registerEntryEditGuard}
            />
          );
        case 'PROJECTS':
          return (
            <ProjectsSection
              projects={draftProfile.projects}
              profileId={draftProfile.id}
              onUpdate={(projects) => handleInlineUpdate({ projects })}
              autoEditId={entryId}
              onEditComplete={handleEditComplete}
              onRegisterEditGuard={registerEntryEditGuard}
            />
          );
        case 'AWARDS':
          return (
            <AwardsSection
              awards={draftProfile.awards}
              profileId={draftProfile.id}
              onUpdate={(awards: AwardType[]) => handleInlineUpdate({ awards })}
              autoEditId={entryId}
              onEditComplete={handleEditComplete}
              onRegisterEditGuard={registerEntryEditGuard}
            />
          );
        case 'CERTIFICATIONS':
          return (
            <CertificationsSection
              certifications={draftProfile.certifications}
              profileId={draftProfile.id}
              onUpdate={(certifications: Certification[]) => handleInlineUpdate({ certifications })}
              autoEditId={entryId}
              onEditComplete={handleEditComplete}
              onRegisterEditGuard={registerEntryEditGuard}
            />
          );
        default:
          return null;
      }
    },
    [
      draftProfile,
      handleInlineUpdate,
      handleInlineEditingChange,
      handleEditComplete,
      registerEntryEditGuard,
    ]
  );

  // ── Render a single section editor by type (for non-entry sections) ──
  const renderSection = (section: ProfileSection) => {
    const { type } = section;

    if (SKIPPED_SECTIONS.has(type)) return null;

    switch (type) {
      case 'BASIC_INFO':
        return (
          <div className="space-y-6">
            <PhotosSection
              profile={draftProfile}
              onUpdateAction={handleProfileUpdate}
              onInlineUpdate={handleInlineUpdate}
              embedded
            />
            <BasicInfoForm profile={draftProfile} onUpdate={handleProfileUpdate} embedded />
            <ContactDetailsSection
              profile={draftProfile}
              onProfileUpdate={handleProfileUpdate}
              onContactUpdate={handleContactUpdate}
              onLinksUpdate={(links) => handleInlineUpdate({ links })}
            />
          </div>
        );

      case 'SUMMARY':
        return <SummarySection profile={draftProfile} onUpdate={handleProfileUpdate} embedded />;

      case 'EXPERIENCE':
        return (
          <ExperienceSection
            experiences={draftProfile.workExperiences}
            profileId={draftProfile.id}
            onUpdate={(workExperiences) => handleInlineUpdate({ workExperiences })}
            onEditingStateChange={handleInlineEditingChange}
            embedded
          />
        );

      case 'EDUCATION':
        return (
          <EducationSection
            educations={draftProfile.educations}
            profileId={draftProfile.id}
            onUpdate={(educations) => handleInlineUpdate({ educations })}
            embedded
          />
        );

      case 'SKILLS':
        return (
          <SkillsSection
            skills={draftProfile.skills}
            skillGroups={draftProfile.skillGroups}
            profileId={draftProfile.id}
            onUpdate={(skills, skillGroups) => handleInlineUpdate({ skills, skillGroups })}
            embedded
          />
        );

      case 'PROJECTS':
        return (
          <ProjectsSection
            projects={draftProfile.projects}
            profileId={draftProfile.id}
            onUpdate={(projects) => handleInlineUpdate({ projects })}
            embedded
          />
        );

      case 'AWARDS':
        return (
          <AwardsSection
            awards={draftProfile.awards}
            profileId={draftProfile.id}
            onUpdate={(awards: AwardType[]) => handleInlineUpdate({ awards })}
            embedded
          />
        );

      case 'CERTIFICATIONS':
        return (
          <CertificationsSection
            certifications={draftProfile.certifications}
            profileId={draftProfile.id}
            onUpdate={(certifications: Certification[]) => handleInlineUpdate({ certifications })}
            embedded
          />
        );

      case 'VOLUNTEERING':
        return <VolunteeringSection section={section} profileId={draftProfile.id} embedded />;

      case 'LANGUAGES':
        return <LanguagesSection section={section} profileId={draftProfile.id} embedded />;

      case 'PUBLICATIONS':
        return <PublicationsSection section={section} profileId={draftProfile.id} embedded />;

      case 'INTERESTS':
        return <InterestsSection section={section} profileId={draftProfile.id} embedded />;

      case 'REFERENCES':
        return <ReferencesSection section={section} profileId={draftProfile.id} embedded />;

      case 'CUSTOM':
        return <CustomSection section={section} profileId={draftProfile.id} embedded />;

      default:
        return null;
    }
  };

  // ── Sections ordered by the profile's section config ──
  const orderedSections = (draftProfile.sections || [])
    .filter((s) => !SKIPPED_SECTIONS.has(s.type))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Split into pinned (BASIC_INFO stays at top) and draggable sections
  const pinnedSections = orderedSections.filter((s) => PINNED_SECTION_TYPES.has(s.type));
  const draggableSections = orderedSections.filter((s) => !PINNED_SECTION_TYPES.has(s.type));
  const draggableSectionIds = useMemo(
    () => draggableSections.map((s) => s.id),
    [draggableSections]
  );

  // ── Section drag-end handler ──
  const handleSectionDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = draggableSections.findIndex((s) => s.id === active.id);
      const newIndex = draggableSections.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reorderedDraggable = arrayMove(draggableSections, oldIndex, newIndex);
      // Rebuild full list: pinned + reordered visible + hidden/skipped sections
      const skippedSections = (draftProfile.sections || []).filter(
        (s) => SKIPPED_SECTIONS.has(s.type) && !PINNED_SECTION_TYPES.has(s.type)
      );
      const allSections = [...pinnedSections, ...reorderedDraggable, ...skippedSections];
      persistSectionOrder(allSections);
    },
    [draggableSections, pinnedSections, persistSectionOrder, draftProfile.sections]
  );

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSection((prev) => (prev === sectionId ? null : sectionId));
  }, []);

  const jumpToSection = useCallback((sectionId: string) => {
    setExpandedSection(sectionId);
    requestAnimationFrame(() => {
      document.getElementById(`section-${sectionId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, []);

  const handleAddSection = useCallback(
    async (type: SectionType, customName?: string, title?: string) => {
      const response = await fetch('/api/profile/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, customName, title }),
      });

      if (!response.ok) {
        console.error('Failed to add section:', await response.text());
        return;
      }

      const newSection = (await response.json()) as ProfileSection;
      const sections = draftProfile.sections || [];
      commitInlineChange({ sections: [...sections, newSection] });
      notifyProfileUpdated();
      jumpToSection(newSection.id);
    },
    [commitInlineChange, draftProfile.sections, jumpToSection]
  );

  // ── Section visibility toggle ──
  const visibilityAbortRef = useRef<AbortController | null>(null);

  const toggleSectionVisibility = useCallback(
    async (e: React.MouseEvent, sectionId: string) => {
      e.stopPropagation(); // Don't toggle accordion expand/collapse

      const sections = draftProfile.sections || [];
      const updatedSections = sections.map((s) =>
        s.id === sectionId ? { ...s, isVisible: !(s.isVisible ?? true) } : s
      );

      // Optimistic update — immediately reflected in preview
      commitInlineChange({ sections: updatedSections });

      // Persist to backend
      visibilityAbortRef.current?.abort();
      const controller = new AbortController();
      visibilityAbortRef.current = controller;

      try {
        const response = await fetch('/api/profile/sections', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sections: updatedSections.map((s) => ({
              id: s.id,
              sortOrder: s.sortOrder,
              isVisible: s.isVisible,
            })),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          console.error('Failed to persist section visibility:', await response.text());
          // Revert on error
          commitInlineChange({ sections });
        } else {
          notifyProfileUpdated();
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Failed to persist section visibility:', err);
        commitInlineChange({ sections });
      }
    },
    [draftProfile.sections, commitInlineChange]
  );
  // ── Full-panel edit mode: show only the focused entry editor ──
  if (editingEntry) {
    const section = orderedSections.find((s) => s.id === editingEntry.sectionId);
    const title = SECTION_TITLES[editingEntry.sectionType] || section?.title || 'Edit';

    return (
      <div className="rounded-xl bg-muted p-5">
        <button
          type="button"
          onClick={handleBackFromEntry}
          className="-ml-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span>Back to {title}</span>
        </button>
        <div className="mt-5">
          {renderSectionEditor(editingEntry.sectionType, editingEntry.entryId)}
        </div>
      </div>
    );
  }

  // ── Normal accordion view ──

  /** Renders a single section accordion card */
  const renderSectionCard = (section: ProfileSection) => {
    const isExpanded = expandedSection === section.id;
    const sectionHidden = section.isVisible === false;
    const title =
      section.type === 'CUSTOM'
        ? section.title || section.customName || 'Custom Section'
        : SECTION_TITLES[section.type] || section.title;
    const showVisibilityToggle = !PINNED_SECTION_TYPES.has(section.type);
    const entryCount = getSectionEntryCount(section.type, draftProfile);

    return (
      <section
        key={section.id}
        id={`section-${section.id}`}
        data-section-type={section.type}
        className="group/section scroll-mt-16"
      >
        {/* Unified section container — header + content share one visual card */}
        <div
          className={cn(
            'overflow-hidden rounded-xl bg-muted transition-colors duration-150',
            sectionHidden && 'opacity-50'
          )}
        >
          {/* Section card header */}
          <button
            type="button"
            onClick={() => toggleSection(section.id)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors"
          >
            <span
              className={cn(
                'flex-1 text-sm font-medium transition-colors duration-150',
                isExpanded ? 'text-foreground' : 'text-foreground/90'
              )}
            >
              {title}
            </span>
            {entryCount !== null && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums',
                  entryCount === 0
                    ? 'bg-background text-muted-foreground'
                    : 'bg-primary/10 text-primary'
                )}
              >
                {entryCount}
              </span>
            )}
            {showVisibilityToggle && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => toggleSectionVisibility(e, section.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleSectionVisibility(e as unknown as React.MouseEvent, section.id);
                  }
                }}
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                  'opacity-0 focus-visible:opacity-100 group-hover/section:opacity-100',
                  sectionHidden
                    ? 'text-muted-foreground opacity-100'
                    : 'text-muted-foreground/40 hover:text-muted-foreground'
                )}
                title={sectionHidden ? 'Show on resume' : 'Hide from resume'}
              >
                {sectionHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </span>
            )}
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-200',
                isExpanded && '-rotate-180 text-primary'
              )}
            />
          </button>

          {/* Expanded content */}
          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="rounded-b-xl bg-muted px-4 pb-5 pt-1">
                  {ENTRY_SECTIONS.has(section.type)
                    ? renderEntryList(section)
                    : renderSection(section)}
                  <FormSaveBar
                    show={FORM_SECTION_TYPES.has(section.type)}
                    canSave={hasFormChanges}
                    isSaving={isSaving}
                    onSave={handleFormSectionSave}
                    onDiscard={handleFormSectionDiscard}
                    sticky={false}
                    variant="entry"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    );
  };

  return (
    <>
      <AlertDialog
        open={showDiscardWarning}
        onOpenChange={(open) => !open && handleCancelDiscard()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits in this section. Discarding will permanently remove them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDiscard}>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>Discard Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!pendingEntryDelete}
        onOpenChange={(open) => {
          if (!open && !isDeletingEntry) setPendingEntryDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete{' '}
              {(pendingEntryDelete && ENTRY_SINGULAR[pendingEntryDelete.sectionType]) || 'item'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingEntryDelete
                ? `"${pendingEntryDelete.title}" will be removed from your resume. This can't be undone.`
                : "This item will be removed from your resume. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingEntry}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmEntryDelete();
              }}
              disabled={isDeletingEntry}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingEntry ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="space-y-4 pl-5">
        {/* Pinned sections (BASIC_INFO) — always at top, not draggable */}
        {pinnedSections.map((section) => renderSectionCard(section))}

        {/* Draggable body sections */}
        <DndContext
          id={SECTION_DND_CONTEXT_ID}
          sensors={sectionSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleSectionDragEnd}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        >
          <SortableContext items={draggableSectionIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {draggableSections.map((section) => (
                <SortableSectionCard key={section.id} id={section.id}>
                  {renderSectionCard(section)}
                </SortableSectionCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="pt-2">
          <AddSectionDialog
            existingSections={draftProfile.sections || []}
            onAdd={handleAddSection}
          />
        </div>
      </div>
    </>
  );
}
