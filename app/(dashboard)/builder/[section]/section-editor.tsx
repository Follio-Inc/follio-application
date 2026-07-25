'use client';

import { useCallback } from 'react';

import { notifyProfileUpdated } from '@/lib/events';
import {
  hasContactDraftChanges,
  hasProfileChanges,
  type ContactDraft,
} from '@/lib/stores/builder-store';

import { useBuilderStore } from '../components/builder-store-provider';
import { FormSaveBar } from '../components/form-save-bar';
import { saveProfileDraft } from '../lib/save-profile-draft';
import { BasicInfoForm } from '../sections/basic-info-form';
import { ContactDetailsSection } from '../sections/contact-details-section';
import { EducationSection } from '../sections/education-section';
import { ExperienceSection } from '../sections/experience-section';
import { PhotosSection } from '../sections/photos-section';
import { ProjectsSection } from '../sections/projects-section';
import { SettingsSection } from '../sections/settings-section';
import { ShareSection } from '../sections/share-section';
import { SkillsSection } from '../sections/skills-section';
import { SummarySection } from '../sections/summary-section';
import { AwardsSection } from './awards-section';
import { CertificationsSection } from './certifications-section';
import { CustomSection } from './custom-section';
import { InterestsSection } from './interests-section';
import { LanguagesSection } from './languages-section';
import { PublicationsSection } from './publications-section';
import { ReferencesSection } from './references-section';
import { VolunteeringSection } from './volunteering-section';

import type { Award, Certification, FullProfile, ProfileSection } from '@/types';

interface SectionEditorProps {
  sectionType: string;
  section: ProfileSection | null;
}

const SECTION_TITLES: Record<string, string> = {
  BASIC_INFO: 'Header',
  PHOTOS: 'Photos',
  SUMMARY: 'Summary',
  EXPERIENCE: 'Work Experience',
  EDUCATION: 'Education',
  SKILLS: 'Skills',
  PROJECTS: 'Projects',
  GITHUB: 'GitHub Repositories',
  LINKS: 'Links',
  AWARDS: 'Awards',
  CERTIFICATIONS: 'Certifications',
  PUBLICATIONS: 'Publications',
  VOLUNTEERING: 'Volunteering',
  LANGUAGES: 'Languages',
  INTERESTS: 'Interests',
  REFERENCES: 'References',
  CUSTOM: 'Custom Section',
  SHARE: 'Share & Publish',
  SETTINGS: 'Settings',
};

/** Sections that use form-based editing and need explicit Save/Cancel */
const FORM_SECTIONS = new Set(['BASIC_INFO', 'PHOTOS', 'SUMMARY']);

export function SectionEditor({ sectionType, section }: SectionEditorProps) {
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
  const isFormSection = FORM_SECTIONS.has(sectionType);
  const profileChanged = hasProfileChanges(draftProfile, savedProfile);
  const contactChanged = hasContactDraftChanges(contactDraft, savedContact);
  const hasChanges = isFormSection ? profileChanged || contactChanged : false;

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
      // 2. If ContactDetailsSection remounts, it rebuilds from up-to-date contactInfo
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

  /**
   * For list sections (Experience, Education, etc.) that save inline via their
   * own dialogs — update both draft and saved so the preview refreshes AND the
   * saved state stays in sync.
   */
  const handleInlineUpdate = useCallback(
    (updates: Partial<FullProfile>) => {
      commitInlineChange(updates);
    },
    [commitInlineChange]
  );

  /**
   * Called by inline-editing sections (e.g. Experience) to signal that
   * they've entered or exited editing mode, so the sidebar can be blocked.
   */
  const handleInlineEditingChange = useCallback(
    (isEditing: boolean) => {
      setInlineEditing(isEditing);
    },
    [setInlineEditing]
  );

  const handleSave = useCallback(async () => {
    if (!isFormSection) return;

    setSaving(true);
    try {
      await saveProfileDraft({
        draftProfile,
        contactDraft,
        shouldSaveProfile: profileChanged,
        shouldSaveContact: sectionType === 'BASIC_INFO' && contactChanged,
      });

      // Sync saved state to current draft
      markSaved();

      // Notify other parts of the app (e.g., public profile)
      notifyProfileUpdated();
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setSaving(false);
    }
  }, [
    isFormSection,
    sectionType,
    profileChanged,
    contactChanged,
    draftProfile,
    contactDraft,
    markSaved,
    setSaving,
  ]);

  const handleDiscard = useCallback(() => {
    discardChanges();
  }, [discardChanges]);

  // ── Render section editor ──
  const renderEditor = () => {
    switch (sectionType) {
      case 'BASIC_INFO':
        return (
          <>
            <PhotosSection
              profile={draftProfile}
              onUpdateAction={handleProfileUpdate}
              onInlineUpdate={handleInlineUpdate}
            />
            <BasicInfoForm profile={draftProfile} onUpdate={handleProfileUpdate} />
            <ContactDetailsSection
              profile={draftProfile}
              onProfileUpdate={handleProfileUpdate}
              onContactUpdate={handleContactUpdate}
              onLinksUpdate={(links) => handleInlineUpdate({ links })}
            />
          </>
        );

      case 'SUMMARY':
        return <SummarySection profile={draftProfile} onUpdate={handleProfileUpdate} />;

      case 'EXPERIENCE':
        return (
          <ExperienceSection
            experiences={draftProfile.workExperiences}
            profileId={draftProfile.id}
            onUpdate={(workExperiences) => handleInlineUpdate({ workExperiences })}
            onEditingStateChange={handleInlineEditingChange}
          />
        );

      case 'EDUCATION':
        return (
          <EducationSection
            educations={draftProfile.educations}
            profileId={draftProfile.id}
            onUpdate={(educations) => handleInlineUpdate({ educations })}
          />
        );

      case 'SKILLS':
        return (
          <SkillsSection
            skills={draftProfile.skills}
            skillGroups={draftProfile.skillGroups}
            profileId={draftProfile.id}
            onUpdate={(skills, skillGroups) => handleInlineUpdate({ skills, skillGroups })}
          />
        );

      case 'PROJECTS':
        return (
          <ProjectsSection
            projects={draftProfile.projects}
            profileId={draftProfile.id}
            onUpdate={(projects) => handleInlineUpdate({ projects })}
          />
        );

      case 'AWARDS':
        return (
          <AwardsSection
            awards={draftProfile.awards}
            profileId={draftProfile.id}
            onUpdate={(awards: Award[]) => handleInlineUpdate({ awards })}
          />
        );

      case 'CERTIFICATIONS':
        return (
          <CertificationsSection
            certifications={draftProfile.certifications}
            profileId={draftProfile.id}
            onUpdate={(certifications: Certification[]) => handleInlineUpdate({ certifications })}
          />
        );

      case 'VOLUNTEERING':
        return <VolunteeringSection section={section} profileId={draftProfile.id} />;

      case 'LANGUAGES':
        return <LanguagesSection section={section} profileId={draftProfile.id} />;

      case 'PUBLICATIONS':
        return <PublicationsSection section={section} profileId={draftProfile.id} />;

      case 'INTERESTS':
        return <InterestsSection section={section} profileId={draftProfile.id} />;

      case 'REFERENCES':
        return <ReferencesSection section={section} profileId={draftProfile.id} />;

      case 'CUSTOM':
        return <CustomSection section={section} profileId={draftProfile.id} />;

      case 'SHARE':
        return <ShareSection profile={draftProfile} onUpdateAction={handleProfileUpdate} />;

      case 'SETTINGS':
        return <SettingsSection profile={draftProfile} onUpdate={handleProfileUpdate} />;

      default:
        return (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">
              Editor for {SECTION_TITLES[sectionType] || sectionType} is coming soon.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">
          {section?.title || SECTION_TITLES[sectionType] || 'Edit Section'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {sectionType === 'BASIC_INFO'
            ? 'Update your profile information and contact details'
            : sectionType === 'SUMMARY'
              ? 'Write a brief introduction about yourself'
              : sectionType === 'PHOTOS'
                ? 'Manage your profile photo and gallery images'
                : sectionType === 'SHARE'
                  ? 'Control visibility and share your profile'
                  : 'Add, edit, or remove items'}
        </p>
      </div>

      {/* Editor Content */}
      {renderEditor()}

      <FormSaveBar
        show={isFormSection}
        canSave={hasChanges}
        isSaving={isSaving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
