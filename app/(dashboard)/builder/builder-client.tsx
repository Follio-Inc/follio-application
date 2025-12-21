'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  User,
  Briefcase,
  GraduationCap,
  Code,
  FolderKanban,
  Award,
  Link as LinkIcon,
  Settings,
  Save,
  Eye,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';

import { BasicInfoForm } from './sections/basic-info-form';
import { ExperienceSection } from './sections/experience-section';
import { EducationSection } from './sections/education-section';
import { SkillsSection } from './sections/skills-section';
import { ProjectsSection } from './sections/projects-section';
import { LinksSection } from './sections/links-section';
import { SettingsSection } from './sections/settings-section';

import type { FullProfile } from '@/types';

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

  const handleProfileUpdate = (updates: Partial<FullProfile>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const handleSave = async () => {
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
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Profile Builder</h1>
          <p className="text-muted-foreground">Edit your Follio profile</p>
        </div>
        <div className="flex items-center gap-3">
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
      <Tabs value={activeSection} onValueChange={setActiveSection} className="space-y-6">
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
