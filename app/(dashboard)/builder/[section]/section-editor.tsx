'use client';

import { Save } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { BasicInfoForm } from '../sections/basic-info-form';
import { EducationSection } from '../sections/education-section';
import { ExperienceSection } from '../sections/experience-section';
import { LinksSection } from '../sections/links-section';
import { ProjectsSection } from '../sections/projects-section';
import { ShareSection } from '../sections/share-section';
import { SkillsSection } from '../sections/skills-section';
import { AwardsSection } from './awards-section';
import { CertificationsSection } from './certifications-section';
import { CustomSection } from './custom-section';
import { InterestsSection } from './interests-section';
import { LanguagesSection } from './languages-section';
import { PublicationsSection } from './publications-section';
import { VolunteeringSection } from './volunteering-section';

import type { Award, Certification, FullProfile, ProfileSection } from '@/types';

interface SectionEditorProps {
  profile: FullProfile;
  sectionType: string;
  section: ProfileSection | null;
  customSectionId: string | null;
}

const SECTION_TITLES: Record<string, string> = {
  BASIC_INFO: 'Basic Info',
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
  SHARE: 'Share & Publish',
};

export function SectionEditor({
  profile,
  sectionType,
  section,
  customSectionId,
}: SectionEditorProps) {
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleProfileUpdate = (updates: Partial<FullProfile>) => {
    setCurrentProfile((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (sectionType !== 'BASIC_INFO') {
      // For non-basic info sections, changes are saved inline
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: currentProfile.firstName,
          lastName: currentProfile.lastName,
          headline: currentProfile.headline,
          summary: currentProfile.summary,
          location: currentProfile.location,
          avatarUrl: currentProfile.avatarUrl,
          status: currentProfile.status,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      setHasChanges(false);
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const renderEditor = () => {
    switch (sectionType) {
      case 'BASIC_INFO':
        return <BasicInfoForm profile={currentProfile} onUpdate={handleProfileUpdate} />;

      case 'EXPERIENCE':
        return (
          <ExperienceSection
            experiences={currentProfile.workExperiences}
            profileId={currentProfile.id}
            onUpdate={(workExperiences) => handleProfileUpdate({ workExperiences })}
          />
        );

      case 'EDUCATION':
        return (
          <EducationSection
            educations={currentProfile.educations}
            profileId={currentProfile.id}
            onUpdate={(educations) => handleProfileUpdate({ educations })}
          />
        );

      case 'SKILLS':
        return (
          <SkillsSection
            skills={currentProfile.skills}
            skillGroups={currentProfile.skillGroups}
            profileId={currentProfile.id}
            onUpdate={(skills, skillGroups) => handleProfileUpdate({ skills, skillGroups })}
          />
        );

      case 'PROJECTS':
        return (
          <ProjectsSection
            projects={currentProfile.projects}
            profileId={currentProfile.id}
            onUpdate={(projects) => handleProfileUpdate({ projects })}
          />
        );

      case 'LINKS':
        return (
          <LinksSection
            links={currentProfile.links}
            profileId={currentProfile.id}
            onUpdate={(links) => handleProfileUpdate({ links })}
          />
        );

      case 'AWARDS':
        return (
          <AwardsSection
            awards={currentProfile.awards}
            profileId={currentProfile.id}
            onUpdate={(awards: Award[]) => handleProfileUpdate({ awards })}
          />
        );

      case 'CERTIFICATIONS':
        return (
          <CertificationsSection
            certifications={currentProfile.certifications}
            profileId={currentProfile.id}
            onUpdate={(certifications: Certification[]) => handleProfileUpdate({ certifications })}
          />
        );

      case 'VOLUNTEERING':
        return <VolunteeringSection section={section} profileId={currentProfile.id} />;

      case 'LANGUAGES':
        return <LanguagesSection section={section} profileId={currentProfile.id} />;

      case 'PUBLICATIONS':
        return <PublicationsSection section={section} profileId={currentProfile.id} />;

      case 'INTERESTS':
        return <InterestsSection section={section} profileId={currentProfile.id} />;

      case 'CUSTOM':
        return <CustomSection section={section} profileId={currentProfile.id} />;

      case 'SHARE':
        return <ShareSection profile={currentProfile} onUpdateAction={handleProfileUpdate} />;

      // Placeholder for sections not yet implemented
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {section?.title || SECTION_TITLES[sectionType] || 'Edit Section'}
          </h1>
          <p className="text-muted-foreground">
            {sectionType === 'BASIC_INFO'
              ? 'Update your basic profile information'
              : sectionType === 'SHARE'
                ? 'Control visibility and share your profile'
                : 'Add, edit, or remove items'}
          </p>
        </div>
        {sectionType === 'BASIC_INFO' && (
          <Button onClick={handleSave} disabled={isSaving || !hasChanges} className="gap-2">
            {isSaving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </div>

      {/* Editor Content */}
      {renderEditor()}
    </div>
  );
}
