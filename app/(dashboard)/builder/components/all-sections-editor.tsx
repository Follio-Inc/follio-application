'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  BookOpen,
  Briefcase,
  ChevronDown,
  Code,
  Contact,
  FileText,
  FolderKanban,
  Globe,
  GraduationCap,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  Link as LinkIcon,
  Plus,
  Sparkles,
  User,
} from 'lucide-react';
import { useCallback, useState } from 'react';

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
import {
  hasContactDraftChanges,
  hasProfileChanges,
  type ContactDraft,
} from '@/lib/stores/builder-store';
import { cn } from '@/lib/utils';

import { saveProfileDraft } from '../lib/save-profile-draft';
import { useBuilderStore } from './builder-store-provider';
import { FormSaveBar } from './form-save-bar';

import { AwardsSection } from '../[section]/awards-section';
import { CertificationsSection } from '../[section]/certifications-section';
import { CustomSection } from '../[section]/custom-section';
import { InterestsSection } from '../[section]/interests-section';
import { LanguagesSection } from '../[section]/languages-section';
import { PublicationsSection } from '../[section]/publications-section';
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
  FullProfile,
  ProfileSection,
  SectionType,
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
  CUSTOM: 'Custom Section',
};

/** Icons for each section type */
const SECTION_ICONS: Record<SectionType, React.ComponentType<{ className?: string }>> = {
  BASIC_INFO: User,
  CONTACT: Contact,
  PHOTOS: ImageIcon,
  SUMMARY: FileText,
  EXPERIENCE: Briefcase,
  EDUCATION: GraduationCap,
  SKILLS: Code,
  PROJECTS: FolderKanban,
  LINKS: LinkIcon,
  AWARDS: Award,
  CERTIFICATIONS: BadgeCheck,
  PUBLICATIONS: BookOpen,
  VOLUNTEERING: Heart,
  LANGUAGES: Globe,
  INTERESTS: Sparkles,
  CUSTOM: LayoutGrid,
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
};

function formatDateRange(
  start?: Date | string | null,
  end?: Date | string | null,
  isCurrent?: boolean
): string {
  const fmt = (d: Date | string) => {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  if (!start) return '';
  const startStr = fmt(start);
  if (isCurrent) return `${startStr} – Present`;
  if (end) return `${startStr} – ${fmt(end)}`;
  return startStr;
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export function AllSectionsEditor() {
  // ── Local state ──
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<EditingEntry | null>(null);
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);

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
          }));
        case 'EDUCATION':
          return draftProfile.educations.map((edu) => ({
            id: edu.id,
            title: [edu.degree, edu.fieldOfStudy].filter(Boolean).join(' in ') || 'Education',
            subtitle: edu.institution || undefined,
            meta: formatDateRange(edu.startDate, edu.endDate, edu.isCurrent),
          }));
        case 'PROJECTS':
          return draftProfile.projects.map((proj) => ({
            id: proj.id,
            title: proj.title || 'Untitled Project',
            subtitle: proj.shortDesc || undefined,
          }));
        case 'AWARDS':
          return draftProfile.awards.map((award) => ({
            id: award.id,
            title: award.title || 'Untitled Award',
            subtitle: award.issuer || undefined,
            meta: award.date ? formatDateRange(award.date) : undefined,
          }));
        case 'CERTIFICATIONS':
          return draftProfile.certifications.map((cert) => ({
            id: cert.id,
            title: cert.name || 'Untitled Certification',
            subtitle: cert.issuer || undefined,
            meta: cert.issueDate ? formatDateRange(cert.issueDate) : undefined,
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
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/30 py-8 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-4 w-4" />
            Add {singularName}
          </button>
        );
      }

      return (
        <div className="space-y-1">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() =>
                setEditingEntry({
                  sectionType: section.type,
                  sectionId: section.id,
                  entryId: entry.id,
                })
              }
              className="group/entry flex w-full items-center gap-3 rounded-lg border border-border/30 bg-background px-3 py-2.5 text-left transition-colors hover:border-border/50 hover:shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{entry.title}</p>
                {entry.subtitle && (
                  <p className="truncate text-xs text-muted-foreground">{entry.subtitle}</p>
                )}
              </div>
              {entry.meta && (
                <span className="shrink-0 text-xs text-muted-foreground/70">{entry.meta}</span>
              )}
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/20 transition-transform duration-150 group-hover/entry:-rotate-90" />
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              setEditingEntry({
                sectionType: section.type,
                sectionId: section.id,
                entryId: 'new',
              })
            }
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/20 py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Add {singularName}
          </button>
        </div>
      );
    },
    [getEntries]
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
            />
          );
        default:
          return null;
      }
    },
    [draftProfile, handleInlineUpdate, handleInlineEditingChange, handleEditComplete]
  );

  // ── Render a single section editor by type (for non-entry sections) ──
  const renderSection = (section: ProfileSection) => {
    const { type } = section;

    if (SKIPPED_SECTIONS.has(type)) return null;

    switch (type) {
      case 'BASIC_INFO':
        return (
          <div className="space-y-5">
            <PhotosSection
              profile={draftProfile}
              onUpdateAction={handleProfileUpdate}
              onInlineUpdate={handleInlineUpdate}
              embedded
            />
            <div className="border-t border-border/30" />
            <BasicInfoForm profile={draftProfile} onUpdate={handleProfileUpdate} embedded />
            <div className="border-t border-border/30" />
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

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSection((prev) => (prev === sectionId ? null : sectionId));
  }, []);
  // ── Full-panel edit mode: show only the focused entry editor ──
  if (editingEntry) {
    const section = orderedSections.find((s) => s.id === editingEntry.sectionId);
    const Icon = SECTION_ICONS[editingEntry.sectionType as SectionType] || LayoutGrid;
    const title = SECTION_TITLES[editingEntry.sectionType] || section?.title || 'Edit';

    return (
      <div>
        <button
          type="button"
          onClick={handleEditComplete}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors duration-200 hover:bg-muted/50"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <span className="flex-1 text-sm font-semibold">{title}</span>
        </button>
        <div className="mt-4">
          {renderSectionEditor(editingEntry.sectionType, editingEntry.entryId)}
        </div>
      </div>
    );
  }

  // ── Normal accordion view ──
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
      <div className="space-y-2.5">
        {orderedSections.map((section) => {
          const isExpanded = expandedSection === section.id;
          const Icon = SECTION_ICONS[section.type] || LayoutGrid;
          const title =
            section.type === 'CUSTOM'
              ? section.title || section.customName || 'Custom Section'
              : SECTION_TITLES[section.type] || section.title;

          return (
            <section
              key={section.id}
              id={`section-${section.type.toLowerCase()}`}
              data-section-type={section.type}
              className="group/section"
            >
              {/* Unified section container — header + content share one visual card */}
              <div
                className={cn(
                  'overflow-hidden rounded-xl border transition-all duration-200',
                  isExpanded
                    ? 'border-border/50 bg-background ring-1 ring-primary/10'
                    : 'border-border/30 bg-background/70 hover:border-border/50 hover:bg-background'
                )}
              >
                {/* Section card header */}
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors"
                >
                  <div
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-200',
                      isExpanded
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground group-hover/section:text-primary'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="flex-1 text-sm font-medium">{title}</span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-transform duration-200',
                      isExpanded && '-rotate-180 text-primary/60'
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
                      <div className="rounded-b-xl border-t border-border/20 bg-muted/50 px-5 pb-5 pt-4">
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
        })}
      </div>
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
    </>
  );
}
