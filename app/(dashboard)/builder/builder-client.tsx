'use client';

import { motion } from 'framer-motion';
import {
  AlertCircle,
  Briefcase,
  Check,
  Code,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderKanban,
  GraduationCap,
  Loader2,
  Save,
  Settings,
  Share2,
  Upload,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notifyProfileUpdated } from '@/lib/events';
import { getFollioPath } from '@/lib/url';
import { cn } from '@/lib/utils';

import { ImportDataDialog } from './components/import-data-dialog';
import { ImportResumeDialog } from '@/components/resume/import-resume-dialog';
import { UnsavedChangesDialog } from './components/unsaved-changes-dialog';
import { BasicInfoForm } from './sections/basic-info-form';
import { EducationSection } from './sections/education-section';
import { ExperienceSection } from './sections/experience-section';
import { ProjectsSection } from './sections/projects-section';
import { SettingsSection } from './sections/settings-section';
import { ShareSection } from './sections/share-section';
import { SkillsSection } from './sections/skills-section';
import { SummarySection } from './sections/summary-section';

import type { FullProfile, SectionCategory } from '@/types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface BuilderClientProps {
  initialProfile: FullProfile;
}

const sections = [
  { id: 'basic', label: 'Header', icon: User, category: 'header' as SectionCategory },
  { id: 'summary', label: 'Summary', icon: FileText, category: 'body' as SectionCategory },
  { id: 'experience', label: 'Experience', icon: Briefcase, category: 'body' as SectionCategory },
  { id: 'education', label: 'Education', icon: GraduationCap, category: 'body' as SectionCategory },
  { id: 'skills', label: 'Skills', icon: Code, category: 'body' as SectionCategory },
  { id: 'projects', label: 'Projects', icon: FolderKanban, category: 'body' as SectionCategory },
  { id: 'share', label: 'Share & Publish', icon: Share2, category: 'body' as SectionCategory },
  { id: 'settings', label: 'Settings', icon: Settings, category: 'body' as SectionCategory },
];

const sectionCategories: { key: SectionCategory; label: string }[] = [
  { key: 'header', label: 'Header' },
  { key: 'body', label: 'Body' },
];

export function BuilderClient({ initialProfile }: BuilderClientProps) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [activeSection, setActiveSection] = useState('basic');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [hasContactChanges, setHasContactChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showImportResumeDialog, setShowImportResumeDialog] = useState(false);
  const [isInlineEditing, setIsInlineEditing] = useState(false);

  // Contact info state
  const [contactInfo, setContactInfo] = useState({
    email: initialProfile.contactInfo?.email || '',
    emailPublic: initialProfile.contactInfo?.emailPublic || false,
    phone: initialProfile.contactInfo?.phone || '',
    phoneCountryCode:
      ((initialProfile.contactInfo as Record<string, unknown>)?.phoneCountryCode as
        | string
        | null) || null,
    phoneNumber:
      ((initialProfile.contactInfo as Record<string, unknown>)?.phoneNumber as string) || '',
    phonePublic: initialProfile.contactInfo?.phonePublic || false,
    website: initialProfile.contactInfo?.website || '',
    additionalEmails: (() => {
      try {
        const raw = initialProfile.contactInfo?.additionalEmails;
        if (Array.isArray(raw)) return raw as Array<{ email: string; source: string }>;
        if (typeof raw === 'string')
          return JSON.parse(raw) as Array<{ email: string; source: string }>;
        return [];
      } catch {
        return [];
      }
    })(),
    additionalPhones: (() => {
      try {
        const raw = (initialProfile.contactInfo as Record<string, unknown>)?.additionalPhones;
        if (Array.isArray(raw))
          return raw as Array<{ countryCode: string | null; number: string; source: string }>;
        if (typeof raw === 'string')
          return JSON.parse(raw) as Array<{
            countryCode: string | null;
            number: string;
            source: string;
          }>;
        return [];
      } catch {
        return [];
      }
    })(),
  });

  // Debounce timer ref for auto-save
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const AUTO_SAVE_DELAY = 2000; // 2 seconds

  // Detect whether the current resume has any meaningful content
  const hasExistingData =
    profile.workExperiences.length > 0 ||
    profile.educations.length > 0 ||
    profile.skills.length > 0 ||
    profile.projects.length > 0 ||
    !!profile.firstName ||
    !!profile.lastName ||
    !!profile.headline ||
    !!profile.summary;

  // Handle import completion - refresh the page to get updated data
  const handleImportComplete = useCallback(() => {
    router.refresh();
  }, [router]);

  // Warn user before closing/refreshing if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges || hasContactChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges, hasContactChanges]);

  // Auto-save function
  const performAutoSave = useCallback(async () => {
    if (!hasChanges && !hasContactChanges) return;

    setSaveStatus('saving');
    setIsSaving(true);

    try {
      // Save profile info
      if (hasChanges) {
        const response = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: profile.firstName,
            middleName: profile.middleName,
            lastName: profile.lastName,
            headline: profile.headline,
            summary: profile.summary,
            location: profile.location,
            avatarUrl: profile.avatarUrl,
            status: profile.status,
            syncAvatarToClerk: false,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to save profile');
        }
      }

      // Save contact info
      if (hasContactChanges) {
        const contactResponse = await fetch('/api/profile/contact', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contactInfo),
        });

        if (!contactResponse.ok) {
          throw new Error('Failed to save contact info');
        }
      }

      setHasChanges(false);
      setHasContactChanges(false);
      setSaveStatus('saved');
      notifyProfileUpdated();

      // Reset to idle after showing "saved" status
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Auto-save error:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }, [hasChanges, hasContactChanges, profile, contactInfo]);

  // Debounced auto-save on profile or contact changes
  useEffect(() => {
    if (hasChanges || hasContactChanges) {
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
  }, [hasChanges, hasContactChanges, profile, contactInfo, performAutoSave]);

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
    // Block navigation while a section is in inline-editing mode
    if (isInlineEditing) return;

    if (hasChanges || hasContactChanges) {
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

    // Reset contact info to initial values
    setContactInfo({
      email: initialProfile.contactInfo?.email || '',
      emailPublic: initialProfile.contactInfo?.emailPublic || false,
      phone: initialProfile.contactInfo?.phone || '',
      phoneCountryCode:
        ((initialProfile.contactInfo as Record<string, unknown>)?.phoneCountryCode as
          | string
          | null) || null,
      phoneNumber:
        ((initialProfile.contactInfo as Record<string, unknown>)?.phoneNumber as string) || '',
      phonePublic: initialProfile.contactInfo?.phonePublic || false,
      website: initialProfile.contactInfo?.website || '',
      additionalEmails: (() => {
        try {
          const raw = initialProfile.contactInfo?.additionalEmails;
          if (Array.isArray(raw)) return raw as Array<{ email: string; source: string }>;
          if (typeof raw === 'string')
            return JSON.parse(raw) as Array<{ email: string; source: string }>;
          return [];
        } catch {
          return [];
        }
      })(),
      additionalPhones: (() => {
        try {
          const raw = (initialProfile.contactInfo as Record<string, unknown>)?.additionalPhones;
          if (Array.isArray(raw))
            return raw as Array<{ countryCode: string | null; number: string; source: string }>;
          if (typeof raw === 'string')
            return JSON.parse(raw) as Array<{
              countryCode: string | null;
              number: string;
              source: string;
            }>;
          return [];
        } catch {
          return [];
        }
      })(),
    });

    setHasChanges(false);
    setHasContactChanges(false);
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

  // Check if there are any unsaved changes
  const anyUnsavedChanges = hasChanges || hasContactChanges;

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
        return anyUnsavedChanges ? (
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

      {/* Import Data Dialog */}
      <ImportDataDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        profileId={profile.id}
        onImportComplete={handleImportComplete}
      />

      {/* Import Resume Dialog */}
      <ImportResumeDialog
        open={showImportResumeDialog}
        onOpenChange={setShowImportResumeDialog}
        profileId={profile.id}
        hasExistingData={hasExistingData}
        onImportComplete={handleImportComplete}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Profile Builder</h1>
          <p className="text-muted-foreground">Edit your Follio profile</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Save Status Indicator */}
          {renderSaveStatus()}

          <Badge variant={profile.status === 'PUBLIC' ? 'default' : 'secondary'}>
            {profile.status.toLowerCase()}
          </Badge>
          <Link href={getFollioPath(profile.handle)} target="_blank">
            <Button variant="outline" size="sm" className="gap-2">
              <Eye className="h-4 w-4" />
              Preview
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
          <Button
            onClick={handleSave}
            disabled={isSaving || !anyUnsavedChanges}
            size="sm"
            className="gap-2"
          >
            {isSaving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Builder Layout - Sidebar + Main Content */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left Sidebar */}
        <div
          className={cn(
            'w-full space-y-4 transition-opacity duration-200 lg:w-64 lg:shrink-0',
            isInlineEditing && 'pointer-events-none opacity-50'
          )}
        >
          {/* Import Data Card */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">Quick Actions</h3>
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => setShowImportResumeDialog(true)}
              >
                <Upload className="h-4 w-4" />
                Import Resume
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => setShowImportDialog(true)}
              >
                <Download className="h-4 w-4" />
                Import Data
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Import from a PDF resume, LinkedIn, GitHub, or add links
            </p>
          </div>

          {/* Section Navigation - Desktop */}
          <div className="hidden rounded-lg border bg-card p-4 lg:block">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">Sections</h3>
            <nav className="space-y-4">
              {sectionCategories.map((cat) => (
                <div key={cat.key}>
                  <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {cat.label}
                  </p>
                  <div className="space-y-1">
                    {sections
                      .filter((s) => s.category === cat.key)
                      .map((section) => {
                        const Icon = section.icon;
                        return (
                          <button
                            key={section.id}
                            onClick={() => handleSectionChange(section.id)}
                            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                              activeSection === section.id
                                ? 'bg-primary text-primary-foreground'
                                : 'hover:bg-muted'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            {section.label}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="min-w-0 flex-1">
          {/* Mobile Tabs */}
          <Tabs
            value={activeSection}
            onValueChange={handleSectionChange}
            className={cn(
              'space-y-6 lg:hidden',
              isInlineEditing && 'pointer-events-none opacity-50'
            )}
          >
            {sectionCategories.map((cat) => (
              <div key={cat.key}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {cat.label}
                </p>
                <TabsList className="flex h-auto flex-wrap gap-2 bg-transparent p-0">
                  {sections
                    .filter((s) => s.category === cat.key)
                    .map((section) => {
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
              </div>
            ))}
          </Tabs>

          {/* Section Content */}
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeSection === 'basic' && (
              <BasicInfoForm profile={profile} onUpdate={handleProfileUpdate} />
            )}

            {activeSection === 'summary' && (
              <SummarySection profile={profile} onUpdate={handleProfileUpdate} />
            )}

            {activeSection === 'experience' && (
              <ExperienceSection
                experiences={profile.workExperiences}
                profileId={profile.id}
                onUpdate={(workExperiences) => handleProfileUpdate({ workExperiences })}
                onEditingStateChange={setIsInlineEditing}
              />
            )}

            {activeSection === 'education' && (
              <EducationSection
                educations={profile.educations}
                profileId={profile.id}
                onUpdate={(educations) => handleProfileUpdate({ educations })}
              />
            )}

            {activeSection === 'skills' && (
              <SkillsSection
                skills={profile.skills}
                skillGroups={profile.skillGroups}
                profileId={profile.id}
                onUpdate={(skills, skillGroups) => handleProfileUpdate({ skills, skillGroups })}
              />
            )}

            {activeSection === 'projects' && (
              <ProjectsSection
                projects={profile.projects}
                profileId={profile.id}
                onUpdate={(projects) => handleProfileUpdate({ projects })}
              />
            )}

            {activeSection === 'share' && (
              <ShareSection profile={profile} onUpdateAction={handleProfileUpdate} />
            )}

            {activeSection === 'settings' && (
              <SettingsSection profile={profile} onUpdate={handleProfileUpdate} />
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
