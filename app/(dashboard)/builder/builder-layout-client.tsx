'use client';

import {
  Award,
  BadgeCheck,
  BookOpen,
  Briefcase,
  ChevronLeft,
  Code,
  ExternalLink,
  Eye,
  EyeOff,
  FolderKanban,
  Globe,
  GraduationCap,
  Heart,
  LayoutGrid,
  Link as LinkIcon,
  PanelLeft,
  PanelLeftClose,
  Sparkles,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import type { FullProfile, ProfileSection, SectionType } from '@/types';

// Icon mapping
const SECTION_ICONS: Record<SectionType, React.ComponentType<{ className?: string }>> = {
  BASIC_INFO: User,
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

interface BuilderLayoutClientProps {
  profile: FullProfile;
  children: React.ReactNode;
}

export function BuilderLayoutClient({ profile, children }: BuilderLayoutClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [sections, setSections] = useState<ProfileSection[]>(profile.sections || []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch sections if not present
  useEffect(() => {
    if (!sections.length) {
      fetchSections();
    }
  }, []);

  const fetchSections = async () => {
    try {
      const response = await fetch('/api/profile/sections');
      if (response.ok) {
        const data = await response.json();
        setSections(data);
      }
    } catch (error) {
      console.error('Failed to fetch sections:', error);
    }
  };

  const getSectionSlug = (section: ProfileSection) => {
    if (section.type === 'CUSTOM' && section.customName) {
      return `custom-${section.id}`;
    }
    return section.type.toLowerCase().replace(/_/g, '-');
  };

  const isActiveSection = (section: ProfileSection) => {
    const slug = getSectionSlug(section);
    return pathname === `/builder/${slug}`;
  };

  const handleToggleVisibility = async (section: ProfileSection) => {
    const newVisibility = !section.isVisible;
    setSections((prev) =>
      prev.map((s) => (s.id === section.id ? { ...s, isVisible: newVisibility } : s))
    );

    try {
      await fetch(`/api/profile/sections/${section.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible: newVisibility }),
      });
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r bg-muted/30 transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between border-b p-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>

        {/* Section List */}
        <ScrollArea className="flex-1 p-2">
          <nav className="space-y-1">
            {sections.map((section) => {
              const Icon = SECTION_ICONS[section.type] || LayoutGrid;
              const isActive = isActiveSection(section);
              const slug = getSectionSlug(section);

              return (
                <div
                  key={section.id}
                  className={cn(
                    'group flex items-center rounded-lg transition-colors',
                    isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                >
                  <Link
                    href={`/builder/${slug}`}
                    className="flex flex-1 items-center gap-3 px-3 py-2"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{section.title}</span>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleToggleVisibility(section);
                    }}
                    className={cn(
                      'mr-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100',
                      isActive ? 'hover:bg-primary-foreground/20' : 'hover:bg-muted-foreground/20'
                    )}
                    title={section.isVisible ? 'Hide section' : 'Show section'}
                  >
                    {section.isVisible ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <EyeOff className="h-3 w-3" />
                    )}
                  </button>
                </div>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Sidebar Footer */}
        <div className="border-t p-4">
          <div className="mb-3 flex items-center gap-2">
            <Badge
              variant={profile.status === 'PUBLIC' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {profile.status.toLowerCase()}
            </Badge>
          </div>
          <Link href={`/u/${profile.handle}`} target="_blank">
            <Button variant="outline" size="sm" className="w-full gap-2">
              <Eye className="h-4 w-4" />
              Preview Profile
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </aside>

      {/* Toggle Sidebar Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-r-lg border border-l-0 bg-background p-2 shadow-sm hover:bg-muted"
        style={{ left: sidebarOpen ? '256px' : '0' }}
      >
        {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
      </button>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
