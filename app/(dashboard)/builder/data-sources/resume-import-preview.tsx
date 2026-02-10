'use client';

import {
  AlertCircle,
  ArrowLeftRight,
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  GraduationCap,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  SkipForward,
  Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

// ─── Types ────────────────────────────────────────────────────────

interface ProfileFieldPreview {
  field: string;
  label: string;
  currentValue: string | null;
  incomingValue: string;
  currentSource: string | null;
  action: 'update' | 'fill' | 'skip';
  reason?: string;
}

interface ItemPreview<T> {
  item: T;
  action: 'add' | 'skip' | 'update';
  reason?: string;
  existingMatch?: Record<string, unknown>;
}

interface SyncExperience {
  company: string;
  role: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  bullets?: string[];
}

interface SyncEducation {
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
}

interface SyncProject {
  title: string;
  description?: string;
  technologies?: string[];
  repoUrl?: string;
  liveUrl?: string;
}

interface SyncLink {
  type: string;
  url: string;
  label?: string;
}

interface MergePreviewResult {
  source: string;
  profileFields: ProfileFieldPreview[];
  experiences: ItemPreview<SyncExperience>[];
  educations: ItemPreview<SyncEducation>[];
  skills: ItemPreview<{ name: string }>[];
  projects: ItemPreview<SyncProject>[];
  links: ItemPreview<SyncLink>[];
  summary: {
    profileFieldsToUpdate: number;
    profileFieldsToFill: number;
    profileFieldsSkipped: number;
    experiencesToAdd: number;
    experiencesDuplicate: number;
    educationsToAdd: number;
    educationsDuplicate: number;
    skillsToAdd: number;
    skillsDuplicate: number;
    projectsToAdd: number;
    projectsDuplicate: number;
    linksToAdd: number;
    linksDuplicate: number;
    totalNew: number;
    totalSkipped: number;
  };
}

// ─── Selection State ──────────────────────────────────────────────

interface SelectionState {
  profileFields: Record<string, boolean>;
  experiences: Record<number, boolean>;
  educations: Record<number, boolean>;
  skills: Record<number, boolean>;
  projects: Record<number, boolean>;
  links: Record<number, boolean>;
}

// ─── Editable items (user can modify before applying) ─────────────

// ─── Props ────────────────────────────────────────────────────────

interface ResumeImportPreviewProps {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  preview: MergePreviewResult;
  /** The raw parsed resume data to send to sync-apply */
  parsedData: Record<string, unknown>;
  onApplyCompleteAction: (message: string) => void;
  /** Import session ID for persistence (optional — enables auto-save) */
  sessionId?: string;
  /** Previously saved selections to restore (from session) */
  savedSelections?: SelectionState | null;
  /** Previously saved edits to restore (from session) */
  savedEdits?: {
    experiences?: Record<number, SyncExperience>;
    educations?: Record<number, SyncEducation>;
    projects?: Record<number, SyncProject>;
  } | null;
}

// ─── Component ────────────────────────────────────────────────────

export function ResumeImportPreview({
  open,
  onOpenChangeAction,
  preview,
  parsedData,
  onApplyCompleteAction,
  sessionId,
  savedSelections,
  savedEdits,
}: ResumeImportPreviewProps) {
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Expanded sections ──
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    profile: true,
    experiences: true,
    educations: true,
    skills: true,
    projects: true,
    links: true,
  });

  // ── Inline editing (restore from session if available) ──
  const [editingExperience, setEditingExperience] = useState<number | null>(null);
  const [editingEducation, setEditingEducation] = useState<number | null>(null);
  const [editingProject, setEditingProject] = useState<number | null>(null);
  const [editedExperiences, setEditedExperiences] = useState<Record<number, SyncExperience>>(
    (savedEdits?.experiences as Record<number, SyncExperience>) || {}
  );
  const [editedEducations, setEditedEducations] = useState<Record<number, SyncEducation>>(
    (savedEdits?.educations as Record<number, SyncEducation>) || {}
  );
  const [editedProjects, setEditedProjects] = useState<Record<number, SyncProject>>(
    (savedEdits?.projects as Record<number, SyncProject>) || {}
  );

  // ── Selection state ──
  // Smart defaults: new/fill items ON, updates OFF, skipped non-selectable.
  // "Do NOT auto-replace edited items" — updates require explicit opt-in.
  const [selections, setSelections] = useState<SelectionState>(() => {
    // Restore from saved session if available
    if (savedSelections) return savedSelections;

    const profileFields: Record<string, boolean> = {};
    preview.profileFields.forEach((f) => {
      // ✅ Fill (new fields) → ON by default
      // ❌ Update (existing fields) → OFF by default (user must opt in)
      // ❌ Skip (protected) → not selectable
      if (f.action === 'fill') profileFields[f.field] = true;
      else if (f.action === 'update') profileFields[f.field] = false;
    });

    const experiences: Record<number, boolean> = {};
    preview.experiences.forEach((e, i) => {
      if (e.action === 'add') experiences[i] = true;
    });

    const educations: Record<number, boolean> = {};
    preview.educations.forEach((e, i) => {
      if (e.action === 'add') educations[i] = true;
    });

    const skills: Record<number, boolean> = {};
    preview.skills.forEach((s, i) => {
      if (s.action === 'add') skills[i] = true;
    });

    const projects: Record<number, boolean> = {};
    preview.projects.forEach((p, i) => {
      if (p.action === 'add') projects[i] = true;
    });

    const links: Record<number, boolean> = {};
    preview.links.forEach((l, i) => {
      if (l.action === 'add') links[i] = true;
    });

    return { profileFields, experiences, educations, skills, projects, links };
  });

  // ── Helpers ──
  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleSelection = useCallback((category: keyof SelectionState, key: string | number) => {
    setSelections((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: !prev[category][key as keyof (typeof prev)[typeof category]],
      },
    }));
  }, []);

  // ── Auto-save selections to session (debounced) ──
  useEffect(() => {
    if (!sessionId) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      fetch(`/api/import/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selections,
          edits: {
            experiences: editedExperiences,
            educations: editedEducations,
            projects: editedProjects,
          },
        }),
      }).catch(() => {
        // Silent fail — auto-save is best-effort
      });
    }, 1500);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [sessionId, selections, editedExperiences, editedEducations, editedProjects]);

  // ── Count selected items ──
  const selectedCount = useMemo(() => {
    return (
      Object.values(selections.profileFields).filter(Boolean).length +
      Object.values(selections.experiences).filter(Boolean).length +
      Object.values(selections.educations).filter(Boolean).length +
      Object.values(selections.skills).filter(Boolean).length +
      Object.values(selections.projects).filter(Boolean).length +
      Object.values(selections.links).filter(Boolean).length
    );
  }, [selections]);

  // ── Apply selected items ──
  const handleApply = useCallback(async () => {
    setIsApplying(true);
    setApplyError(null);

    try {
      // Build the sync body from only selected items
      const syncBody: Record<string, unknown> = {
        source: 'RESUME',
      };

      // Profile fields (includes both 'fill' and 'update' when toggled on)
      const selectedProfileFields = preview.profileFields.filter(
        (f) => selections.profileFields[f.field]
      );
      if (selectedProfileFields.length > 0) {
        const profile: Record<string, string> = {};
        for (const f of selectedProfileFields) {
          profile[f.field] = f.incomingValue;
        }
        syncBody.profile = profile;
      }

      // Experiences (add or update when user opted in)
      const selectedExperiences = preview.experiences
        .map((e, i) => ({ ...e, _index: i }))
        .filter(
          (e) => (e.action === 'add' || e.action === 'update') && selections.experiences[e._index]
        )
        .map((e) => editedExperiences[e._index] || e.item);
      if (selectedExperiences.length > 0) {
        syncBody.experiences = selectedExperiences;
      }

      // Educations
      const selectedEducations = preview.educations
        .map((e, i) => ({ ...e, _index: i }))
        .filter(
          (e) => (e.action === 'add' || e.action === 'update') && selections.educations[e._index]
        )
        .map((e) => editedEducations[e._index] || e.item);
      if (selectedEducations.length > 0) {
        syncBody.educations = selectedEducations;
      }

      // Skills
      const selectedSkills = preview.skills
        .filter((s, i) => (s.action === 'add' || s.action === 'update') && selections.skills[i])
        .map((s) => s.item.name);
      if (selectedSkills.length > 0) {
        syncBody.skills = selectedSkills;
      }

      // Projects
      const selectedProjects = preview.projects
        .map((p, i) => ({ ...p, _index: i }))
        .filter(
          (p) => (p.action === 'add' || p.action === 'update') && selections.projects[p._index]
        )
        .map((p) => editedProjects[p._index] || p.item);
      if (selectedProjects.length > 0) {
        syncBody.projects = selectedProjects;
      }

      // Links
      const selectedLinks = preview.links
        .filter((l, i) => (l.action === 'add' || l.action === 'update') && selections.links[i])
        .map((l) => l.item);
      if (selectedLinks.length > 0) {
        syncBody.links = selectedLinks;
      }

      // Contact info — only pass through if user has selected profile fields
      // (to avoid silently modifying contact data)
      if (parsedData.contactInfo && selectedProfileFields.length > 0) {
        syncBody.contactInfo = parsedData.contactInfo;
      }

      const res = await fetch('/api/import/sync-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncBody),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply changes');

      // Mark the import session as applied (if session-backed)
      if (sessionId) {
        await fetch(`/api/import/sessions/${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'apply', appliedCount: selectedCount }),
        }).catch(() => {});
      }

      onApplyCompleteAction(data.message || 'Selected changes applied successfully');
      onOpenChangeAction(false);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Failed to apply changes');
    } finally {
      setIsApplying(false);
    }
  }, [
    preview,
    selections,
    selectedCount,
    editedExperiences,
    editedEducations,
    editedProjects,
    parsedData,
    sessionId,
    onApplyCompleteAction,
    onOpenChangeAction,
  ]);

  // ── Has any actionable content? ──
  const hasContent =
    preview.profileFields.length > 0 ||
    preview.experiences.length > 0 ||
    preview.educations.length > 0 ||
    preview.skills.length > 0 ||
    preview.projects.length > 0 ||
    preview.links.length > 0;

  if (!hasContent) {
    return (
      <Dialog open={open} onOpenChange={onOpenChangeAction}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Everything Up to Date</DialogTitle>
            <DialogDescription>
              Your resume didn&apos;t contain any new data compared to your current profile. No
              changes needed!
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChangeAction(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Count how many updates exist (items that would change existing data)
  const updateCount = preview.profileFields.filter((f) => f.action === 'update').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 p-0">
        {/* Header */}
        <DialogHeader className="px-6 pb-4 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-500" />
            Suggested Updates from Your Resume
          </DialogTitle>
          <DialogDescription>
            We scanned your resume and found some updates. Review each item below, toggle what
            you&apos;d like to keep, and edit anything before applying.
          </DialogDescription>

          {/* ── Safety banner ── */}
          <div className="mt-3 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50/50 px-4 py-3 dark:border-green-900 dark:bg-green-950/20">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Your profile is safe
              </p>
              <p className="text-xs text-green-700 dark:text-green-400">
                Nothing will change until you review and click &quot;Apply selected changes&quot;.
                New items are pre-selected; changes to existing data are off by default.
              </p>
            </div>
          </div>

          {/* Summary badges */}
          <div className="mt-3 flex flex-wrap gap-2">
            {preview.summary.totalNew > 0 && (
              <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                <Plus className="mr-1 h-3 w-3" />
                {preview.summary.totalNew} new
              </Badge>
            )}
            {updateCount > 0 && (
              <Badge
                variant="outline"
                className="border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400"
              >
                <ArrowLeftRight className="mr-1 h-3 w-3" />
                {updateCount} suggested {updateCount === 1 ? 'change' : 'changes'}
              </Badge>
            )}
            {preview.summary.totalSkipped > 0 && (
              <Badge variant="secondary">
                <SkipForward className="mr-1 h-3 w-3" />
                {preview.summary.totalSkipped} already exist
              </Badge>
            )}
          </div>
        </DialogHeader>

        <Separator />

        {/* Scrollable content */}
        <ScrollArea className="flex-1 px-6">
          <div className="space-y-4 py-4">
            {/* ═══ Profile Fields ═══ */}
            {preview.profileFields.length > 0 && (
              <PreviewSection
                title="Profile"
                icon={<FileText className="h-4 w-4" />}
                count={preview.profileFields.filter((f) => f.action !== 'skip').length}
                total={preview.profileFields.length}
                expanded={expandedSections.profile}
                onToggle={() => toggleSection('profile')}
              >
                <div className="space-y-2">
                  {preview.profileFields.map((field) => (
                    <ProfileFieldRow
                      key={field.field}
                      field={field}
                      selected={!!selections.profileFields[field.field]}
                      onToggle={() => toggleSelection('profileFields', field.field)}
                    />
                  ))}
                </div>
              </PreviewSection>
            )}

            {/* ═══ Experiences ═══ */}
            {preview.experiences.length > 0 && (
              <PreviewSection
                title="Work Experience"
                icon={<Briefcase className="h-4 w-4" />}
                count={preview.summary.experiencesToAdd}
                total={preview.experiences.length}
                expanded={expandedSections.experiences}
                onToggle={() => toggleSection('experiences')}
              >
                <div className="space-y-2">
                  {preview.experiences.map((exp, i) => (
                    <ExperienceRow
                      key={i}
                      preview={exp}
                      selected={!!selections.experiences[i]}
                      onToggle={() => toggleSelection('experiences', i)}
                      isEditing={editingExperience === i}
                      editedItem={editedExperiences[i]}
                      onStartEdit={() => setEditingExperience(i)}
                      onSaveEdit={(data) => {
                        setEditedExperiences((prev) => ({ ...prev, [i]: data }));
                        setEditingExperience(null);
                      }}
                      onCancelEdit={() => setEditingExperience(null)}
                    />
                  ))}
                </div>
              </PreviewSection>
            )}

            {/* ═══ Education ═══ */}
            {preview.educations.length > 0 && (
              <PreviewSection
                title="Education"
                icon={<GraduationCap className="h-4 w-4" />}
                count={preview.summary.educationsToAdd}
                total={preview.educations.length}
                expanded={expandedSections.educations}
                onToggle={() => toggleSection('educations')}
              >
                <div className="space-y-2">
                  {preview.educations.map((edu, i) => (
                    <EducationRow
                      key={i}
                      preview={edu}
                      selected={!!selections.educations[i]}
                      onToggle={() => toggleSelection('educations', i)}
                      isEditing={editingEducation === i}
                      editedItem={editedEducations[i]}
                      onStartEdit={() => setEditingEducation(i)}
                      onSaveEdit={(data) => {
                        setEditedEducations((prev) => ({ ...prev, [i]: data }));
                        setEditingEducation(null);
                      }}
                      onCancelEdit={() => setEditingEducation(null)}
                    />
                  ))}
                </div>
              </PreviewSection>
            )}

            {/* ═══ Skills ═══ */}
            {preview.skills.length > 0 && (
              <PreviewSection
                title="Skills"
                icon={<Wrench className="h-4 w-4" />}
                count={preview.summary.skillsToAdd}
                total={preview.skills.length}
                expanded={expandedSections.skills}
                onToggle={() => toggleSection('skills')}
              >
                <div className="flex flex-wrap gap-2">
                  {preview.skills.map((skill, i) => (
                    <SkillChip
                      key={i}
                      skill={skill}
                      selected={!!selections.skills[i]}
                      onToggle={() => toggleSelection('skills', i)}
                    />
                  ))}
                </div>
              </PreviewSection>
            )}

            {/* ═══ Projects ═══ */}
            {preview.projects.length > 0 && (
              <PreviewSection
                title="Projects"
                icon={<ExternalLink className="h-4 w-4" />}
                count={preview.summary.projectsToAdd}
                total={preview.projects.length}
                expanded={expandedSections.projects}
                onToggle={() => toggleSection('projects')}
              >
                <div className="space-y-2">
                  {preview.projects.map((proj, i) => (
                    <ProjectRow
                      key={i}
                      preview={proj}
                      selected={!!selections.projects[i]}
                      onToggle={() => toggleSelection('projects', i)}
                      isEditing={editingProject === i}
                      editedItem={editedProjects[i]}
                      onStartEdit={() => setEditingProject(i)}
                      onSaveEdit={(data) => {
                        setEditedProjects((prev) => ({ ...prev, [i]: data }));
                        setEditingProject(null);
                      }}
                      onCancelEdit={() => setEditingProject(null)}
                    />
                  ))}
                </div>
              </PreviewSection>
            )}

            {/* ═══ Links ═══ */}
            {preview.links.length > 0 && (
              <PreviewSection
                title="Links"
                icon={<LinkIcon className="h-4 w-4" />}
                count={preview.summary.linksToAdd}
                total={preview.links.length}
                expanded={expandedSections.links}
                onToggle={() => toggleSection('links')}
              >
                <div className="space-y-2">
                  {preview.links.map((link, i) => (
                    <LinkRow
                      key={i}
                      preview={link}
                      selected={!!selections.links[i]}
                      onToggle={() => toggleSelection('links', i)}
                    />
                  ))}
                </div>
              </PreviewSection>
            )}
          </div>
        </ScrollArea>

        <Separator />

        {/* Footer */}
        <DialogFooter className="gap-2 px-6 py-4">
          {applyError && (
            <div className="mr-auto flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {applyError}
            </div>
          )}
          {selectedCount === 0 && !applyError && (
            <p className="mr-auto text-xs text-muted-foreground">
              Toggle on the items you&apos;d like to add to your profile
            </p>
          )}
          <Button
            variant="outline"
            onClick={() => {
              // Discard session if user explicitly cancels
              if (sessionId) {
                fetch(`/api/import/sessions/${sessionId}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'discard' }),
                }).catch(() => {});
              }
              onOpenChangeAction(false);
            }}
            disabled={isApplying}
          >
            Discard
          </Button>
          <Button variant="outline" onClick={() => onOpenChangeAction(false)} disabled={isApplying}>
            Review Later
          </Button>
          <Button onClick={handleApply} disabled={isApplying || selectedCount === 0}>
            {isApplying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Apply {selectedCount} selected {selectedCount === 1 ? 'change' : 'changes'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════

// ─── Section Wrapper ──────────────────────────────────────────────

function PreviewSection({
  title,
  icon,
  count,
  total,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <Badge variant="default" className="bg-green-600 text-xs">
              {count} new
            </Badge>
          )}
          {total - count > 0 && (
            <Badge variant="secondary" className="text-xs">
              {total - count} existing
            </Badge>
          )}
        </div>
      </button>
      {expanded && <CardContent className="pb-4 pt-0">{children}</CardContent>}
    </Card>
  );
}

// ─── Profile Field Row ────────────────────────────────────────────

function ProfileFieldRow({
  field,
  selected,
  onToggle,
}: {
  field: ProfileFieldPreview;
  selected: boolean;
  onToggle: () => void;
}) {
  const isSkipped = field.action === 'skip';
  const isUpdate = field.action === 'update';
  const isFill = field.action === 'fill';

  return (
    <div
      className={`flex items-start justify-between rounded-lg border px-4 py-3 ${
        isSkipped ? 'opacity-60' : ''
      } ${isUpdate && selected ? 'border-blue-200 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-950/10' : ''}`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{field.label}</span>
          {isFill && (
            <Badge variant="default" className="bg-green-600 text-xs">
              New
            </Badge>
          )}
          {isUpdate && (
            <Badge
              variant="outline"
              className="border-blue-300 text-xs text-blue-700 dark:border-blue-800 dark:text-blue-400"
            >
              <ArrowLeftRight className="mr-1 h-3 w-3" />
              Suggested change
            </Badge>
          )}
          {isSkipped && (
            <Badge variant="secondary" className="text-xs">
              <Shield className="mr-1 h-3 w-3" />
              Protected
            </Badge>
          )}
        </div>

        {/* Side-by-side comparison for updates */}
        {isUpdate && field.currentValue && (
          <div className="mt-2 grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-2.5">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Your current
              </span>
              <p className="text-xs">{truncate(field.currentValue, 120)}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                From resume
              </span>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {truncate(field.incomingValue, 120)}
              </p>
            </div>
          </div>
        )}

        {/* Simple display for fill (new fields) */}
        {isFill && (
          <div className="text-xs">
            <span className="text-green-700 dark:text-green-400">
              {truncate(field.incomingValue, 120)}
            </span>
          </div>
        )}

        {/* Incoming value for skipped fields */}
        {isSkipped && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">From resume:</span> {truncate(field.incomingValue, 120)}
          </div>
        )}

        {field.reason && <p className="text-xs italic text-muted-foreground">{field.reason}</p>}
      </div>
      {!isSkipped && (
        <div className="ml-3 flex-shrink-0 pt-0.5">
          <Switch checked={selected} onCheckedChange={onToggle} />
        </div>
      )}
    </div>
  );
}

// ─── Experience Row ───────────────────────────────────────────────

function ExperienceRow({
  preview,
  selected,
  onToggle,
  isEditing,
  editedItem,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  preview: ItemPreview<SyncExperience>;
  selected: boolean;
  onToggle: () => void;
  isEditing: boolean;
  editedItem?: SyncExperience;
  onStartEdit: () => void;
  onSaveEdit: (data: SyncExperience) => void;
  onCancelEdit: () => void;
}) {
  const item = editedItem || preview.item;
  const isSkipped = preview.action === 'skip';

  if (isEditing && !isSkipped) {
    return <InlineEditExperience item={item} onSave={onSaveEdit} onCancel={onCancelEdit} />;
  }

  return (
    <div
      className={`flex items-start justify-between rounded-lg border px-4 py-3 ${
        isSkipped ? 'opacity-60' : ''
      }`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{item.role || 'Untitled Role'}</span>
          {isSkipped ? (
            <Badge variant="secondary" className="text-xs">
              Exists
            </Badge>
          ) : (
            <Badge variant="default" className="bg-green-600 text-xs">
              New
            </Badge>
          )}
          {editedItem && !isSkipped && (
            <Badge variant="outline" className="text-xs">
              Edited
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {item.company}
          {item.location ? ` · ${item.location}` : ''}
          {item.startDate ? ` · ${item.startDate}` : ''}
          {item.endDate ? ` – ${item.endDate}` : item.isCurrent ? ' – Present' : ''}
        </p>
        {item.description && (
          <p className="text-xs text-muted-foreground">{truncate(item.description, 150)}</p>
        )}
      </div>
      <div className="ml-3 flex flex-shrink-0 items-center gap-2 pt-0.5">
        {!isSkipped && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStartEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Switch checked={selected} onCheckedChange={onToggle} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Education Row ────────────────────────────────────────────────

function EducationRow({
  preview,
  selected,
  onToggle,
  isEditing,
  editedItem,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  preview: ItemPreview<SyncEducation>;
  selected: boolean;
  onToggle: () => void;
  isEditing: boolean;
  editedItem?: SyncEducation;
  onStartEdit: () => void;
  onSaveEdit: (data: SyncEducation) => void;
  onCancelEdit: () => void;
}) {
  const item = editedItem || preview.item;
  const isSkipped = preview.action === 'skip';

  if (isEditing && !isSkipped) {
    return <InlineEditEducation item={item} onSave={onSaveEdit} onCancel={onCancelEdit} />;
  }

  return (
    <div
      className={`flex items-start justify-between rounded-lg border px-4 py-3 ${
        isSkipped ? 'opacity-60' : ''
      }`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {item.degree || item.institution || 'Untitled'}
          </span>
          {isSkipped ? (
            <Badge variant="secondary" className="text-xs">
              Exists
            </Badge>
          ) : (
            <Badge variant="default" className="bg-green-600 text-xs">
              New
            </Badge>
          )}
          {editedItem && !isSkipped && (
            <Badge variant="outline" className="text-xs">
              Edited
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {item.institution}
          {item.fieldOfStudy ? ` · ${item.fieldOfStudy}` : ''}
          {item.startDate ? ` · ${item.startDate}` : ''}
          {item.endDate ? ` – ${item.endDate}` : ''}
        </p>
      </div>
      <div className="ml-3 flex flex-shrink-0 items-center gap-2 pt-0.5">
        {!isSkipped && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStartEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Switch checked={selected} onCheckedChange={onToggle} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Skill Chip ───────────────────────────────────────────────────

function SkillChip({
  skill,
  selected,
  onToggle,
}: {
  skill: ItemPreview<{ name: string }>;
  selected: boolean;
  onToggle: () => void;
}) {
  const isSkipped = skill.action === 'skip';

  return (
    <button
      type="button"
      disabled={isSkipped}
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        isSkipped
          ? 'cursor-not-allowed bg-muted/30 text-muted-foreground opacity-60'
          : selected
            ? 'border-green-600 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400'
            : 'border-border bg-background text-muted-foreground hover:bg-muted'
      }`}
    >
      {isSkipped ? (
        <SkipForward className="h-3 w-3" />
      ) : selected ? (
        <Check className="h-3 w-3" />
      ) : (
        <Plus className="h-3 w-3" />
      )}
      {skill.item.name}
    </button>
  );
}

// ─── Project Row ──────────────────────────────────────────────────

function ProjectRow({
  preview,
  selected,
  onToggle,
  isEditing,
  editedItem,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  preview: ItemPreview<SyncProject>;
  selected: boolean;
  onToggle: () => void;
  isEditing: boolean;
  editedItem?: SyncProject;
  onStartEdit: () => void;
  onSaveEdit: (data: SyncProject) => void;
  onCancelEdit: () => void;
}) {
  const item = editedItem || preview.item;
  const isSkipped = preview.action === 'skip';

  if (isEditing && !isSkipped) {
    return <InlineEditProject item={item} onSave={onSaveEdit} onCancel={onCancelEdit} />;
  }

  return (
    <div
      className={`flex items-start justify-between rounded-lg border px-4 py-3 ${
        isSkipped ? 'opacity-60' : ''
      }`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{item.title || 'Untitled Project'}</span>
          {isSkipped ? (
            <Badge variant="secondary" className="text-xs">
              Exists
            </Badge>
          ) : (
            <Badge variant="default" className="bg-green-600 text-xs">
              New
            </Badge>
          )}
          {editedItem && !isSkipped && (
            <Badge variant="outline" className="text-xs">
              Edited
            </Badge>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground">{truncate(item.description, 120)}</p>
        )}
        {item.technologies && item.technologies.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.technologies.map((t) => (
              <Badge key={t} variant="outline" className="px-1.5 py-0 text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div className="ml-3 flex flex-shrink-0 items-center gap-2 pt-0.5">
        {!isSkipped && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStartEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Switch checked={selected} onCheckedChange={onToggle} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Link Row ─────────────────────────────────────────────────────

function LinkRow({
  preview,
  selected,
  onToggle,
}: {
  preview: ItemPreview<SyncLink>;
  selected: boolean;
  onToggle: () => void;
}) {
  const isSkipped = preview.action === 'skip';
  const item = preview.item;

  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
        isSkipped ? 'opacity-60' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs uppercase">
            {item.type}
          </Badge>
          <span className="truncate text-sm">{item.label || item.url}</span>
          {isSkipped ? (
            <Badge variant="secondary" className="text-xs">
              Exists
            </Badge>
          ) : (
            <Badge variant="default" className="bg-green-600 text-xs">
              New
            </Badge>
          )}
        </div>
        {item.label && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.url}</p>}
      </div>
      {!isSkipped && (
        <div className="ml-3 flex-shrink-0">
          <Switch checked={selected} onCheckedChange={onToggle} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// INLINE EDIT FORMS
// ═══════════════════════════════════════════════════════════════════

function InlineEditExperience({
  item,
  onSave,
  onCancel,
}: {
  item: SyncExperience;
  onSave: (data: SyncExperience) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<SyncExperience>({ ...item });

  return (
    <div className="space-y-3 rounded-lg border-2 border-blue-200 bg-blue-50/30 p-4 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Company</Label>
          <Input
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Role</Label>
          <Input
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Location</Label>
          <Input
            value={form.location || ''}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Start Date</Label>
          <Input
            value={form.startDate || ''}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            placeholder="YYYY-MM"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">End Date</Label>
          <Input
            value={form.endDate || ''}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            placeholder="YYYY-MM or leave empty if current"
            className="h-8 text-sm"
            disabled={form.isCurrent}
          />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <Switch
            checked={form.isCurrent || false}
            onCheckedChange={(v) =>
              setForm({ ...form, isCurrent: v, endDate: v ? undefined : form.endDate })
            }
          />
          <Label className="text-xs">Currently here</Label>
        </div>
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Textarea
          value={form.description || ''}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className="text-sm"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="mr-1 h-3 w-3" /> Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(form)}>
          <Check className="mr-1 h-3 w-3" /> Save
        </Button>
      </div>
    </div>
  );
}

function InlineEditEducation({
  item,
  onSave,
  onCancel,
}: {
  item: SyncEducation;
  onSave: (data: SyncEducation) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<SyncEducation>({ ...item });

  return (
    <div className="space-y-3 rounded-lg border-2 border-blue-200 bg-blue-50/30 p-4 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Institution</Label>
          <Input
            value={form.institution}
            onChange={(e) => setForm({ ...form, institution: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Degree</Label>
          <Input
            value={form.degree || ''}
            onChange={(e) => setForm({ ...form, degree: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Field of Study</Label>
          <Input
            value={form.fieldOfStudy || ''}
            onChange={(e) => setForm({ ...form, fieldOfStudy: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">GPA</Label>
          <Input
            value={form.gpa || ''}
            onChange={(e) => setForm({ ...form, gpa: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Start Date</Label>
          <Input
            value={form.startDate || ''}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            placeholder="YYYY-MM"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">End Date</Label>
          <Input
            value={form.endDate || ''}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            placeholder="YYYY-MM"
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="mr-1 h-3 w-3" /> Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(form)}>
          <Check className="mr-1 h-3 w-3" /> Save
        </Button>
      </div>
    </div>
  );
}

function InlineEditProject({
  item,
  onSave,
  onCancel,
}: {
  item: SyncProject;
  onSave: (data: SyncProject) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<SyncProject>({ ...item });
  const [techInput, setTechInput] = useState('');

  return (
    <div className="space-y-3 rounded-lg border-2 border-blue-200 bg-blue-50/30 p-4 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Title</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Repo URL</Label>
          <Input
            value={form.repoUrl || ''}
            onChange={(e) => setForm({ ...form, repoUrl: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Live URL</Label>
          <Input
            value={form.liveUrl || ''}
            onChange={(e) => setForm({ ...form, liveUrl: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Description</Label>
        <Textarea
          value={form.description || ''}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className="text-sm"
        />
      </div>
      <div>
        <Label className="text-xs">Technologies</Label>
        <div className="mb-1 flex flex-wrap gap-1">
          {(form.technologies || []).map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 text-xs">
              {t}
              <button
                type="button"
                onClick={() =>
                  setForm({ ...form, technologies: form.technologies?.filter((x) => x !== t) })
                }
                className="ml-0.5 hover:text-destructive"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={techInput}
            onChange={(e) => setTechInput(e.target.value)}
            placeholder="Add technology"
            className="h-8 flex-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && techInput.trim()) {
                e.preventDefault();
                setForm({
                  ...form,
                  technologies: [...(form.technologies || []), techInput.trim()],
                });
                setTechInput('');
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              if (techInput.trim()) {
                setForm({
                  ...form,
                  technologies: [...(form.technologies || []), techInput.trim()],
                });
                setTechInput('');
              }
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="mr-1 h-3 w-3" /> Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(form)}>
          <Check className="mr-1 h-3 w-3" /> Save
        </Button>
      </div>
    </div>
  );
}

// ─── Utilities ────────────────────────────────────────────────────

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}
