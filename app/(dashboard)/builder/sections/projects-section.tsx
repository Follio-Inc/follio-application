'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical, Star, ExternalLink, Github, Loader2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';

import type { Project } from '@/types';

interface ProjectsSectionProps {
  projects: Project[];
  profileId: string;
  onUpdate: (projects: Project[]) => void;
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

export function ProjectsSection({ projects, profileId, onUpdate }: ProjectsSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState<Partial<Project>>(emptyProject);
  const [techInput, setTechInput] = useState('');
  const [highlightInput, setHighlightInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const updatedProjects = projects.map((p) =>
          p.id === editingProject.id ? project : p
        );
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
      const updatedProjects = projects.map((p) =>
        p.id === project.id ? updatedProject : p
      );
      onUpdate(updatedProjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Showcase your work and side projects</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Project
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingProject ? 'Edit' : 'Add'} Project</DialogTitle>
            </DialogHeader>
            
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
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
                <Textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Detailed description of the project..."
                  rows={4}
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
                <div className="flex flex-wrap gap-2 mt-2">
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
                <ul className="space-y-2 mt-2">
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
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No projects added yet. Click "Add Project" to get started.
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="cursor-move text-muted-foreground">
                  <GripVertical className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{project.title}</h4>
                        {project.featured && (
                          <Badge variant="default" className="gap-1 text-xs">
                            <Star className="h-3 w-3" />
                            Featured
                          </Badge>
                        )}
                      </div>
                      {project.shortDesc && (
                        <p className="text-sm text-muted-foreground">{project.shortDesc}</p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {project.url && (
                          <a href={project.url} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-primary">
                            <ExternalLink className="h-3 w-3" />
                            Live
                          </a>
                        )}
                        {project.repoUrl && (
                          <a href={project.repoUrl} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-primary">
                            <Github className="h-3 w-3" />
                            Code
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleFeatured(project)}
                        className={project.featured ? 'text-yellow-500' : ''}
                        disabled={isLoading}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(project)} disabled={isLoading}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(project.id)} disabled={isLoading}>
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
