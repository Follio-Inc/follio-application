'use client';

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  ChevronLeft,
  Download,
  Github,
  PanelLeft,
  PanelLeftClose,
  Settings,
  Share2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ImportDataDialog } from './components/import-data-dialog';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { AddSectionDialog } from './components/add-section-dialog';
import { SortableSectionItem } from './components/sortable-section-item';

import type { FullProfile, ProfileSection, SectionType } from '@/types';

interface BuilderLayoutClientProps {
  profile: FullProfile;
  children: React.ReactNode;
}

export function BuilderLayoutClient({ profile, children }: BuilderLayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sections, setSections] = useState<ProfileSection[]>(profile.sections || []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch sections if not present
  useEffect(() => {
    if (!sections.length) {
      fetchSections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.length]);

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

  const handleToggleVisibility = async (section: ProfileSection): Promise<void> => {
    const newVisibility = !section.isVisible;
    setSections((prev) =>
      prev.map((s) => (s.id === section.id ? { ...s, isVisible: newVisibility } : s))
    );

    try {
      const response = await fetch(`/api/profile/sections/${section.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible: newVisibility }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle visibility');
      }
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
      // Revert on error
      setSections((prev) =>
        prev.map((s) => (s.id === section.id ? { ...s, isVisible: !newVisibility } : s))
      );
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);

      const newSections = arrayMove(sections, oldIndex, newIndex);

      // Update sortOrder for all sections
      const updatedSections = newSections.map((s, index) => ({
        ...s,
        sortOrder: index,
      }));

      setSections(updatedSections);

      // Save to backend
      setIsSaving(true);
      try {
        await fetch('/api/profile/sections', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sections: updatedSections.map((s) => ({
              id: s.id,
              sortOrder: s.sortOrder,
            })),
          }),
        });
      } catch (error) {
        console.error('Failed to save section order:', error);
        // Revert on error
        fetchSections();
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleAddSection = async (type: SectionType, customName?: string, title?: string) => {
    try {
      const response = await fetch('/api/profile/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, customName, title }),
      });

      if (response.ok) {
        const newSection = await response.json();
        setSections((prev) => [...prev, newSection]);

        // Navigate to the new section
        const slug = getSectionSlug(newSection);
        router.push(`/builder/${slug}`);
      } else {
        const error = await response.json();
        console.error('Failed to add section:', error);
      }
    } catch (error) {
      console.error('Failed to add section:', error);
    }
  };

  const handleDeleteSection = async (
    section: ProfileSection
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`/api/profile/sections/${section.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.message || 'Failed to delete section',
        };
      }

      // Remove from local state on success
      setSections((prev) => prev.filter((s) => s.id !== section.id));

      // Navigate to basic-info if we deleted the current section
      if (isActiveSection(section)) {
        router.push('/builder/basic-info');
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to delete section:', error);
      return { success: false, error: 'Failed to delete section' };
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
            href="/me"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
          {isSaving && <span className="text-xs text-muted-foreground">Saving...</span>}
        </div>

        {/* Section List with Drag & Drop */}
        <ScrollArea className="flex-1 p-2">
          {/* Import & Sync Section */}
          <nav className="space-y-1">
            <button
              onClick={() => setImportDialogOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
            >
              <Download className="h-4 w-4 shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Import & Sync</span>
                <span className="text-xs text-muted-foreground">
                  Pull from LinkedIn, GitHub, Resume
                </span>
              </div>
            </button>
            {/* GitHub Repositories - dedicated section for managing repos */}
            <Link
              href="/builder/github"
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                pathname === '/builder/github'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
            >
              <Github className="h-4 w-4 shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">GitHub Repos</span>
                <span
                  className={cn(
                    'text-xs',
                    pathname === '/builder/github'
                      ? 'text-primary-foreground/70'
                      : 'text-muted-foreground'
                  )}
                >
                  Manage repository visibility
                </span>
              </div>
            </Link>
          </nav>

          <Separator className="my-3" />

          {/* Profile Sections */}
          <DndContext
            id="builder-sections-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <nav className="space-y-1">
                {sections.map((section) => (
                  <SortableSectionItem
                    key={section.id}
                    section={section}
                    isActive={isActiveSection(section)}
                    onToggleVisibility={handleToggleVisibility}
                    onDelete={handleDeleteSection}
                  />
                ))}
              </nav>
            </SortableContext>
          </DndContext>

          {/* Add Section Button */}
          <div className="mt-3">
            <AddSectionDialog existingSections={sections} onAdd={handleAddSection} />
          </div>

          {/* Separator and Share Link */}
          <Separator className="my-3" />
          <nav className="space-y-1">
            <Link
              href="/builder/share"
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                pathname === '/builder/share'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
            >
              <Share2 className="h-4 w-4 shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Share & Publish</span>
                <span
                  className={cn(
                    'text-xs',
                    pathname === '/builder/share'
                      ? 'text-primary-foreground/70'
                      : 'text-muted-foreground'
                  )}
                >
                  Get your public profile link
                </span>
              </div>
            </Link>
            {/* Settings */}
            <Link
              href="/builder/settings"
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                pathname === '/builder/settings'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Settings</span>
                <span
                  className={cn(
                    'text-xs',
                    pathname === '/builder/settings'
                      ? 'text-primary-foreground/70'
                      : 'text-muted-foreground'
                  )}
                >
                  Account & preferences
                </span>
              </div>
            </Link>
          </nav>
        </ScrollArea>

        {/* Import Data Dialog */}
        <ImportDataDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          profileId={profile.id}
          onImportComplete={() => {
            // Refresh the page to show updated data
            router.refresh();
          }}
        />
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
