'use client';

import { useUser } from '@clerk/nextjs';
import {
  Eye,
  EyeOff,
  FileText,
  GitFork,
  Github,
  Loader2,
  Monitor,
  Pencil,
  Pin,
  RefreshCw,
  Star,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import type { Project } from '@/types';

interface GitHubProjectsSectionProps {
  projects: Project[];
  profileId: string;
  onUpdateAction: (projects: Project[]) => void;
}

interface ProjectVisibility {
  isVisible: boolean;
  showOnPortfolio: boolean;
  showOnResume: boolean;
  showStats: boolean;
  showReadme: boolean;
  customDescription?: string;
}

export function GitHubProjectsSection({ projects, onUpdateAction }: GitHubProjectsSectionProps) {
  const { user, isLoaded: isUserLoaded } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [visibility, setVisibility] = useState<ProjectVisibility | null>(null);

  // Get GitHub connection status from Clerk
  const githubAccount = useMemo(() => {
    if (!isUserLoaded || !user) return null;
    return user.externalAccounts?.find((acc) => acc.provider === 'github') || null;
  }, [user, isUserLoaded]);

  const githubConnected = !!githubAccount;
  const githubUsername = githubAccount?.username || undefined;

  // Separate GitHub projects from manual projects
  const githubProjects = projects.filter((p) => p.source === 'GITHUB');
  // Note: Manual projects are handled by the main ProjectsSection component

  // Group GitHub projects by visibility
  const visibleProjects = githubProjects.filter((p) => p.isVisible !== false);
  const hiddenProjects = githubProjects.filter((p) => p.isVisible === false);

  // Connect GitHub account via Clerk OAuth
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectGitHub = async () => {
    if (!user) return;

    setIsConnecting(true);
    setError(null);

    try {
      const externalAccount = await user.createExternalAccount({
        strategy: 'oauth_github',
        redirectUrl: window.location.href,
      });

      const url = externalAccount?.verification?.externalVerificationRedirectURL;
      if (url) {
        window.location.href = url.toString();
      }
    } catch (err) {
      console.error('GitHub connect error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect GitHub');
      setIsConnecting(false);
    }
  };

  const handleSyncGitHub = async () => {
    if (!githubUsername) return;

    setIsSyncing(true);
    setError(null);

    try {
      const response = await fetch('/api/import/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: githubUsername,
          saveToProfile: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to sync GitHub');
      }

      // Refresh projects after sync
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync GitHub');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleEditVisibility = (project: Project) => {
    setEditingProject(project);
    setVisibility({
      isVisible: project.isVisible !== false,
      showOnPortfolio: project.showOnPortfolio !== false,
      showOnResume: project.showOnResume !== false,
      showStats: project.showStats !== false,
      showReadme: project.showReadme === true,
      customDescription: project.customDescription || undefined,
    });
  };

  const handleSaveVisibility = async () => {
    if (!editingProject || !visibility) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/profile/projects/${editingProject.id}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visibility),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update visibility');
      }

      const { project } = await response.json();
      const updatedProjects = projects.map((p) => (p.id === editingProject.id ? project : p));
      onUpdateAction(updatedProjects);

      setEditingProject(null);
      setVisibility(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickToggle = async (project: Project, field: keyof ProjectVisibility) => {
    setIsLoading(true);
    setError(null);

    const currentValue = project[field as keyof Project];
    const newValue = !currentValue;

    try {
      const response = await fetch(`/api/profile/projects/${project.id}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: newValue }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update');
      }

      const { project: updated } = await response.json();
      const updatedProjects = projects.map((p) => (p.id === project.id ? updated : p));
      onUpdateAction(updatedProjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const ProjectCard = ({
    project,
    showActions = true,
  }: {
    project: Project;
    showActions?: boolean;
  }) => (
    <div
      className={`group flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50 ${
        !project.isVisible ? 'opacity-60' : ''
      }`}
    >
      <div className="flex-1">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-medium">{project.title}</h4>
              {project.githubPinned && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Pin className="h-3 w-3" />
                  Pinned
                </Badge>
              )}
              {project.featured && (
                <Badge variant="default" className="gap-1 text-xs">
                  <Star className="h-3 w-3 fill-current" />
                  Featured
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {project.customDescription || project.shortDesc || project.description?.slice(0, 100)}
              {project.description &&
                project.description.length > 100 &&
                !project.shortDesc &&
                '...'}
            </p>
            {/* GitHub Stats */}
            {(project.githubStars || project.githubForks) && (
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                {project.githubStars !== null && project.githubStars !== undefined && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    {project.githubStars}
                  </span>
                )}
                {project.githubForks !== null && project.githubForks !== undefined && (
                  <span className="flex items-center gap-1">
                    <GitFork className="h-3 w-3" />
                    {project.githubForks}
                  </span>
                )}
                {project.githubLanguage && (
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    {project.githubLanguage}
                  </span>
                )}
              </div>
            )}
            {/* Tech Stack */}
            {project.techStack && project.techStack.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {project.techStack.slice(0, 4).map((tech) => (
                  <Badge key={tech} variant="outline" className="text-xs">
                    {tech}
                  </Badge>
                ))}
                {project.techStack.length > 4 && (
                  <Badge variant="outline" className="text-xs">
                    +{project.techStack.length - 4}
                  </Badge>
                )}
              </div>
            )}
          </div>
          {showActions && (
            <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleQuickToggle(project, 'isVisible')}
                title={project.isVisible ? 'Hide project' : 'Show project'}
                disabled={isLoading}
              >
                {project.isVisible !== false ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleEditVisibility(project)}
                disabled={isLoading}
                title="Edit visibility"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        {/* Visibility indicators */}
        {showActions && (
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Monitor className="h-3 w-3" />
              Portfolio: {project.showOnPortfolio !== false ? 'Yes' : 'No'}
            </span>
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Resume: {project.showOnResume !== false ? 'Yes' : 'No'}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              GitHub Projects
            </CardTitle>
            <CardDescription>
              Manage which GitHub repositories appear on your portfolio and resume
            </CardDescription>
          </div>
          {githubConnected && githubUsername && (
            <Button
              onClick={handleSyncGitHub}
              variant="outline"
              className="gap-2"
              disabled={isSyncing}
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync from GitHub
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!isUserLoaded ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !githubConnected ? (
          <div className="py-8 text-center">
            <Github className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              Connect your GitHub account to import your repositories
            </p>
            <Button className="mt-4 gap-2" onClick={handleConnectGitHub} disabled={isConnecting}>
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Github className="h-4 w-4" />
              )}
              {isConnecting ? 'Connecting...' : 'Connect GitHub'}
            </Button>
          </div>
        ) : githubProjects.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p>No GitHub projects imported yet.</p>
            <p className="mt-1 text-sm">Connected as @{githubUsername}</p>
            <Button className="mt-4" onClick={handleSyncGitHub} disabled={isSyncing}>
              {isSyncing ? 'Syncing...' : 'Import from GitHub'}
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="visible" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="visible">Visible ({visibleProjects.length})</TabsTrigger>
              <TabsTrigger value="hidden">Hidden ({hiddenProjects.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="visible" className="space-y-3">
              {visibleProjects.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">
                  No visible projects. Unhide some from the Hidden tab.
                </p>
              ) : (
                visibleProjects.map((project) => <ProjectCard key={project.id} project={project} />)
              )}
            </TabsContent>

            <TabsContent value="hidden" className="space-y-3">
              {hiddenProjects.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">No hidden projects.</p>
              ) : (
                hiddenProjects.map((project) => <ProjectCard key={project.id} project={project} />)
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>

      {/* Edit Visibility Dialog */}
      <Dialog open={!!editingProject} onOpenChange={() => setEditingProject(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Project Visibility</DialogTitle>
            <DialogDescription>
              Control how &quot;{editingProject?.title}&quot; appears on your profile
            </DialogDescription>
          </DialogHeader>

          {visibility && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Visible</Label>
                  <p className="text-xs text-muted-foreground">Show this project on your profile</p>
                </div>
                <Switch
                  checked={visibility.isVisible}
                  onCheckedChange={(checked) =>
                    setVisibility((prev) => (prev ? { ...prev, isVisible: checked } : null))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Show on Portfolio</Label>
                  <p className="text-xs text-muted-foreground">Display in your portfolio view</p>
                </div>
                <Switch
                  checked={visibility.showOnPortfolio}
                  onCheckedChange={(checked) =>
                    setVisibility((prev) => (prev ? { ...prev, showOnPortfolio: checked } : null))
                  }
                  disabled={!visibility.isVisible}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Show on Resume</Label>
                  <p className="text-xs text-muted-foreground">Include in your resume view</p>
                </div>
                <Switch
                  checked={visibility.showOnResume}
                  onCheckedChange={(checked) =>
                    setVisibility((prev) => (prev ? { ...prev, showOnResume: checked } : null))
                  }
                  disabled={!visibility.isVisible}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Show GitHub Stats</Label>
                  <p className="text-xs text-muted-foreground">Display stars, forks, etc.</p>
                </div>
                <Switch
                  checked={visibility.showStats}
                  onCheckedChange={(checked) =>
                    setVisibility((prev) => (prev ? { ...prev, showStats: checked } : null))
                  }
                  disabled={!visibility.isVisible}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Show README Preview</Label>
                  <p className="text-xs text-muted-foreground">Display README on portfolio</p>
                </div>
                <Switch
                  checked={visibility.showReadme}
                  onCheckedChange={(checked) =>
                    setVisibility((prev) => (prev ? { ...prev, showReadme: checked } : null))
                  }
                  disabled={!visibility.isVisible}
                />
              </div>

              <div className="space-y-2">
                <Label>Custom Description</Label>
                <Textarea
                  value={visibility.customDescription || ''}
                  onChange={(e) =>
                    setVisibility((prev) =>
                      prev ? { ...prev, customDescription: e.target.value || undefined } : null
                    )
                  }
                  placeholder="Override the GitHub description..."
                  rows={3}
                  disabled={!visibility.isVisible}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use the GitHub description
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProject(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveVisibility} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
