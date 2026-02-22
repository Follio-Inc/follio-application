'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Award,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Code,
  Contact,
  Eye,
  EyeOff,
  FileText,
  FolderKanban,
  Globe,
  GraduationCap,
  GripVertical,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  Link as LinkIcon,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { ProfileSection, SectionType } from '@/types';

// Icon mapping
const SECTION_ICONS: Record<SectionType, React.ComponentType<{ className?: string }>> = {
  BASIC_INFO: User,
  CONTACT: Contact,
  PHOTOS: ImageIcon,
  SUMMARY: FileText,
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

interface SortableSectionItemProps {
  section: ProfileSection;
  isActive: boolean;
  onToggleVisibility: (section: ProfileSection) => Promise<void>;
  onDelete: (section: ProfileSection) => Promise<{ success: boolean; error?: string }>;
}

export function SortableSectionItem({
  section,
  isActive,
  onToggleVisibility,
  onDelete,
}: SortableSectionItemProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = SECTION_ICONS[section.type] || LayoutGrid;
  const slug =
    section.type === 'CUSTOM' && section.customName
      ? `custom-${section.id}`
      : section.type.toLowerCase().replace(/_/g, '-');

  const canDelete = section.type !== 'BASIC_INFO';

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);

    const result = await onDelete(section);

    if (!result.success) {
      setDeleteError(result.error || 'Failed to delete section');
      setIsDeleting(false);
    } else {
      setDeleteDialogOpen(false);
    }
  };

  const handleToggleVisibility = async () => {
    setIsTogglingVisibility(true);
    try {
      await onToggleVisibility(section);
    } finally {
      setIsTogglingVisibility(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center rounded-lg transition-colors',
        isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
        isDragging && 'z-50 opacity-90 shadow-lg',
        !section.isVisible && 'opacity-50'
      )}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className={cn(
          'shrink-0 cursor-grab touch-none rounded-l-lg p-2 opacity-0 transition-opacity group-hover:opacity-100',
          isActive
            ? 'hover:bg-primary-foreground/25 hover:text-primary-foreground'
            : 'hover:bg-muted-foreground/15',
          isDragging && 'cursor-grabbing opacity-100'
        )}
        title="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Section Link */}
      <Link href={`/builder/${slug}`} className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-sm font-medium">{section.title}</span>
      </Link>

      {/* Actions */}
      <div className="mr-2 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {/* Visibility Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-6 w-6',
                isActive
                  ? 'hover:bg-primary-foreground/25 hover:text-primary-foreground'
                  : 'hover:bg-muted-foreground/15 hover:text-foreground',
                isTogglingVisibility && 'cursor-not-allowed opacity-50'
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleToggleVisibility();
              }}
              disabled={isTogglingVisibility}
            >
              {section.isVisible ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {section.isVisible ? 'Hide from profile' : 'Show on profile'}
          </TooltipContent>
        </Tooltip>

        {/* Delete Button */}
        {canDelete && (
          <AlertDialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              setDeleteDialogOpen(open);
              if (!open) setDeleteError(null);
            }}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-6 w-6',
                  isActive
                    ? 'text-primary-foreground hover:bg-primary-foreground/25 hover:text-red-200'
                    : 'hover:bg-destructive/15 hover:text-destructive'
                )}
                onClick={(e) => e.preventDefault()}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Section</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteError ? (
                    <span className="text-destructive">{deleteError}</span>
                  ) : (
                    <>
                      Are you sure you want to delete the &quot;{section.title}&quot; section? This
                      action cannot be undone.
                      <br />
                      <br />
                      <strong>Note:</strong> You can only delete empty sections. If you want to keep
                      the data but hide it from your public profile, use the hide option instead.
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                {deleteError ? (
                  <Button
                    onClick={() => {
                      setDeleteDialogOpen(false);
                      handleToggleVisibility();
                    }}
                    variant="outline"
                  >
                    Hide Instead
                  </Button>
                ) : (
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
