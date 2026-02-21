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
import { ChevronLeft, ChevronRight, PanelLeft, PanelLeftClose, PanelRight } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { type PanelSize, usePanelRef } from 'react-resizable-panels';

import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { notifyProfileUpdated } from '@/lib/events';
import { cn } from '@/lib/utils';

import { AddSectionDialog } from './components/add-section-dialog';
import { ResumePreviewPanel } from './components/resume-preview-panel';
import { SortableSectionItem } from './components/sortable-section-item';

import type { FullProfile, ProfileSection, SectionType } from '@/types';
import { HEADER_SECTION_TYPES } from '@/types';

interface BuilderLayoutClientProps {
  profile: FullProfile;
  children: React.ReactNode;
}

// Panel size constants (string-based for v4 API)
const SIDEBAR_DEFAULT_SIZE = '15%';
const SIDEBAR_MIN_SIZE = '10%';
const SIDEBAR_COLLAPSED_SIZE = '0%';
const EDITOR_DEFAULT_SIZE = '25%';
const EDITOR_MIN_SIZE = '15%';
const EDITOR_COLLAPSED_SIZE = '0%';
const PREVIEW_DEFAULT_SIZE = '60%';
const PREVIEW_MIN_SIZE = '20%';

export function BuilderLayoutClient({ profile, children }: BuilderLayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sections, setSections] = useState<ProfileSection[]>(profile.sections || []);
  const [isSaving, setIsSaving] = useState(false);

  // Panel refs for imperative collapse/expand
  const sidebarPanelRef = usePanelRef();
  const editorPanelRef = usePanelRef();
  const previewPanelRef = usePanelRef();

  // Collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);

  const toggleSidebar = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (sidebarCollapsed) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [sidebarCollapsed, sidebarPanelRef]);

  const toggleEditor = useCallback(() => {
    const panel = editorPanelRef.current;
    if (!panel) return;
    if (editorCollapsed) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [editorCollapsed, editorPanelRef]);

  const togglePreview = useCallback(() => {
    const panel = previewPanelRef.current;
    if (!panel) return;
    if (previewCollapsed) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [previewCollapsed, previewPanelRef]);

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

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)]">
      <TooltipProvider delayDuration={300}>
        <ResizablePanelGroup orientation="horizontal" id="builder-layout">
          {/* Sidebar — Section Navigation */}
          <ResizablePanel
            id="sidebar"
            panelRef={sidebarPanelRef}
            defaultSize={SIDEBAR_DEFAULT_SIZE}
            minSize={SIDEBAR_MIN_SIZE}
            collapsible
            collapsedSize={SIDEBAR_COLLAPSED_SIZE}
            onResize={(size: PanelSize) => {
              setSidebarCollapsed(size.asPercentage < 1);
            }}
            className={cn(
              'flex flex-col bg-muted/30 transition-all',
              sidebarCollapsed && 'min-w-0'
            )}
          >
            {/* Sidebar Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Sections</span>
              <div className="flex items-center gap-1">
                {isSaving && <span className="text-xs text-muted-foreground">Saving...</span>}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleSidebar}>
                      <PanelLeftClose className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Collapse sidebar</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Section List with Drag & Drop */}
            <ScrollArea className="flex-1 p-2">
              {/* Header Sections */}
              {(() => {
                const headerSections = sections.filter((s) =>
                  HEADER_SECTION_TYPES.includes(s.type)
                );
                const bodySections = sections.filter((s) => !HEADER_SECTION_TYPES.includes(s.type));
                return (
                  <>
                    {headerSections.length > 0 && (
                      <div className="mb-3">
                        <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                            <nav className="space-y-1">
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
                        <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                            <nav className="space-y-1">
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
                  </>
                );
              })()}

              {/* Add Section Button */}
              <div className="mt-3">
                <AddSectionDialog existingSections={sections} onAdd={handleAddSection} />
              </div>
            </ScrollArea>
          </ResizablePanel>

          {/* Handle between sidebar and editor */}
          <ResizableHandle withHandle />

          {/* Collapsed sidebar indicator */}
          {sidebarCollapsed && (
            <div className="flex flex-col items-center border-r bg-muted/30 py-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSidebar}>
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand sidebar</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Editor Content */}
          <ResizablePanel
            id="editor"
            panelRef={editorPanelRef}
            defaultSize={EDITOR_DEFAULT_SIZE}
            minSize={EDITOR_MIN_SIZE}
            collapsible
            collapsedSize={EDITOR_COLLAPSED_SIZE}
            onResize={(size: PanelSize) => {
              setEditorCollapsed(size.asPercentage < 1);
            }}
            className={cn('flex flex-col transition-all', editorCollapsed && 'min-w-0')}
          >
            {/* Editor header with collapse controls */}
            <div className="flex items-center justify-between border-b bg-background px-4 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Editor
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleEditor}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Collapse editor</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex-1 overflow-auto">
              <div className="mx-auto max-w-4xl px-6 py-8">{children}</div>
            </div>
          </ResizablePanel>

          {/* Handle between editor and preview */}
          <ResizableHandle withHandle />

          {/* Collapsed editor indicator */}
          {editorCollapsed && (
            <div className="flex flex-col items-center border-r bg-background py-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleEditor}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand editor</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Resume Preview Panel */}
          <ResizablePanel
            id="preview"
            panelRef={previewPanelRef}
            defaultSize={PREVIEW_DEFAULT_SIZE}
            minSize={PREVIEW_MIN_SIZE}
            collapsible
            collapsedSize="0%"
            onResize={(size: PanelSize) => {
              setPreviewCollapsed(size.asPercentage < 1);
            }}
            className={cn(
              'flex flex-col bg-muted/20 transition-all',
              previewCollapsed && 'min-w-0'
            )}
          >
            <ResumePreviewPanel profile={profile} />
          </ResizablePanel>

          {/* Collapsed preview indicator */}
          {previewCollapsed && (
            <div className="flex flex-col items-center border-l bg-muted/20 py-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={togglePreview}>
                    <PanelRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Expand preview</TooltipContent>
              </Tooltip>
            </div>
          )}
        </ResizablePanelGroup>
      </TooltipProvider>
    </div>
  );
}
