'use client';

import {
  ExternalLink,
  Eye,
  EyeOff,
  FolderKanban,
  Github,
  Loader2,
  Pencil,
  Pin,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Switch } from '@/components/ui/switch';
import { notifyProfileUpdated } from '@/lib/events';
import { useReorderPersist } from '@/lib/hooks/use-reorder-persist';
import { cn } from '@/lib/utils';

import { SortableCardList } from '../components/sortable-card-list';

import type { Project } from '@/types';
import type { DateExtractor } from '../components/sortable-card-list';

const projectDateExtractor: DateExtractor<Project> = (project) => ({
  start: project.startDate ? new Date(project.startDate) : null,
  end: project.endDate ? new Date(project.endDate) : null,
});

interface ProjectsSectionProps {
  projects: Project[];
  profileId: string;
  onUpdate: (projects: Project[]) => void;
  autoEditId?: string | 'new';
  onEditComplete?: () => void;
  /** When true, renders without Card wrapper for use inside accordion sections */
  embedded?: boolean;
}

const emptyProject: Partial<Project> = {
  title: '',
  description: '',
  shortDesc: '',
  url: '',
  repoUrl: '',
  imageUrl: '',
  techStack: [],
  highlights: [],
  startDate: null,
  endDate: null,
  isCurrent: false,
  featured: false,
};

export function ProjectsSection({
  projects,
  onUpdate,
  autoEditId,
  onEditComplete,
  embedded,
}: ProjectsSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(!!autoEditId);
  const [editingProject, setEditingProject] = useState<Project | null>(() => {
    if (autoEditId && autoEditId !== 'new') {
      return projects.find((p) => p.id === autoEditId) ?? null;
    }
    return null;
  });
  const [formData, setFormData] = useState<Partial<Project>>(() => {
    if (autoEditId && autoEditId !== 'new') {
      const proj = projects.find((p) => p.id === autoEditId);
      return proj ? { ...proj } : { ...emptyProject };
    }
    return { ...emptyProject };
  });
  const [techInput, setTechInput] = useState('');
  const [highlightInput, setHighlightInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistOrder = useReorderPersist<Project>('project', onUpdate);

  const handleReorder = useCallback(
    (reordered: Project[]) => {
      persistOrder(reordered, projects);
    },
    [persistOrder, projects]
  );

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open && autoEditId) onEditComplete?.();
  };

  const handleOpenDialog = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setFormData(project);
    } else {
      setEditingProject(null);
      setFormData(emptyProject);
    }
    setError(null);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        title: formData.title,
        description: formData.description || undefined,
        shortDesc: formData.shortDesc || undefined,
        url: formData.url || undefined,
        repoUrl: formData.repoUrl || undefined,
        imageUrl: formData.imageUrl || undefined,
        techStack: formData.techStack || [],
        highlights: formData.highlights || [],
        startDate: formData.startDate,
        endDate: formData.isCurrent ? null : formData.endDate,
        isCurrent: formData.isCurrent || false,
        featured: formData.featured || false,
      };

      if (editingProject) {
        // Update existing project
        const response = await fetch(`/api/profile/projects/${editingProject.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update project');
        }

        const { project } = await response.json();
        const updatedProjects = projects.map((p) => (p.id === editingProject.id ? project : p));
        onUpdate(updatedProjects);
      } else {
        // Create new project
        const response = await fetch('/api/profile/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create project');
        }

        const { project } = await response.json();
        onUpdate([...projects, project]);
      }

      setIsDialogOpen(false);
      setFormData(emptyProject);
      setEditingProject(null);
      notifyProfileUpdated();
      if (autoEditId) onEditComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (projectId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/profile/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete project');
      }

      onUpdate(projects.filter((p) => p.id !== projectId));
      notifyProfileUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const addTech = () => {
    if (techInput.trim() && !(formData.techStack || []).includes(techInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        techStack: [...(prev.techStack || []), techInput.trim()],
      }));
      setTechInput('');
    }
  };

  const removeTech = (tech: string) => {
    setFormData((prev) => ({
      ...prev,
      techStack: (prev.techStack || []).filter((t) => t !== tech),
    }));
  };

  const addHighlight = () => {
    if (highlightInput.trim()) {
      setFormData((prev) => ({
        ...prev,
        highlights: [...(prev.highlights || []), highlightInput.trim()],
      }));
      setHighlightInput('');
    }
  };

  const removeHighlight = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      highlights: (prev.highlights || []).filter((_, i) => i !== index),
    }));
  };

  // ── Inline form (auto-edit mode) ──

  const renderInlineForm = () => (
    <div className="space-y-4 rounded-lg border-2 border-primary/30 bg-muted/30 p-4 shadow-md ring-2 ring-primary/10">
      <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
        <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        {editingProject ? 'Editing project' : 'Adding new project'} — save or discard to continue
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-2">
        <Label>Project Title *</Label>
        <Input
          value={formData.title || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="My Awesome Project"
        />
      </div>

      <div className="space-y-2">
        <Label>Short Description</Label>
        <Input
          value={formData.shortDesc || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, shortDesc: e.target.value }))}
          placeholder="One-liner for portfolio cards"
        />
      </div>

      <div className="space-y-2">
        <Label>Full Description</Label>
        <RichTextEditor
          value={formData.description || ''}
          onChange={(html) => setFormData((prev) => ({ ...prev, description: html }))}
          placeholder="Detailed description of the project..."
          minHeight="140px"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Live URL</Label>
          <Input
            value={formData.url || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
            placeholder="https://myproject.com"
          />
        </div>
        <div className="space-y-2">
          <Label>Repository URL</Label>
          <Input
            value={formData.repoUrl || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, repoUrl: e.target.value }))}
            placeholder="https://github.com/..."
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Cover Image URL</Label>
        <Input
          value={formData.imageUrl || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, imageUrl: e.target.value }))}
          placeholder="https://example.com/image.jpg"
        />
      </div>

      <div className="space-y-2">
        <Label>Tech Stack</Label>
        <div className="flex gap-2">
          <Input
            value={techInput}
            onChange={(e) => setTechInput(e.target.value)}
            placeholder="Add technology..."
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTech())}
          />
          <Button type="button" onClick={addTech} variant="secondary">
            Add
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(formData.techStack || []).map((tech) => (
            <Badge key={tech} variant="secondary" className="gap-1">
              {tech}
              <button onClick={() => removeTech(tech)} className="ml-1 hover:text-destructive">
                ×
              </button>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Highlights / Key Features</Label>
        <div className="flex gap-2">
          <Input
            value={highlightInput}
            onChange={(e) => setHighlightInput(e.target.value)}
            placeholder="Add a highlight..."
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addHighlight())}
          />
          <Button type="button" onClick={addHighlight} variant="secondary">
            Add
          </Button>
        </div>
        <ul className="mt-2 space-y-2">
          {(formData.highlights || []).map((highlight, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="flex-1 rounded bg-muted p-2">• {highlight}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeHighlight(i)}
                className="h-8 w-8"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={formData.featured || false}
          onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, featured: checked }))}
        />
        <Label>Featured project (show prominently)</Label>
      </div>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button
          onClick={handleSave}
          disabled={!formData.title || isLoading}
          size="sm"
          className="gap-2"
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEditComplete?.()}
          disabled={isLoading}
          className="gap-2"
        >
          <X className="mr-1 h-4 w-4" />
          Discard
        </Button>
      </div>
    </div>
  );

  // Auto-edit mode: render only the inline form
  if (autoEditId) {
    return renderInlineForm();
  }

  const toggleFeatured = async (project: Project) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/profile/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: !project.featured }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update project');
      }

      const { project: updatedProject } = await response.json();
      const updatedProjects = projects.map((p) => (p.id === project.id ? updatedProject : p));
      onUpdate(updatedProjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVisibility = async (project: Project) => {
    const newValue = !(project.isVisible ?? true);
    // Optimistic update
    onUpdate(projects.map((p) => (p.id === project.id ? { ...p, isVisible: newValue } : p)));
    try {
      const response = await fetch(`/api/profile/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible: newValue }),
      });
      if (!response.ok) throw new Error('Failed to update visibility');
      notifyProfileUpdated();
    } catch {
      // Revert on error
      onUpdate(projects.map((p) => (p.id === project.id ? { ...p, isVisible: !newValue } : p)));
    }
  };

  const addButton = (
    <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button
          onClick={() => handleOpenDialog()}
          className="gap-2"
          size={embedded ? 'sm' : 'default'}
        >
          <Plus className="h-4 w-4" />
          Add Project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingProject ? 'Edit' : 'Add'} Project</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Project Title *</Label>
            <Input
              value={formData.title || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="My Awesome Project"
            />
          </div>

          <div className="space-y-2">
            <Label>Short Description</Label>
            <Input
              value={formData.shortDesc || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, shortDesc: e.target.value }))}
              placeholder="One-liner for portfolio cards"
            />
          </div>

          <div className="space-y-2">
            <Label>Full Description</Label>
            <RichTextEditor
              value={formData.description || ''}
              onChange={(html) => setFormData((prev) => ({ ...prev, description: html }))}
              placeholder="Detailed description of the project..."
              minHeight="140px"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Live URL</Label>
              <Input
                value={formData.url || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://myproject.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Repository URL</Label>
              <Input
                value={formData.repoUrl || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, repoUrl: e.target.value }))}
                placeholder="https://github.com/..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cover Image URL</Label>
            <Input
              value={formData.imageUrl || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, imageUrl: e.target.value }))}
              placeholder="https://example.com/image.jpg"
            />
          </div>

          <div className="space-y-2">
            <Label>Tech Stack</Label>
            <div className="flex gap-2">
              <Input
                value={techInput}
                onChange={(e) => setTechInput(e.target.value)}
                placeholder="Add technology..."
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTech())}
              />
              <Button type="button" onClick={addTech} variant="secondary">
                Add
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(formData.techStack || []).map((tech) => (
                <Badge key={tech} variant="secondary" className="gap-1">
                  {tech}
                  <button onClick={() => removeTech(tech)} className="ml-1 hover:text-destructive">
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Highlights / Key Features</Label>
            <div className="flex gap-2">
              <Input
                value={highlightInput}
                onChange={(e) => setHighlightInput(e.target.value)}
                placeholder="Add a highlight..."
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addHighlight())}
              />
              <Button type="button" onClick={addHighlight} variant="secondary">
                Add
              </Button>
            </div>
            <ul className="mt-2 space-y-2">
              {(formData.highlights || []).map((highlight, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="flex-1 rounded bg-muted p-2">• {highlight}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeHighlight(i)}
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={formData.featured || false}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, featured: checked }))}
            />
            <Label>Featured project (show prominently)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!formData.title || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const projectList = (
    <div className={cn(!embedded && 'rounded-xl bg-muted/40 p-4')}>
      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No projects added yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Add projects to showcase your work and skills
          </p>
          <Button onClick={() => handleOpenDialog()} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Add Project
          </Button>
        </div>
      ) : (
        <div>
          <SortableCardList
            items={projects}
            onReorder={handleReorder}
            dateExtractor={projectDateExtractor}
            disabled={isLoading}
            renderItem={(project) => (
              <div
                className={cn(
                  'group flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50',
                  project.isVisible === false && 'opacity-50'
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FolderKanban className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{project.title}</h4>
                        {project.featured && (
                          <Badge variant="default" className="gap-1 text-xs">
                            <Star className="h-3 w-3" />
                            Featured
                          </Badge>
                        )}
                        {project.source === 'GITHUB' && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Github className="h-3 w-3" />
                            GitHub
                          </Badge>
                        )}
                        {project.githubPinned && (
                          <Badge variant="outline" className="gap-1 text-xs text-amber-600">
                            <Pin className="h-3 w-3" />
                            Pinned
                          </Badge>
                        )}
                      </div>
                      {project.shortDesc && (
                        <p className="text-sm text-muted-foreground">{project.shortDesc}</p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {project.url && (
                          <a
                            href={project.url}
                            target="_blank"
                            rel="noopener"
                            className="flex items-center gap-1 hover:text-primary"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Live
                          </a>
                        )}
                        {project.repoUrl && (
                          <a
                            href={project.repoUrl}
                            target="_blank"
                            rel="noopener"
                            className="flex items-center gap-1 hover:text-primary"
                          >
                            <Github className="h-3 w-3" />
                            Code
                          </a>
                        )}
                        {project.githubStars !== null &&
                          project.githubStars !== undefined &&
                          project.githubStars > 0 && (
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              {project.githubStars}
                            </span>
                          )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleVisibility(project)}
                        title={project.isVisible === false ? 'Show on resume' : 'Hide from resume'}
                      >
                        {project.isVisible === false ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn('h-8 w-8', project.featured && 'text-yellow-500')}
                        onClick={() => toggleFeatured(project)}
                        disabled={isLoading}
                        title={project.featured ? 'Unfeature' : 'Feature'}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenDialog(project)}
                        disabled={isLoading}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(project.id)}
                        disabled={isLoading}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {project.techStack && project.techStack.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {project.techStack.slice(0, 5).map((tech) => (
                        <Badge key={tech} variant="outline" className="text-xs">
                          {tech}
                        </Badge>
                      ))}
                      {project.techStack.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{project.techStack.length - 5}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showcase your personal and professional projects
          </p>
          {addButton}
        </div>
        {projectList}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardDescription>Showcase your personal and professional projects</CardDescription>
          {addButton}
        </div>
      </CardHeader>
      <CardContent>{projectList}</CardContent>
    </Card>
  );
}
