'use client';

import { motion } from 'framer-motion';
import {
  AlertCircle,
  Briefcase,
  Check,
  Code,
  ExternalLink,
  Eye,
  FolderKanban,
  GraduationCap,
  Link as LinkIcon,
  Loader2,
  Save,
  Settings,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { UnsavedChangesDialog } from './components/unsaved-changes-dialog';
import { BasicInfoForm } from './sections/basic-info-form';
import { EducationSection } from './sections/education-section';
import { ExperienceSection } from './sections/experience-section';
import { LinksSection } from './sections/links-section';
import { ProjectsSection } from './sections/projects-section';
import { SettingsSection } from './sections/settings-section';
import { SkillsSection } from './sections/skills-section';

import type { FullProfile } from '@/types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface BuilderClientProps {
  initialProfile: FullProfile;
}

const sections = [
  { id: 'basic', label: 'Basic Info', icon: User },
  { id: 'experience', label: 'Experience', icon: Briefcase },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'skills', label: 'Skills', icon: Code },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'links', label: 'Links', icon: LinkIcon },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function BuilderClient({ initialProfile }: BuilderClientProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [activeSection, setActiveSection] = useState('basic');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // Debounce timer ref for auto-save
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const AUTO_SAVE_DELAY = 2000; // 2 seconds

  // Warn user before closing/refreshing if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  // Auto-save function
  const performAutoSave = useCallback(async () => {
    if (!hasChanges) return;

    setSaveStatus('saving');
    setIsSaving(true);

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: profile.firstName,
          lastName: profile.lastName,
          headline: profile.headline,
          summary: profile.summary,
          location: profile.location,
          avatarUrl: profile.avatarUrl,
          status: profile.status,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      setHasChanges(false);
      setSaveStatus('saved');

      // Reset to idle after showing "saved" status
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Auto-save error:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }, [hasChanges, profile]);

  // Debounced auto-save on profile changes
  useEffect(() => {
    if (hasChanges) {
      // Clear existing timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      // Set new auto-save timer
      autoSaveTimerRef.current = setTimeout(() => {
        performAutoSave();
      }, AUTO_SAVE_DELAY);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [hasChanges, profile, performAutoSave]);

  const handleProfileUpdate = (updates: Partial<FullProfile>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
    setSaveStatus('idle'); // Reset status when new changes are made
  };

  const handleSave = async () => {
    // Cancel any pending auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    await performAutoSave();
  };

  // Handle section change with unsaved changes check
  const handleSectionChange = (newSection: string) => {
    if (hasChanges) {
      setPendingSection(newSection);
      setShowUnsavedDialog(true);
    } else {
      setActiveSection(newSection);
    }
  };

  // Save changes and navigate to pending section
  const handleSaveAndContinue = async () => {
    // Cancel any pending auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    await performAutoSave();

    setShowUnsavedDialog(false);
    if (pendingSection) {
      setActiveSection(pendingSection);
      setPendingSection(null);
    }
  };

  // Discard changes and navigate to pending section
  const handleDiscardChanges = () => {
    // Cancel any pending auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Reset profile to initial values for basic info fields
    setProfile((prev) => ({
      ...prev,
      firstName: initialProfile.firstName,
      lastName: initialProfile.lastName,
      headline: initialProfile.headline,
      summary: initialProfile.summary,
      location: initialProfile.location,
      avatarUrl: initialProfile.avatarUrl,
    }));

    setHasChanges(false);
    setSaveStatus('idle');
    setShowUnsavedDialog(false);
    if (pendingSection) {
      setActiveSection(pendingSection);
      setPendingSection(null);
    }
  };

  // Cancel navigation
  const handleCancelNavigation = () => {
    setShowUnsavedDialog(false);
    setPendingSection(null);
  };

  // Save status indicator component
  const renderSaveStatus = () => {
    switch (saveStatus) {
      case 'saving':
        return (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </div>
        );
      case 'saved':
        return (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Check className="h-4 w-4" />
            Saved
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            Save failed
          </div>
        );
      default:
        return hasChanges ? (
          <div className="text-sm text-muted-foreground">Unsaved changes</div>
        ) : null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onSaveAndContinue={handleSaveAndContinue}
        onDiscard={handleDiscardChanges}
        onCancel={handleCancelNavigation}
        isSaving={isSaving}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Profile Builder</h1>
          <p className="text-muted-foreground">Edit your Follio profile</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Save Status Indicator */}
          {renderSaveStatus()}

          <Badge variant={profile.status === 'PUBLIC' ? 'default' : 'secondary'}>
            {profile.status.toLowerCase()}
          </Badge>
          <Link href={`/u/${profile.handle}`} target="_blank">
            <Button variant="outline" size="sm" className="gap-2">
              <Eye className="h-4 w-4" />
              Preview
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            size="sm"
            className="gap-2"
          >
            {isSaving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Builder Tabs */}
      <Tabs value={activeSection} onValueChange={handleSectionChange} className="space-y-6">
        <TabsList className="flex h-auto flex-wrap gap-2 bg-transparent p-0">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <TabsTrigger
                key={section.id}
                value={section.id}
                className="gap-2 rounded-lg border bg-card px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Icon className="h-4 w-4" />
                {section.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <motion.div
          key={activeSection}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <TabsContent value="basic" className="mt-0">
            <BasicInfoForm profile={profile} onUpdate={handleProfileUpdate} />
          </TabsContent>

          <TabsContent value="experience" className="mt-0">
            <ExperienceSection
              experiences={profile.workExperiences}
              profileId={profile.id}
              onUpdate={(workExperiences) => handleProfileUpdate({ workExperiences })}
            />
          </TabsContent>

          <TabsContent value="education" className="mt-0">
            <EducationSection
              educations={profile.educations}
              profileId={profile.id}
              onUpdate={(educations) => handleProfileUpdate({ educations })}
            />
          </TabsContent>

          <TabsContent value="skills" className="mt-0">
            <SkillsSection
              skills={profile.skills}
              skillGroups={profile.skillGroups}
              profileId={profile.id}
              onUpdate={(skills, skillGroups) => handleProfileUpdate({ skills, skillGroups })}
            />
          </TabsContent>

          <TabsContent value="projects" className="mt-0">
            <ProjectsSection
              projects={profile.projects}
              profileId={profile.id}
              onUpdate={(projects) => handleProfileUpdate({ projects })}
            />
          </TabsContent>

          <TabsContent value="links" className="mt-0">
            <LinksSection
              links={profile.links}
              profileId={profile.id}
              onUpdate={(links) => handleProfileUpdate({ links })}
            />
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <SettingsSection profile={profile} onUpdate={handleProfileUpdate} />
          </TabsContent>
        </motion.div>
      </Tabs>
    </div>
  );
}
