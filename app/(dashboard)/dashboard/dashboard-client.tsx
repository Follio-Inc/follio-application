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
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Award,
  BadgeCheck,
  BookOpen,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Code,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  FolderKanban,
  Globe,
  GraduationCap,
  GripVertical,
  Heart,
  LayoutGrid,
  Link as LinkIcon,
  Plus,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';

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

// Addable section types (not BASIC_INFO as it can't be added)
const ADDABLE_SECTIONS: { type: SectionType; label: string }[] = [
  { type: 'EXPERIENCE', label: 'Experience' },
  { type: 'EDUCATION', label: 'Education' },
  { type: 'SKILLS', label: 'Skills' },
  { type: 'PROJECTS', label: 'Projects' },
  { type: 'LINKS', label: 'Links' },
  { type: 'AWARDS', label: 'Awards' },
  { type: 'CERTIFICATIONS', label: 'Certifications' },
  { type: 'PUBLICATIONS', label: 'Publications' },
  { type: 'VOLUNTEERING', label: 'Volunteering' },
  { type: 'LANGUAGES', label: 'Languages' },
  { type: 'INTERESTS', label: 'Interests' },
  { type: 'CUSTOM', label: 'Custom Section' },
];

interface DashboardClientProps {
  initialProfile: FullProfile;
}

interface SortableSectionProps {
  section: ProfileSection;
  profile: FullProfile;
  onToggleVisibility: (id: string, isVisible: boolean) => void;
  onDelete: (id: string) => void;
}

function SortableSection({ section, profile, onToggleVisibility, onDelete }: SortableSectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = SECTION_ICONS[section.type] || LayoutGrid;

  // Get section content preview
  const getContentPreview = () => {
    switch (section.type) {
      case 'BASIC_INFO':
        return (
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={profile.avatarUrl || undefined} />
              <AvatarFallback>
                {profile.firstName?.[0]}
                {profile.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">
                {profile.firstName} {profile.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{profile.headline || 'No headline'}</p>
            </div>
          </div>
        );
      case 'EXPERIENCE':
        return profile.workExperiences.length > 0 ? (
          <div className="space-y-2">
            {profile.workExperiences.slice(0, 2).map((exp) => (
              <div key={exp.id} className="text-sm">
                <span className="font-medium">{exp.role}</span>
                <span className="text-muted-foreground"> at {exp.company}</span>
              </div>
            ))}
            {profile.workExperiences.length > 2 && (
              <p className="text-xs text-muted-foreground">
                +{profile.workExperiences.length - 2} more
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No experiences added</p>
        );
      case 'EDUCATION':
        return profile.educations.length > 0 ? (
          <div className="space-y-2">
            {profile.educations.slice(0, 2).map((edu) => (
              <div key={edu.id} className="text-sm">
                <span className="font-medium">{edu.degree || edu.institution}</span>
                {edu.degree && <span className="text-muted-foreground"> at {edu.institution}</span>}
              </div>
            ))}
            {profile.educations.length > 2 && (
              <p className="text-xs text-muted-foreground">+{profile.educations.length - 2} more</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No education added</p>
        );
      case 'SKILLS':
        return profile.skills.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {profile.skills.slice(0, 8).map((skill) => (
              <Badge key={skill.id} variant="secondary" className="text-xs">
                {skill.name}
              </Badge>
            ))}
            {profile.skills.length > 8 && (
              <Badge variant="outline" className="text-xs">
                +{profile.skills.length - 8}
              </Badge>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No skills added</p>
        );
      case 'PROJECTS':
        return profile.projects.length > 0 ? (
          <div className="space-y-2">
            {profile.projects.slice(0, 2).map((project) => (
              <div key={project.id} className="text-sm">
                <span className="font-medium">{project.title}</span>
                {project.shortDesc && (
                  <span className="text-muted-foreground"> - {project.shortDesc}</span>
                )}
              </div>
            ))}
            {profile.projects.length > 2 && (
              <p className="text-xs text-muted-foreground">+{profile.projects.length - 2} more</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No projects added</p>
        );
      case 'LINKS':
        return profile.links.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {profile.links.slice(0, 4).map((link) => (
              <Badge key={link.id} variant="outline" className="text-xs">
                {link.label || link.type}
              </Badge>
            ))}
            {profile.links.length > 4 && (
              <Badge variant="outline" className="text-xs">
                +{profile.links.length - 4}
              </Badge>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No links added</p>
        );
      case 'AWARDS':
        return profile.awards.length > 0 ? (
          <div className="space-y-1">
            {profile.awards.slice(0, 2).map((award) => (
              <p key={award.id} className="text-sm font-medium">
                {award.title}
              </p>
            ))}
            {profile.awards.length > 2 && (
              <p className="text-xs text-muted-foreground">+{profile.awards.length - 2} more</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No awards added</p>
        );
      case 'CERTIFICATIONS':
        return profile.certifications.length > 0 ? (
          <div className="space-y-1">
            {profile.certifications.slice(0, 2).map((cert) => (
              <p key={cert.id} className="text-sm font-medium">
                {cert.name}
              </p>
            ))}
            {profile.certifications.length > 2 && (
              <p className="text-xs text-muted-foreground">
                +{profile.certifications.length - 2} more
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No certifications added</p>
        );
      default:
        return <p className="text-sm text-muted-foreground">Click edit to add content</p>;
    }
  };

  const getSectionSlug = () => {
    if (section.type === 'CUSTOM' && section.customName) {
      return `custom-${section.id}`;
    }
    return section.type.toLowerCase().replace(/_/g, '-');
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        className={`transition-all ${!section.isVisible ? 'opacity-50' : ''} ${isDragging ? 'shadow-lg ring-2 ring-primary' : ''}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                {...attributes}
                {...listeners}
                className="cursor-grab touch-none rounded p-1 hover:bg-muted active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </button>
              <Icon className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">{section.title}</CardTitle>
              {!section.isVisible && (
                <Badge variant="secondary" className="text-xs">
                  Hidden
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onToggleVisibility(section.id, !section.isVisible)}
              >
                {section.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
              <Link href={`/builder/${getSectionSlug()}`}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Edit className="h-4 w-4" />
                </Button>
              </Link>
              {section.type !== 'BASIC_INFO' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(section.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">{getContentPreview()}</CardContent>
      </Card>
    </div>
  );
}

export function DashboardClient({ initialProfile }: DashboardClientProps) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [sections, setSections] = useState<ProfileSection[]>(initialProfile.sections || []);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch sections if not present
  useEffect(() => {
    if (!sections.length) {
      fetchSections();
    }
  }, []);

  const fetchSections = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/profile/sections');
      if (response.ok) {
        const data = await response.json();
        setSections(data);
      }
    } catch (error) {
      console.error('Failed to fetch sections:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);

      const newSections = arrayMove(sections, oldIndex, newIndex).map((s, i) => ({
        ...s,
        sortOrder: i,
      }));

      setSections(newSections);

      // Save to backend
      try {
        await fetch('/api/profile/sections', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sections: newSections.map((s) => ({ id: s.id, sortOrder: s.sortOrder })),
          }),
        });
      } catch (error) {
        console.error('Failed to save section order:', error);
      }
    }
  };

  const handleToggleVisibility = async (id: string, isVisible: boolean) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, isVisible } : s)));

    try {
      await fetch(`/api/profile/sections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible }),
      });
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
    }
  };

  const handleDeleteSection = async (id: string) => {
    if (!confirm('Are you sure you want to delete this section?')) return;

    setSections((prev) => prev.filter((s) => s.id !== id));

    try {
      await fetch(`/api/profile/sections/${id}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Failed to delete section:', error);
    }
  };

  const handleAddSection = async (type: SectionType) => {
    let customName: string | undefined;

    if (type === 'CUSTOM') {
      const name = prompt('Enter a name for your custom section:');
      if (!name) return;
      customName = name;
    }

    // Check if section already exists (except for CUSTOM)
    if (type !== 'CUSTOM' && sections.some((s) => s.type === type)) {
      alert('This section already exists!');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/profile/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          customName,
          title: customName || ADDABLE_SECTIONS.find((s) => s.type === type)?.label,
        }),
      });

      if (response.ok) {
        const newSection = await response.json();
        setSections((prev) => [...prev, newSection]);
      }
    } catch (error) {
      console.error('Failed to add section:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Get available sections to add (not already added, except CUSTOM)
  const availableSections = ADDABLE_SECTIONS.filter(
    (s) => s.type === 'CUSTOM' || !sections.some((existing) => existing.type === s.type)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Your Profile</h1>
          <p className="text-muted-foreground">
            Drag sections to reorder. Click edit to modify content.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`/u/${profile.handle}`} target="_blank">
            <Button variant="outline" className="gap-2">
              <Eye className="h-4 w-4" />
              Preview
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2" disabled={isSaving}>
                {isSaving ? <Spinner size="sm" /> : <Plus className="h-4 w-4" />}
                Add Section
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {availableSections.map((section) => {
                const Icon = SECTION_ICONS[section.type];
                return (
                  <DropdownMenuItem
                    key={section.type}
                    onClick={() => handleAddSection(section.type)}
                    className="gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </DropdownMenuItem>
                );
              })}
              {availableSections.length === 0 && (
                <DropdownMenuItem disabled>All sections added</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Profile Status Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Badge variant={profile.status === 'PUBLIC' ? 'default' : 'secondary'}>
              {profile.status.toLowerCase()}
            </Badge>
            <span className="text-sm text-muted-foreground">follio.dev/u/{profile.handle}</span>
          </div>
          <Link href="/builder/basic-info">
            <Button variant="link" size="sm" className="gap-1">
              Change visibility
              <ChevronUp className="h-3 w-3 rotate-90" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Sections */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {sections.map((section) => (
              <SortableSection
                key={section.id}
                section={section}
                profile={profile}
                onToggleVisibility={handleToggleVisibility}
                onDelete={handleDeleteSection}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {sections.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-4 text-muted-foreground">No sections yet. Add your first section!</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Section
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {ADDABLE_SECTIONS.slice(0, 6).map((section) => {
                  const Icon = SECTION_ICONS[section.type];
                  return (
                    <DropdownMenuItem
                      key={section.type}
                      onClick={() => handleAddSection(section.type)}
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4" />
                      {section.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
