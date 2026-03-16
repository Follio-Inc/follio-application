'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  Edit2,
  FolderGit2,
  GraduationCap,
  Link as LinkIcon,
  Loader2,
  Plus,
  RefreshCw,
  User,
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// ─── Types ────────────────────────────────────────────────────────

interface ProfileFieldPreview {
  field: string;
  label: string;
  currentValue: string | null;
  incomingValue: string;
  currentSource: string | null;
  action: 'update' | 'fill' | 'same';
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
    totalNew: number;
    totalSkipped: number;
    [key: string]: number;
  };
}

// ─── Review Steps ─────────────────────────────────────────────────

type ReviewStep =
  | 'profile'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'links'
  | 'summary';

const STEP_INFO: Record<ReviewStep, { title: string; description: string; icon: typeof User }> = {
  profile: {
    title: 'Profile Info',
    description: 'Review your name, headline, and summary',
    icon: User,
  },
  experience: {
    title: 'Work Experience',
    description: 'Review experiences found in your resume',
    icon: Briefcase,
  },
  education: {
    title: 'Education',
    description: 'Review your educational background',
    icon: GraduationCap,
  },
  skills: {
    title: 'Skills',
    description: 'Review skills found in your resume',
    icon: Wrench,
  },
  projects: {
    title: 'Projects',
    description: 'Review projects found in your resume',
    icon: FolderGit2,
  },
  links: {
    title: 'Links',
    description: 'Review links found in your resume',
    icon: LinkIcon,
  },
  summary: {
    title: 'Confirm & Save',
    description: 'Review and confirm your selections',
    icon: Check,
  },
};

// ─── User Decisions ───────────────────────────────────────────────
// The user makes explicit decisions for every item. No auto-skip.

interface ProfileFieldDecision {
  field: string;
  /** 'incoming' = use resume value, 'current' = keep existing, 'custom' = user-typed value */
  choice: 'incoming' | 'current' | 'custom';
  customValue?: string;
}

interface ListItemDecision {
  index: number;
  /** true = include this item, false = exclude */
  include: boolean;
  /** User-edited version of the item (if they edited it) */
  edited?: Record<string, unknown>;
}

interface WizardDecisions {
  profileFields: ProfileFieldDecision[];
  experiences: ListItemDecision[];
  educations: ListItemDecision[];
  skills: ListItemDecision[];
  projects: ListItemDecision[];
  links: ListItemDecision[];
}

// ─── Props ────────────────────────────────────────────────────────

interface ResumeReviewWizardProps {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  preview: MergePreviewResult;
  parsedData: Record<string, unknown>;
  onApplyCompleteAction: (message: string) => void;
  sessionId?: string;
}

// ─── Component ────────────────────────────────────────────────────

export function ResumeReviewWizard({
  open,
  onOpenChangeAction,
  preview,
  parsedData,
  onApplyCompleteAction,
  sessionId,
}: ResumeReviewWizardProps) {
  // ── Compute which steps have content ──
  const availableSteps = useMemo<ReviewStep[]>(() => {
    const steps: ReviewStep[] = [];

    // Profile: show if any fields are fill or update (skip 'same')
    const profileReviewable = preview.profileFields.filter((f) => f.action !== 'same');
    if (profileReviewable.length > 0) steps.push('profile');

    // List sections: show if there are any items (new or duplicate)
    if (preview.experiences.length > 0) steps.push('experience');
    if (preview.educations.length > 0) steps.push('education');
    if (preview.skills.length > 0) steps.push('skills');
    if (preview.projects.length > 0) steps.push('projects');
    if (preview.links.length > 0) steps.push('links');

    // Always end with summary
    steps.push('summary');
    return steps;
  }, [preview]);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currentStep = availableSteps[currentStepIndex];
  const progress = ((currentStepIndex + 1) / availableSteps.length) * 100;

  // ── Decisions state ──
  const [decisions, setDecisions] = useState<WizardDecisions>(() => {
    // Default decisions: new items included, duplicates excluded, profile fields auto-select best
    const profileFields: ProfileFieldDecision[] = preview.profileFields
      .filter((f) => f.action !== 'same')
      .map((f) => ({
        field: f.field,
        // Default to incoming (from resume) — the user chose to re-import deliberately.
        choice: 'incoming' as const,
      }));

    const experiences: ListItemDecision[] = preview.experiences.map((e, i) => ({
      index: i,
      include: e.action === 'add' || e.action === 'update', // New + Updated → included, duplicate → excluded
    }));

    const educations: ListItemDecision[] = preview.educations.map((e, i) => ({
      index: i,
      include: e.action === 'add' || e.action === 'update',
    }));

    const skills: ListItemDecision[] = preview.skills.map((s, i) => ({
      index: i,
      include: s.action === 'add',
    }));

    const projects: ListItemDecision[] = preview.projects.map((p, i) => ({
      index: i,
      include: p.action === 'add' || p.action === 'update',
    }));

    const links: ListItemDecision[] = preview.links.map((l, i) => ({
      index: i,
      include: l.action === 'add',
    }));

    return { profileFields, experiences, educations, skills, projects, links };
  });

  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // ── Editing state (inline editing for experience/education cards) ──
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // ── Auto-save decisions to session ──
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/import/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selections: decisions }),
        });
      } catch {
        // Silent — non-critical
      }
    }, 2000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [decisions, sessionId]);

  // ── Navigation ──
  const goNext = useCallback(() => {
    setEditingIndex(null);
    if (currentStepIndex < availableSteps.length - 1) {
      setCurrentStepIndex((i) => i + 1);
    }
  }, [currentStepIndex, availableSteps.length]);

  const goBack = useCallback(() => {
    setEditingIndex(null);
    if (currentStepIndex > 0) {
      setCurrentStepIndex((i) => i - 1);
    }
  }, [currentStepIndex]);

  // ── Profile field decision helpers ──
  const setProfileFieldChoice = useCallback(
    (field: string, choice: ProfileFieldDecision['choice'], customValue?: string) => {
      setDecisions((prev) => ({
        ...prev,
        profileFields: prev.profileFields.map((d) =>
          d.field === field ? { ...d, choice, customValue } : d
        ),
      }));
    },
    []
  );

  // ── List item decision helpers ──
  const toggleListItem = useCallback(
    (category: keyof Omit<WizardDecisions, 'profileFields'>, index: number) => {
      setDecisions((prev) => ({
        ...prev,
        [category]: prev[category].map((d: ListItemDecision) =>
          d.index === index ? { ...d, include: !d.include } : d
        ),
      }));
    },
    []
  );

  const updateListItemEdits = useCallback(
    (
      category: keyof Omit<WizardDecisions, 'profileFields'>,
      index: number,
      edited: Record<string, unknown>
    ) => {
      setDecisions((prev) => ({
        ...prev,
        [category]: prev[category].map((d: ListItemDecision) =>
          d.index === index
            ? { ...d, edited: { ...(d.edited || {}), ...edited }, include: true }
            : d
        ),
      }));
    },
    []
  );

  // ── Counts for summary ──
  const counts = useMemo(() => {
    const profileChanges = decisions.profileFields.filter((d) => d.choice !== 'current').length;
    const experiences = decisions.experiences.filter((d) => d.include).length;
    const educations = decisions.educations.filter((d) => d.include).length;
    const skills = decisions.skills.filter((d) => d.include).length;
    const projects = decisions.projects.filter((d) => d.include).length;
    const links = decisions.links.filter((d) => d.include).length;
    const total = profileChanges + experiences + educations + skills + projects + links;
    return { profileChanges, experiences, educations, skills, projects, links, total };
  }, [decisions]);

  // ── Apply ──
  const handleApply = useCallback(async () => {
    setIsApplying(true);
    setApplyError(null);

    try {
      // Build the sync body from user's decisions
      const syncBody: Record<string, unknown> = {
        source: preview.source || 'RESUME',
      };

      // Profile fields: only send fields where user chose 'incoming' or 'custom'
      const profileUpdates: Record<string, string> = {};
      const forceFields: string[] = [];

      for (const decision of decisions.profileFields) {
        const fieldPreview = preview.profileFields.find((f) => f.field === decision.field);
        if (!fieldPreview) continue;

        if (decision.choice === 'incoming') {
          profileUpdates[decision.field] = fieldPreview.incomingValue;
          if (fieldPreview.action === 'update') forceFields.push(decision.field);
        } else if (decision.choice === 'custom' && decision.customValue) {
          profileUpdates[decision.field] = decision.customValue;
          forceFields.push(decision.field);
        }
        // 'current' → don't send field at all
      }

      if (Object.keys(profileUpdates).length > 0) {
        syncBody.profile = profileUpdates;
      }
      if (forceFields.length > 0) {
        syncBody.forceFields = forceFields;
      }

      // Experiences
      const selectedExps = decisions.experiences
        .filter((d) => d.include)
        .map((d) => {
          const previewItem = preview.experiences[d.index];
          const original = previewItem?.item;
          const merged = d.edited ? { ...original, ...d.edited } : original;
          // Attach existingId for update items so sync-apply can update the record
          if (previewItem?.action === 'update' && previewItem.existingMatch?.id) {
            return { ...merged, existingId: previewItem.existingMatch.id };
          }
          return merged;
        })
        .filter(Boolean);
      if (selectedExps.length > 0) syncBody.experiences = selectedExps;

      // Educations
      const selectedEdus = decisions.educations
        .filter((d) => d.include)
        .map((d) => {
          const previewItem = preview.educations[d.index];
          const original = previewItem?.item;
          const merged = d.edited ? { ...original, ...d.edited } : original;
          if (previewItem?.action === 'update' && previewItem.existingMatch?.id) {
            return { ...merged, existingId: previewItem.existingMatch.id };
          }
          return merged;
        })
        .filter(Boolean);
      if (selectedEdus.length > 0) syncBody.educations = selectedEdus;

      // Skills
      const selectedSkills = decisions.skills
        .filter((d) => d.include)
        .map((d) => preview.skills[d.index]?.item?.name)
        .filter(Boolean);
      if (selectedSkills.length > 0) syncBody.skills = selectedSkills;

      // Projects
      const selectedProjects = decisions.projects
        .filter((d) => d.include)
        .map((d) => {
          const previewItem = preview.projects[d.index];
          const original = previewItem?.item;
          const merged = d.edited ? { ...original, ...d.edited } : original;
          if (previewItem?.action === 'update' && previewItem.existingMatch?.id) {
            return { ...merged, existingId: previewItem.existingMatch.id };
          }
          return merged;
        })
        .filter(Boolean);
      if (selectedProjects.length > 0) syncBody.projects = selectedProjects;

      // Links
      const selectedLinks = decisions.links
        .filter((d) => d.include)
        .map((d) => preview.links[d.index]?.item)
        .filter(Boolean);
      if (selectedLinks.length > 0) syncBody.links = selectedLinks;

      // Contact info from parsed data (pass through if profile fields selected)
      if (Object.keys(profileUpdates).length > 0 && parsedData.contactInfo) {
        syncBody.contactInfo = parsedData.contactInfo;
      }

      // Apply
      const res = await fetch('/api/import/sync-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncBody),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply changes');

      // Mark session as applied
      if (sessionId) {
        await fetch(`/api/import/sessions/${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'apply', appliedCount: counts.total }),
        }).catch(() => {});
      }

      onOpenChangeAction(false);
      onApplyCompleteAction(
        data.message ||
          `Saved ${counts.total} change${counts.total === 1 ? '' : 's'} from your resume.`
      );
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsApplying(false);
    }
  }, [
    decisions,
    preview,
    parsedData,
    sessionId,
    counts.total,
    onOpenChangeAction,
    onApplyCompleteAction,
  ]);

  // ── Discard ──
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleDiscard = useCallback(async () => {
    if (sessionId) {
      await fetch(`/api/import/sessions/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discard' }),
      }).catch(() => {});
    }
    setShowDiscardConfirm(false);
    onOpenChangeAction(false);
  }, [sessionId, onOpenChangeAction]);

  // Intercept dialog close (X button / overlay click) to confirm discard
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setShowDiscardConfirm(true);
      } else {
        onOpenChangeAction(true);
      }
    },
    [onOpenChangeAction]
  );

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-lg">Review Resume Import</DialogTitle>
          <DialogDescription>
            Step {currentStepIndex + 1} of {availableSteps.length}
            {' — '}
            {STEP_INFO[currentStep]?.description}
          </DialogDescription>
          {/* Progress bar */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          {/* Step dots */}
          <div className="mt-2 flex justify-center gap-1.5">
            {availableSteps.map((step, index) => (
              <button
                key={step}
                onClick={() => {
                  setEditingIndex(null);
                  setCurrentStepIndex(index);
                }}
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium transition-all ${
                  index < currentStepIndex
                    ? 'bg-primary text-primary-foreground'
                    : index === currentStepIndex
                      ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {index < currentStepIndex ? <Check className="h-3 w-3" /> : index + 1}
              </button>
            ))}
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">
            {/* ── Profile Step ── */}
            {currentStep === 'profile' && (
              <StepContainer key="profile">
                <StepHeader
                  icon={STEP_INFO.profile.icon}
                  title={STEP_INFO.profile.title}
                  description="For each field, choose which value to keep."
                />

                <div className="space-y-4">
                  {preview.profileFields
                    .filter((f) => f.action !== 'same')
                    .map((field) => {
                      const decision = decisions.profileFields.find((d) => d.field === field.field);
                      if (!decision) return null;

                      if (field.action === 'fill') {
                        // Empty field — just show the new value
                        return (
                          <ProfileFillCard
                            key={field.field}
                            field={field}
                            decision={decision}
                            onChoiceChange={(choice, customValue) =>
                              setProfileFieldChoice(field.field, choice, customValue)
                            }
                          />
                        );
                      }

                      // Update — side by side
                      return (
                        <ProfileUpdateCard
                          key={field.field}
                          field={field}
                          decision={decision}
                          onChoiceChange={(choice, customValue) =>
                            setProfileFieldChoice(field.field, choice, customValue)
                          }
                        />
                      );
                    })}
                </div>
              </StepContainer>
            )}

            {/* ── Experience Step ── */}
            {currentStep === 'experience' && (
              <StepContainer key="experience">
                <StepHeader
                  icon={STEP_INFO.experience.icon}
                  title={STEP_INFO.experience.title}
                  description={buildStepDescription(preview.experiences)}
                />
                <ListReviewSection
                  items={preview.experiences}
                  decisions={decisions.experiences}
                  onToggle={(i) => toggleListItem('experiences', i)}
                  onEdit={(i, edits) => updateListItemEdits('experiences', i, edits)}
                  editingIndex={editingIndex}
                  onSetEditing={setEditingIndex}
                  renderItem={(item) => <ExperienceDisplay item={item} />}
                  renderEditForm={(item, decision, onSave) => (
                    <ExperienceEditForm
                      item={{ ...item, ...(decision.edited || {}) } as SyncExperience}
                      onUpdate={(edits) =>
                        updateListItemEdits('experiences', decision.index, edits)
                      }
                      onSave={onSave}
                    />
                  )}
                  itemLabel={(item) =>
                    `${(item as SyncExperience).role} at ${(item as SyncExperience).company}`
                  }
                  emptyMessage="No work experience found in the resume."
                />
              </StepContainer>
            )}

            {/* ── Education Step ── */}
            {currentStep === 'education' && (
              <StepContainer key="education">
                <StepHeader
                  icon={STEP_INFO.education.icon}
                  title={STEP_INFO.education.title}
                  description={buildStepDescription(preview.educations)}
                />
                <ListReviewSection
                  items={preview.educations}
                  decisions={decisions.educations}
                  onToggle={(i) => toggleListItem('educations', i)}
                  onEdit={(i, edits) => updateListItemEdits('educations', i, edits)}
                  editingIndex={editingIndex}
                  onSetEditing={setEditingIndex}
                  renderItem={(item) => <EducationDisplay item={item} />}
                  renderEditForm={(item, decision, onSave) => (
                    <EducationEditForm
                      item={{ ...item, ...(decision.edited || {}) } as SyncEducation}
                      onUpdate={(edits) => updateListItemEdits('educations', decision.index, edits)}
                      onSave={onSave}
                    />
                  )}
                  itemLabel={(item) =>
                    `${(item as SyncEducation).degree || ''} at ${(item as SyncEducation).institution}`
                  }
                  emptyMessage="No education found in the resume."
                />
              </StepContainer>
            )}

            {/* ── Skills Step ── */}
            {currentStep === 'skills' && (
              <StepContainer key="skills">
                <StepHeader
                  icon={STEP_INFO.skills.icon}
                  title={STEP_INFO.skills.title}
                  description="Tap a skill to include or exclude it."
                />
                <SkillsReviewSection
                  items={preview.skills}
                  decisions={decisions.skills}
                  onToggle={(i) => toggleListItem('skills', i)}
                />
              </StepContainer>
            )}

            {/* ── Projects Step ── */}
            {currentStep === 'projects' && (
              <StepContainer key="projects">
                <StepHeader
                  icon={STEP_INFO.projects.icon}
                  title={STEP_INFO.projects.title}
                  description={buildStepDescription(preview.projects)}
                />
                <ListReviewSection
                  items={preview.projects}
                  decisions={decisions.projects}
                  onToggle={(i) => toggleListItem('projects', i)}
                  onEdit={(i, edits) => updateListItemEdits('projects', i, edits)}
                  editingIndex={editingIndex}
                  onSetEditing={setEditingIndex}
                  renderItem={(item) => <ProjectDisplay item={item} />}
                  renderEditForm={(item, decision, onSave) => (
                    <ProjectEditForm
                      item={{ ...item, ...(decision.edited || {}) } as SyncProject}
                      onUpdate={(edits) => updateListItemEdits('projects', decision.index, edits)}
                      onSave={onSave}
                    />
                  )}
                  itemLabel={(item) => (item as SyncProject).title}
                  emptyMessage="No projects found in the resume."
                />
              </StepContainer>
            )}

            {/* ── Links Step ── */}
            {currentStep === 'links' && (
              <StepContainer key="links">
                <StepHeader
                  icon={STEP_INFO.links.icon}
                  title={STEP_INFO.links.title}
                  description={buildStepDescription(preview.links)}
                />
                <ListReviewSection
                  items={preview.links}
                  decisions={decisions.links}
                  onToggle={(i) => toggleListItem('links', i)}
                  onEdit={() => {}}
                  editingIndex={null}
                  onSetEditing={() => {}}
                  renderItem={(item) => <LinkDisplay item={item} />}
                  itemLabel={(item) => (item as SyncLink).url}
                  emptyMessage="No links found in the resume."
                />
              </StepContainer>
            )}

            {/* ── Summary Step ── */}
            {currentStep === 'summary' && (
              <StepContainer key="summary">
                <StepHeader
                  icon={STEP_INFO.summary.icon}
                  title={counts.total > 0 ? 'Ready to Save' : 'No Changes Selected'}
                  description={
                    counts.total > 0
                      ? `${counts.total} change${counts.total === 1 ? '' : 's'} will be saved to your profile.`
                      : 'You can go back and select items to import.'
                  }
                />

                {counts.total > 0 && (
                  <div className="space-y-2">
                    {counts.profileChanges > 0 && (
                      <SummaryRow
                        icon={<User className="h-4 w-4" />}
                        label="Profile fields"
                        count={counts.profileChanges}
                      />
                    )}
                    {counts.experiences > 0 && (
                      <SummaryRow
                        icon={<Briefcase className="h-4 w-4" />}
                        label="Experiences"
                        count={counts.experiences}
                      />
                    )}
                    {counts.educations > 0 && (
                      <SummaryRow
                        icon={<GraduationCap className="h-4 w-4" />}
                        label="Education"
                        count={counts.educations}
                      />
                    )}
                    {counts.skills > 0 && (
                      <SummaryRow
                        icon={<Wrench className="h-4 w-4" />}
                        label="Skills"
                        count={counts.skills}
                      />
                    )}
                    {counts.projects > 0 && (
                      <SummaryRow
                        icon={<FolderGit2 className="h-4 w-4" />}
                        label="Projects"
                        count={counts.projects}
                      />
                    )}
                    {counts.links > 0 && (
                      <SummaryRow
                        icon={<LinkIcon className="h-4 w-4" />}
                        label="Links"
                        count={counts.links}
                      />
                    )}
                  </div>
                )}

                {applyError && (
                  <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {applyError}
                  </div>
                )}
              </StepContainer>
            )}
          </AnimatePresence>
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          <div className="flex items-center gap-2">
            {currentStepIndex > 0 && (
              <Button variant="ghost" onClick={goBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => setShowDiscardConfirm(true)}
              className="text-destructive/70 hover:text-destructive"
            >
              Discard
            </Button>
          </div>

          <div className="flex gap-2">
            {currentStep === 'summary' ? (
              <Button onClick={handleApply} disabled={isApplying || counts.total === 0}>
                {isApplying ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {isApplying
                  ? 'Saving...'
                  : counts.total === 0
                    ? 'Nothing to save'
                    : `Save ${counts.total} change${counts.total === 1 ? '' : 's'}`}
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={goNext} className="text-muted-foreground">
                  Skip
                </Button>
                <Button onClick={goNext}>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Discard confirmation */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard import?</AlertDialogTitle>
            <AlertDialogDescription>
              This will discard all changes from this resume. Your existing profile data will remain
              untouched. You can always re-import later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue reviewing</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// ─── Step Layout Components ───────────────────────────────────────

function StepContainer({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {children}
    </motion.div>
  );
}

function buildStepDescription(items: ItemPreview<unknown>[]): string {
  const newCount = items.filter((e) => e.action === 'add').length;
  const updateCount = items.filter((e) => e.action === 'update').length;
  const skipCount = items.filter((e) => e.action === 'skip').length;
  const parts: string[] = [];
  if (newCount > 0) parts.push(`${newCount} new`);
  if (updateCount > 0) parts.push(`${updateCount} updated`);
  if (skipCount > 0) parts.push(`${skipCount} already on your profile`);
  return parts.join(', ') || 'No items found';
}

function StepHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof User;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h2 className="mb-1 text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <Badge variant="secondary">{count}</Badge>
    </div>
  );
}

// ─── Profile Field Cards ──────────────────────────────────────────

function ProfileFillCard({
  field,
  decision,
  onChoiceChange,
}: {
  field: ProfileFieldPreview;
  decision: ProfileFieldDecision;
  onChoiceChange: (choice: ProfileFieldDecision['choice'], customValue?: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [customValue, setCustomValue] = useState(decision.customValue || field.incomingValue);

  return (
    <Card
      className={`transition-colors ${
        decision.choice !== 'current'
          ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20'
          : 'border-border'
      }`}
    >
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{field.label}</span>
          <Badge variant="outline" className="text-xs text-green-600">
            <Plus className="mr-1 h-3 w-3" />
            New
          </Badge>
        </div>

        {!isEditing ? (
          <div className="space-y-2">
            <p className="text-sm">
              {decision.choice === 'custom' ? decision.customValue : field.incomingValue}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={decision.choice !== 'current' ? 'default' : 'outline'}
                onClick={() => onChoiceChange('incoming')}
                className="h-7 text-xs"
              >
                <Check className="mr-1 h-3 w-3" />
                Add this
              </Button>
              <Button
                size="sm"
                variant={decision.choice === 'current' ? 'default' : 'ghost'}
                onClick={() => onChoiceChange('current')}
                className="h-7 text-xs"
              >
                Skip
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(true)}
                className="h-7 text-xs"
              >
                <Edit2 className="mr-1 h-3 w-3" />
                Edit
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {field.field === 'summary' ? (
              <Textarea
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                rows={3}
                className="text-sm"
              />
            ) : (
              <Input
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="text-sm"
              />
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onChoiceChange('custom', customValue);
                  setIsEditing(false);
                }}
                className="h-7 text-xs"
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(false)}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileUpdateCard({
  field,
  decision,
  onChoiceChange,
}: {
  field: ProfileFieldPreview;
  decision: ProfileFieldDecision;
  onChoiceChange: (choice: ProfileFieldDecision['choice'], customValue?: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [customValue, setCustomValue] = useState(decision.customValue || field.incomingValue);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <span className="text-sm font-medium text-muted-foreground">{field.label}</span>
          <Badge variant="outline" className="text-xs text-blue-600">
            Different in resume
          </Badge>
        </div>

        {isEditing ? (
          <div className="space-y-2 px-4 pb-3">
            {field.field === 'summary' ? (
              <Textarea
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                rows={3}
                className="text-sm"
              />
            ) : (
              <Input
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="text-sm"
              />
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onChoiceChange('custom', customValue);
                  setIsEditing(false);
                }}
                className="h-7 text-xs"
              >
                Use this value
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(false)}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Side-by-side options */}
            <div className="grid grid-cols-2 gap-2 px-3 pb-3">
              <button
                type="button"
                onClick={() => onChoiceChange('current')}
                className={`rounded-lg border-2 px-3 py-3 text-left transition-all ${
                  decision.choice === 'current'
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-transparent bg-muted/40 opacity-60 hover:bg-muted/70 hover:opacity-100'
                }`}
              >
                <div className="mb-1.5 flex items-center gap-1.5">
                  {decision.choice === 'current' ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide ${
                      decision.choice === 'current' ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    Keep current
                  </span>
                </div>
                <p
                  className={`text-sm ${
                    decision.choice === 'current'
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {field.currentValue}
                </p>
              </button>

              <button
                type="button"
                onClick={() => onChoiceChange('incoming')}
                className={`rounded-lg border-2 px-3 py-3 text-left transition-all ${
                  decision.choice === 'incoming'
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-transparent bg-muted/40 opacity-60 hover:bg-muted/70 hover:opacity-100'
                }`}
              >
                <div className="mb-1.5 flex items-center gap-1.5">
                  {decision.choice === 'incoming' ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide ${
                      decision.choice === 'incoming' ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    From resume
                  </span>
                </div>
                <p
                  className={`text-sm ${
                    decision.choice === 'incoming'
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {field.incomingValue}
                </p>
              </button>
            </div>

            {/* Custom edit option */}
            <div className="flex items-center justify-between border-t px-4 py-2">
              {decision.choice === 'custom' ? (
                <p className="text-xs text-primary">
                  Using custom value: &ldquo;{decision.customValue}&rdquo;
                </p>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(true)}
                className="h-7 text-xs"
              >
                <Edit2 className="mr-1 h-3 w-3" />
                Write my own
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── List Review Section (Experiences, Education, Projects, Links) ─

function ListReviewSection<T>({
  items,
  decisions,
  onToggle,
  editingIndex,
  onSetEditing,
  renderItem,
  renderEditForm,
  itemLabel,
  emptyMessage,
}: {
  items: ItemPreview<T>[];
  decisions: ListItemDecision[];
  onToggle: (index: number) => void;
  onEdit?: (index: number, edits: Record<string, unknown>) => void;
  editingIndex: number | null;
  onSetEditing: (index: number | null) => void;
  renderItem: (item: T) => React.ReactNode;
  renderEditForm?: (item: T, decision: ListItemDecision, onSave: () => void) => React.ReactNode;
  itemLabel: (item: T) => string;
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  // Separate new items, updated items, and duplicates
  const newItems = items
    .map((item, i) => ({ ...item, originalIndex: i }))
    .filter((item) => item.action === 'add');
  const updatedItems = items
    .map((item, i) => ({ ...item, originalIndex: i }))
    .filter((item) => item.action === 'update');
  const duplicateItems = items
    .map((item, i) => ({ ...item, originalIndex: i }))
    .filter((item) => item.action === 'skip');

  return (
    <div className="space-y-4">
      {/* Updated items (existing records with changes) */}
      {updatedItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Updated from resume
          </p>
          {updatedItems.map(({ item, originalIndex, reason }) => {
            const decision = decisions[originalIndex];
            const isEditing = editingIndex === originalIndex;

            return (
              <Card
                key={originalIndex}
                className={`transition-colors ${
                  decision?.include
                    ? 'border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/10'
                    : 'border-muted bg-muted/20 opacity-60'
                }`}
              >
                <CardContent className="p-4">
                  {isEditing && renderEditForm ? (
                    renderEditForm(item, decision, () => onSetEditing(null))
                  ) : (
                    <>
                      {renderItem(item)}
                      {reason && (
                        <p className="mt-1.5 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <RefreshCw className="h-3 w-3" />
                          {reason}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        {decision?.include ? (
                          <>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Updated
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onToggle(originalIndex)}
                              className="h-7 text-xs text-destructive/70 hover:text-destructive"
                            >
                              Discard
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              Discarded
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onToggle(originalIndex)}
                              className="h-7 text-xs"
                            >
                              <RefreshCw className="mr-1 h-3 w-3" />
                              Undo
                            </Button>
                          </>
                        )}
                        {renderEditForm && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onSetEditing(originalIndex)}
                            className="h-7 text-xs"
                          >
                            <Edit2 className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New items */}
      {newItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            New — will be added
          </p>
          {newItems.map(({ item, originalIndex }) => {
            const decision = decisions[originalIndex];
            const isEditing = editingIndex === originalIndex;

            return (
              <Card
                key={originalIndex}
                className={`transition-colors ${
                  decision?.include
                    ? 'border-green-200 bg-green-50/30 dark:border-green-900 dark:bg-green-950/10'
                    : 'border-border opacity-60'
                }`}
              >
                <CardContent className="p-4">
                  {isEditing && renderEditForm ? (
                    renderEditForm(item, decision, () => onSetEditing(null))
                  ) : (
                    <>
                      {renderItem(item)}
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant={decision?.include ? 'default' : 'outline'}
                          onClick={() => onToggle(originalIndex)}
                          className="h-7 text-xs"
                        >
                          {decision?.include ? (
                            <>
                              <Check className="mr-1 h-3 w-3" />
                              Included
                            </>
                          ) : (
                            <>
                              <Plus className="mr-1 h-3 w-3" />
                              Include
                            </>
                          )}
                        </Button>
                        {renderEditForm && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onSetEditing(originalIndex)}
                            className="h-7 text-xs"
                          >
                            <Edit2 className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Duplicates */}
      {duplicateItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Already on your profile — skipped
          </p>
          {duplicateItems.map(({ item, originalIndex }) => (
            <Card key={originalIndex} className="border-border opacity-60">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{itemLabel(item)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Skills Review (chip-based) ───────────────────────────────────

function SkillsReviewSection({
  items,
  decisions,
  onToggle,
}: {
  items: ItemPreview<{ name: string }>[];
  decisions: ListItemDecision[];
  onToggle: (index: number) => void;
}) {
  const newSkills = items
    .map((item, i) => ({ ...item, originalIndex: i }))
    .filter((item) => item.action === 'add');
  const existingSkills = items
    .map((item, i) => ({ ...item, originalIndex: i }))
    .filter((item) => item.action === 'skip');

  return (
    <div className="space-y-4">
      {newSkills.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            New skills — tap to include/exclude
          </p>
          <div className="flex flex-wrap gap-2">
            {newSkills.map(({ item, originalIndex }) => {
              const decision = decisions[originalIndex];
              return (
                <button
                  key={originalIndex}
                  type="button"
                  onClick={() => onToggle(originalIndex)}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
                    decision?.include
                      ? 'border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {decision?.include ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  {item.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {existingSkills.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Already on your profile
          </p>
          <div className="flex flex-wrap gap-2">
            {existingSkills.map(({ item, originalIndex }) => (
              <span
                key={originalIndex}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground"
              >
                <CheckCircle2 className="h-3 w-3" />
                {item.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No skills found in the resume.</p>
        </div>
      )}
    </div>
  );
}

// ─── Display Components ───────────────────────────────────────────

function ExperienceDisplay({ item }: { item: SyncExperience }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Role
          </p>
          <p className="text-sm">{item.role}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Company
          </p>
          <p className="text-sm">{item.company}</p>
        </div>
      </div>
      {item.location && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Location
          </p>
          <p className="text-sm">{item.location}</p>
        </div>
      )}
      {(item.startDate || item.endDate) && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Duration
          </p>
          <p className="text-sm">
            {item.startDate || '?'} — {item.isCurrent ? 'Present' : item.endDate || '?'}
          </p>
        </div>
      )}
      {item.bullets && item.bullets.length > 0 && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Highlights
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
            {item.bullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EducationDisplay({ item }: { item: SyncEducation }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Institution
          </p>
          <p className="text-sm">{item.institution}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Degree
          </p>
          <p className="text-sm">{item.degree || '—'}</p>
        </div>
      </div>
      {item.fieldOfStudy && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Field of Study
          </p>
          <p className="text-sm">{item.fieldOfStudy}</p>
        </div>
      )}
      {(item.startDate || item.endDate) && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Duration
          </p>
          <p className="text-sm">
            {item.startDate || '?'} — {item.endDate || '?'}
          </p>
        </div>
      )}
      {item.gpa && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            GPA
          </p>
          <p className="text-sm">{item.gpa}</p>
        </div>
      )}
    </div>
  );
}

function ProjectDisplay({ item }: { item: SyncProject }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Title
        </p>
        <p className="text-sm">{item.title}</p>
      </div>
      {item.description && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Description
          </p>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{item.description}</p>
        </div>
      )}
      {item.technologies && item.technologies.length > 0 && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Technologies
          </p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {item.technologies.map((tech) => (
              <span
                key={tech}
                className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}
      {(item.repoUrl || item.liveUrl) && (
        <div className="grid grid-cols-2 gap-x-4">
          {item.repoUrl && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Repository
              </p>
              <p className="truncate text-sm text-muted-foreground">{item.repoUrl}</p>
            </div>
          )}
          {item.liveUrl && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Live URL
              </p>
              <p className="truncate text-sm text-muted-foreground">{item.liveUrl}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LinkDisplay({ item }: { item: SyncLink }) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-x-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Label
          </p>
          <p className="text-sm">{item.label || '—'}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Type
          </p>
          <Badge variant="outline" className="text-xs">
            {item.type}
          </Badge>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">URL</p>
        <p className="truncate text-sm text-muted-foreground">{item.url}</p>
      </div>
    </div>
  );
}

// ─── Edit Forms ───────────────────────────────────────────────────

function ExperienceEditForm({
  item,
  onUpdate,
  onSave,
}: {
  item: SyncExperience;
  onUpdate: (edits: Record<string, unknown>) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Company</label>
          <Input
            value={item.company}
            onChange={(e) => onUpdate({ company: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Role</label>
          <Input
            value={item.role}
            onChange={(e) => onUpdate({ role: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Location</label>
        <Input
          value={item.location || ''}
          onChange={(e) => onUpdate({ location: e.target.value })}
          className="h-8 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Start Date</label>
          <Input
            value={item.startDate || ''}
            onChange={(e) => onUpdate({ startDate: e.target.value })}
            placeholder="e.g. Jan 2024"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">End Date</label>
          <Input
            value={item.isCurrent ? 'Present' : item.endDate || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (val.toLowerCase() === 'present') {
                onUpdate({ endDate: '', isCurrent: true });
              } else {
                onUpdate({ endDate: val, isCurrent: false });
              }
            }}
            placeholder="e.g. Dec 2025 or Present"
            className="h-8 text-sm"
            disabled={false}
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Highlights (one per line)</label>
        <Textarea
          value={(item.bullets || []).join('\n')}
          onChange={(e) =>
            onUpdate({
              bullets: e.target.value.split('\n').filter((b: string) => b.trim().length > 0),
            })
          }
          rows={3}
          className="text-sm"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} className="h-7 text-xs">
          <Check className="mr-1 h-3 w-3" />
          Done
        </Button>
        <Button size="sm" variant="ghost" onClick={onSave} className="h-7 text-xs">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function EducationEditForm({
  item,
  onUpdate,
  onSave,
}: {
  item: SyncEducation;
  onUpdate: (edits: Record<string, unknown>) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Institution</label>
          <Input
            value={item.institution}
            onChange={(e) => onUpdate({ institution: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Degree</label>
          <Input
            value={item.degree || ''}
            onChange={(e) => onUpdate({ degree: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Field of Study</label>
        <Input
          value={item.fieldOfStudy || ''}
          onChange={(e) => onUpdate({ fieldOfStudy: e.target.value })}
          className="h-8 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Start Date</label>
          <Input
            value={item.startDate || ''}
            onChange={(e) => onUpdate({ startDate: e.target.value })}
            placeholder="e.g. Jan 2024"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">End Date</label>
          <Input
            value={item.endDate || ''}
            onChange={(e) => onUpdate({ endDate: e.target.value })}
            placeholder="e.g. Dec 2025"
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} className="h-7 text-xs">
          <Check className="mr-1 h-3 w-3" />
          Done
        </Button>
        <Button size="sm" variant="ghost" onClick={onSave} className="h-7 text-xs">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ProjectEditForm({
  item,
  onUpdate,
  onSave,
}: {
  item: SyncProject;
  onUpdate: (edits: Record<string, unknown>) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium">Title</label>
        <Input
          value={item.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          className="h-8 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Description</label>
        <Textarea
          value={item.description || ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          rows={2}
          className="text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium">Technologies (comma-separated)</label>
        <Input
          value={(item.technologies || []).join(', ')}
          onChange={(e) =>
            onUpdate({
              technologies: e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
          className="h-8 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} className="h-7 text-xs">
          <Check className="mr-1 h-3 w-3" />
          Done
        </Button>
        <Button size="sm" variant="ghost" onClick={onSave} className="h-7 text-xs">
          Cancel
        </Button>
      </div>
    </div>
  );
}
