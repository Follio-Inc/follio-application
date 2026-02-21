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
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { notifyProfileUpdated } from '@/lib/events';

import { AddSectionDialog } from './components/add-section-dialog';
import { ResumePreviewPanel } from './components/resume-preview-panel';
import { SortableSectionItem } from './components/sortable-section-item';

import type { FullProfile, ProfileSection, SectionType } from '@/types';
import { HEADER_SECTION_TYPES } from '@/types';

interface BuilderLayoutClientProps {
  profile: FullProfile;
  children: React.ReactNode;
}

export function BuilderLayoutClient({ profile, children }: BuilderLayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sections, setSections] = useState<ProfileSection[]>(profile.sections || []);
  const [isSaving, setIsSaving] = useState(false);

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

      notifyProfileUpdated();
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

  const headerSections = sections.filter((s) => HEADER_SECTION_TYPES.includes(s.type));
  const bodySections = sections.filter((s) => !HEADER_SECTION_TYPES.includes(s.type));

  return (
    <div className="flex h-[calc(100vh-3.5rem)] gap-3 bg-muted/40 p-3">
      <TooltipProvider delayDuration={300}>
        {/* Sidebar — Section Navigation */}
        <aside className="flex w-60 shrink-0 flex-col overflow-hidden rounded-xl bg-background shadow-sm">
          {/* Sidebar Header */}
          <div className="flex h-11 shrink-0 items-center justify-between px-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sections
            </span>
            {isSaving && <span className="text-[11px] text-muted-foreground/70">Saving...</span>}
          </div>

          {/* Section List with Drag & Drop */}
          <ScrollArea className="flex-1 px-2 pb-2">
            {headerSections.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  Header
                </p>
                <DndContext
                  id="builder-header-sections-dnd"
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                >
                  <SortableContext
                    items={headerSections.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <nav className="space-y-0.5">
                      {headerSections.map((section) => (
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
              </div>
            )}

            {bodySections.length > 0 && (
              <div>
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  Body
                </p>
                <DndContext
                  id="builder-body-sections-dnd"
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                >
                  <SortableContext
                    items={bodySections.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <nav className="space-y-0.5">
                      {bodySections.map((section) => (
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
              </div>
            )}

            {/* Add Section Button */}
            <div className="mt-3">
              <AddSectionDialog existingSections={sections} onAdd={handleAddSection} />
            </div>
          </ScrollArea>
        </aside>

        {/* Editor Content */}
        <main className="flex min-w-0 flex-[3] flex-col overflow-hidden rounded-xl bg-background shadow-sm">
          {/* Editor header */}
          <div className="flex h-11 shrink-0 items-center px-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Editor
            </span>
          </div>
          <div className="flex-1 overflow-auto">
            <div className="mx-auto max-w-4xl px-5 pb-8">{children}</div>
          </div>
        </main>

        {/* Resume Preview Panel */}
        <aside className="hidden min-w-0 flex-[4] flex-col overflow-hidden rounded-xl bg-background shadow-sm xl:flex">
          <ResumePreviewPanel profile={profile} />
        </aside>
      </TooltipProvider>
    </div>
  );
}
