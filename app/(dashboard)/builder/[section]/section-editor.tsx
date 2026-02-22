'use client';

import { Save, X } from 'lucide-react';
import { useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { notifyProfileUpdated } from '@/lib/events';
import {
  hasContactDraftChanges,
  hasProfileChanges,
  type ContactDraft,
} from '@/lib/stores/builder-store';

import { useBuilderStore } from '../components/builder-store-provider';
import { BasicInfoForm, ContactInfoForm } from '../sections/basic-info-form';
import { EducationSection } from '../sections/education-section';
import { ExperienceSection } from '../sections/experience-section';
import { LinksSection } from '../sections/links-section';
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
import { VolunteeringSection } from './volunteering-section';

import type { Award, Certification, FullProfile, ProfileSection } from '@/types';

interface SectionEditorProps {
  sectionType: string;
  section: ProfileSection | null;
}

const SECTION_TITLES: Record<string, string> = {
  BASIC_INFO: 'Basic Info',
  CONTACT: 'Contact',
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
  CUSTOM: 'Custom Section',
  SHARE: 'Share & Publish',
  SETTINGS: 'Settings',
};

/** Sections that use form-based editing and need explicit Save/Cancel */
const FORM_SECTIONS = new Set(['BASIC_INFO', 'CONTACT', 'PHOTOS', 'SUMMARY']);

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

  // ── Derived state ──
  const isFormSection = FORM_SECTIONS.has(sectionType);
  const profileChanged = hasProfileChanges(draftProfile, savedProfile);
  const contactChanged = hasContactDraftChanges(contactDraft, savedContact);
  const hasChanges =
    sectionType === 'CONTACT' ? contactChanged : isFormSection ? profileChanged : false;

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
    },
    [updateContactDraft]
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

  const handleSave = useCallback(async () => {
    if (!isFormSection) return;

    setSaving(true);
    try {
      // Save profile info (for BASIC_INFO, PHOTOS, SUMMARY)
      if (
        (sectionType === 'BASIC_INFO' || sectionType === 'PHOTOS' || sectionType === 'SUMMARY') &&
        profileChanged
      ) {
        const response = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: draftProfile.firstName,
            lastName: draftProfile.lastName,
            headline: draftProfile.headline,
            summary: draftProfile.summary,
            location: draftProfile.location,
            avatarUrl: draftProfile.avatarUrl,
            status: draftProfile.status,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to save profile');
        }
      }

      // Save contact info (for CONTACT section)
      if (sectionType === 'CONTACT' && contactChanged) {
        const contactResponse = await fetch('/api/profile/contact', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contactDraft),
        });

        if (!contactResponse.ok) {
          throw new Error('Failed to save contact info');
        }
      }

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
        return <BasicInfoForm profile={draftProfile} onUpdate={handleProfileUpdate} />;

      case 'SUMMARY':
        return <SummarySection profile={draftProfile} onUpdate={handleProfileUpdate} />;

      case 'CONTACT':
        return <ContactInfoForm profile={draftProfile} onContactUpdate={handleContactUpdate} />;

      case 'PHOTOS':
        return <PhotosSection profile={draftProfile} onUpdateAction={handleProfileUpdate} />;

      case 'EXPERIENCE':
        return (
          <ExperienceSection
            experiences={draftProfile.workExperiences}
            profileId={draftProfile.id}
            onUpdate={(workExperiences) => handleInlineUpdate({ workExperiences })}
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

      case 'LINKS':
        return (
          <LinksSection
            links={draftProfile.links}
            profileId={draftProfile.id}
            onUpdate={(links) => handleInlineUpdate({ links })}
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
            ? 'Update your basic profile information'
            : sectionType === 'SUMMARY'
              ? 'Write a brief introduction about yourself'
              : sectionType === 'CONTACT'
                ? 'Manage your contact information and visibility'
                : sectionType === 'PHOTOS'
                  ? 'Manage your profile photo and gallery images'
                  : sectionType === 'SHARE'
                    ? 'Control visibility and share your profile'
                    : 'Add, edit, or remove items'}
        </p>
      </div>

      {/* Editor Content */}
      {renderEditor()}

      {/* Save / Cancel bar — shown only for form-based sections with changes */}
      {isFormSection && (
        <div className="sticky bottom-0 z-10 -mx-5 border-t bg-background/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="flex-[4] gap-2"
              size="lg"
            >
              {isSaving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              variant="outline"
              onClick={handleDiscard}
              disabled={isSaving || !hasChanges}
              className="flex-1"
              size="lg"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
