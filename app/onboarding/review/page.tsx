'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  GraduationCap,
  Link as LinkIcon,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  User,
  Wrench,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { toMonthInputFormat } from '@/lib/utils';

// Types for parsed resume data
interface ParsedProfile {
  firstName?: string;
  lastName?: string;
  headline?: string;
  summary?: string;
  location?: string;
}

interface ParsedExperience {
  id: string;
  company: string;
  role: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  bullets?: string[];
}

interface ParsedEducation {
  id: string;
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
}

interface ParsedSkill {
  id: string;
  name: string;
}

interface ParsedLink {
  id: string;
  type: string;
  url: string;
  label?: string;
}

interface ReviewData {
  profile: ParsedProfile;
  experiences: ParsedExperience[];
  educations: ParsedEducation[];
  skills: ParsedSkill[];
  links: ParsedLink[];
  contactInfo?: {
    email?: string;
    phone?: string;
  };
}

type ReviewStep = 'profile' | 'experience' | 'education' | 'skills' | 'links' | 'complete';

const STEPS: ReviewStep[] = ['profile', 'experience', 'education', 'skills', 'links', 'complete'];

const STEP_INFO: Record<ReviewStep, { title: string; description: string; icon: typeof User }> = {
  profile: {
    title: 'Basic Info',
    description: 'Review your name, headline, and summary',
    icon: User,
  },
  experience: {
    title: 'Work Experience',
    description: 'Review and edit your work history',
    icon: Briefcase,
  },
  education: {
    title: 'Education',
    description: 'Review your educational background',
    icon: GraduationCap,
  },
  skills: {
    title: 'Skills',
    description: 'Review your skills and expertise',
    icon: Wrench,
  },
  links: {
    title: 'Links',
    description: 'Add your social and portfolio links',
    icon: LinkIcon,
  },
  complete: {
    title: 'All Done!',
    description: 'Your profile is ready',
    icon: Check,
  },
};

// Generate unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

function ReviewPageContent() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<ReviewStep>('profile');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Review data state
  const [data, setData] = useState<ReviewData>({
    profile: {},
    experiences: [],
    educations: [],
    skills: [],
    links: [],
  });

  // Editing states
  const [editingExperienceId, setEditingExperienceId] = useState<string | null>(null);
  const [editingEducationId, setEditingEducationId] = useState<string | null>(null);

  // Load parsed data from sessionStorage or URL
  useEffect(() => {
    const loadData = () => {
      try {
        // Try to get data from sessionStorage
        const storedData = sessionStorage.getItem('onboarding_parsed_resume');
        console.log('[Review] Loaded from sessionStorage:', storedData ? 'yes' : 'no');

        if (storedData) {
          const parsed = JSON.parse(storedData);
          console.log('[Review] Parsed data:', parsed);
          console.log('[Review] Profile:', parsed.profile);
          console.log('[Review] Experiences:', parsed.experiences?.length || 0);
          console.log('[Review] Educations:', parsed.educations?.length || 0);
          console.log('[Review] Skills:', parsed.skills?.length || 0);

          // Transform to our format with IDs and convert dates to YYYY-MM format
          const transformedData: ReviewData = {
            profile: parsed.profile || {},
            experiences: (parsed.experiences || []).map((exp: Record<string, unknown>) => ({
              id: generateId(),
              company: exp.company || '',
              role: exp.role || '',
              location: exp.location,
              startDate: toMonthInputFormat(exp.startDate as string),
              endDate: toMonthInputFormat(exp.endDate as string),
              isCurrent: exp.isCurrent,
              description: exp.description,
              bullets: exp.bullets,
            })),
            educations: (parsed.educations || []).map((edu: Record<string, unknown>) => ({
              id: generateId(),
              institution: edu.institution || '',
              degree: edu.degree,
              fieldOfStudy: edu.fieldOfStudy,
              startDate: toMonthInputFormat(edu.startDate as string),
              endDate: toMonthInputFormat(edu.endDate as string),
              gpa: edu.gpa,
            })),
            skills: (parsed.skills || []).map((skill: string | { name: string }) => ({
              id: generateId(),
              name: typeof skill === 'string' ? skill : skill.name,
            })),
            links: (parsed.links || []).map((link: Record<string, unknown>) => ({
              id: generateId(),
              type: (link.type as string) || 'OTHER',
              url: link.url as string,
              label: link.label as string | undefined,
            })),
            contactInfo: parsed.contactInfo,
          };

          setData(transformedData);
        }
      } catch (err) {
        console.error('Failed to load parsed data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const currentStepIndex = STEPS.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const goToNextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  };

  const goToPreviousStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Get handle from sessionStorage or generate one
      const storedHandle = sessionStorage.getItem('onboarding_handle');
      const firstName = data.profile.firstName || 'User';
      const lastName = data.profile.lastName || '';

      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          handle: storedHandle,
          reviewedData: {
            profile: data.profile,
            experiences: data.experiences,
            educations: data.educations,
            skills: data.skills.map((s) => s.name),
            links: data.links,
            contactInfo: data.contactInfo,
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save profile');
      }

      // Clear session data
      sessionStorage.removeItem('onboarding_parsed_resume');
      sessionStorage.removeItem('onboarding_handle');

      // Redirect to profile
      router.refresh();
      router.push('/me');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  };

  // Profile update handlers
  const updateProfile = (field: keyof ParsedProfile, value: string) => {
    setData((prev) => ({
      ...prev,
      profile: { ...prev.profile, [field]: value },
    }));
  };

  // Experience handlers
  const updateExperience = (id: string, updates: Partial<ParsedExperience>) => {
    setData((prev) => ({
      ...prev,
      experiences: prev.experiences.map((exp) => (exp.id === id ? { ...exp, ...updates } : exp)),
    }));
  };

  const deleteExperience = (id: string) => {
    setData((prev) => ({
      ...prev,
      experiences: prev.experiences.filter((exp) => exp.id !== id),
    }));
  };

  const addExperience = () => {
    const newExp: ParsedExperience = {
      id: generateId(),
      company: '',
      role: '',
    };
    setData((prev) => ({
      ...prev,
      experiences: [...prev.experiences, newExp],
    }));
    setEditingExperienceId(newExp.id);
  };

  // Education handlers
  const updateEducation = (id: string, updates: Partial<ParsedEducation>) => {
    setData((prev) => ({
      ...prev,
      educations: prev.educations.map((edu) => (edu.id === id ? { ...edu, ...updates } : edu)),
    }));
  };

  const deleteEducation = (id: string) => {
    setData((prev) => ({
      ...prev,
      educations: prev.educations.filter((edu) => edu.id !== id),
    }));
  };

  const addEducation = () => {
    const newEdu: ParsedEducation = {
      id: generateId(),
      institution: '',
    };
    setData((prev) => ({
      ...prev,
      educations: [...prev.educations, newEdu],
    }));
    setEditingEducationId(newEdu.id);
  };

  // Skill handlers
  const deleteSkill = (id: string) => {
    setData((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s.id !== id),
    }));
  };

  const addSkill = (name: string) => {
    if (!name.trim()) return;
    setData((prev) => ({
      ...prev,
      skills: [...prev.skills, { id: generateId(), name: name.trim() }],
    }));
  };

  // Link handlers
  const updateLink = (id: string, updates: Partial<ParsedLink>) => {
    setData((prev) => ({
      ...prev,
      links: prev.links.map((link) => (link.id === id ? { ...link, ...updates } : link)),
    }));
  };

  const deleteLink = (id: string) => {
    setData((prev) => ({
      ...prev,
      links: prev.links.filter((link) => link.id !== id),
    }));
  };

  const addLink = () => {
    setData((prev) => ({
      ...prev,
      links: [...prev.links, { id: generateId(), type: 'OTHER', url: '' }],
    }));
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      {/* Progress bar */}
      <div className="fixed left-0 right-0 top-16 z-40 h-1 bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Step indicators */}
      <div className="fixed left-0 right-0 top-20 z-30">
        <div className="mx-auto flex max-w-md justify-center gap-2 px-4">
          {STEPS.slice(0, -1).map((step, index) => (
            <button
              key={step}
              onClick={() => setCurrentStep(step)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all ${
                index < currentStepIndex
                  ? 'bg-primary text-primary-foreground'
                  : index === currentStepIndex
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {index < currentStepIndex ? <Check className="h-4 w-4" /> : index + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-16 pt-20">
        <AnimatePresence mode="wait">
          {/* Profile Step */}
          {currentStep === 'profile' && (
            <StepContainer key="profile">
              <StepHeader
                icon={STEP_INFO.profile.icon}
                title={STEP_INFO.profile.title}
                description={STEP_INFO.profile.description}
              />

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">First Name</label>
                    <Input
                      value={data.profile.firstName || ''}
                      onChange={(e) => updateProfile('firstName', e.target.value)}
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Last Name</label>
                    <Input
                      value={data.profile.lastName || ''}
                      onChange={(e) => updateProfile('lastName', e.target.value)}
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Headline</label>
                  <Input
                    value={data.profile.headline || ''}
                    onChange={(e) => updateProfile('headline', e.target.value)}
                    placeholder="Software Engineer at Google"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Location</label>
                  <Input
                    value={data.profile.location || ''}
                    onChange={(e) => updateProfile('location', e.target.value)}
                    placeholder="San Francisco, CA"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Summary</label>
                  <Textarea
                    value={data.profile.summary || ''}
                    onChange={(e) => updateProfile('summary', e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={4}
                  />
                </div>
              </div>

              <StepNavigation
                onBack={() => router.push('/onboarding/import')}
                onNext={goToNextStep}
                backLabel="Back"
              />
            </StepContainer>
          )}

          {/* Experience Step */}
          {currentStep === 'experience' && (
            <StepContainer key="experience">
              <StepHeader
                icon={STEP_INFO.experience.icon}
                title={STEP_INFO.experience.title}
                description={STEP_INFO.experience.description}
                count={data.experiences.length}
              />

              {data.experiences.length === 0 ? (
                <EmptyState
                  message="No work experience found in your resume"
                  onAdd={addExperience}
                  addLabel="Add Experience"
                />
              ) : (
                <div className="space-y-3">
                  {data.experiences.map((exp) => (
                    <ExperienceCard
                      key={exp.id}
                      experience={exp}
                      isEditing={editingExperienceId === exp.id}
                      onEdit={() => setEditingExperienceId(exp.id)}
                      onSave={() => setEditingExperienceId(null)}
                      onUpdate={(updates) => updateExperience(exp.id, updates)}
                      onDelete={() => deleteExperience(exp.id)}
                    />
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addExperience}
                    className="w-full gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Another Experience
                  </Button>
                </div>
              )}

              <StepNavigation onBack={goToPreviousStep} onNext={goToNextStep} />
            </StepContainer>
          )}

          {/* Education Step */}
          {currentStep === 'education' && (
            <StepContainer key="education">
              <StepHeader
                icon={STEP_INFO.education.icon}
                title={STEP_INFO.education.title}
                description={STEP_INFO.education.description}
                count={data.educations.length}
              />

              {data.educations.length === 0 ? (
                <EmptyState
                  message="No education found in your resume"
                  onAdd={addEducation}
                  addLabel="Add Education"
                />
              ) : (
                <div className="space-y-3">
                  {data.educations.map((edu) => (
                    <EducationCard
                      key={edu.id}
                      education={edu}
                      isEditing={editingEducationId === edu.id}
                      onEdit={() => setEditingEducationId(edu.id)}
                      onSave={() => setEditingEducationId(null)}
                      onUpdate={(updates) => updateEducation(edu.id, updates)}
                      onDelete={() => deleteEducation(edu.id)}
                    />
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addEducation}
                    className="w-full gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Another Education
                  </Button>
                </div>
              )}

              <StepNavigation onBack={goToPreviousStep} onNext={goToNextStep} />
            </StepContainer>
          )}

          {/* Skills Step */}
          {currentStep === 'skills' && (
            <StepContainer key="skills">
              <StepHeader
                icon={STEP_INFO.skills.icon}
                title={STEP_INFO.skills.title}
                description={STEP_INFO.skills.description}
                count={data.skills.length}
              />

              <SkillsEditor skills={data.skills} onAdd={addSkill} onDelete={deleteSkill} />

              <StepNavigation onBack={goToPreviousStep} onNext={goToNextStep} />
            </StepContainer>
          )}

          {/* Links Step */}
          {currentStep === 'links' && (
            <StepContainer key="links">
              <StepHeader
                icon={STEP_INFO.links.icon}
                title={STEP_INFO.links.title}
                description={STEP_INFO.links.description}
                count={data.links.length}
              />

              <div className="space-y-3">
                {data.links.map((link) => (
                  <LinkCard
                    key={link.id}
                    link={link}
                    onUpdate={(updates) => updateLink(link.id, updates)}
                    onDelete={() => deleteLink(link.id)}
                  />
                ))}
                <Button variant="outline" size="sm" onClick={addLink} className="w-full gap-2">
                  <Plus className="h-4 w-4" />
                  Add Link
                </Button>
              </div>

              <StepNavigation
                onBack={goToPreviousStep}
                onNext={goToNextStep}
                nextLabel="Review & Create"
              />
            </StepContainer>
          )}

          {/* Complete Step */}
          {currentStep === 'complete' && (
            <StepContainer key="complete">
              <div className="py-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.5 }}
                  className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"
                >
                  <Sparkles className="h-10 w-10 text-primary" />
                </motion.div>

                <h2 className="mb-2 text-2xl font-bold">You&apos;re All Set!</h2>
                <p className="mb-8 text-muted-foreground">
                  Your profile is ready to be created. Here&apos;s a summary:
                </p>

                <div className="mb-8 grid grid-cols-2 gap-4 text-left">
                  <SummaryCard
                    label="Profile"
                    value={
                      data.profile.firstName
                        ? `${data.profile.firstName} ${data.profile.lastName || ''}`
                        : 'Not set'
                    }
                  />
                  <SummaryCard label="Experiences" value={`${data.experiences.length} entries`} />
                  <SummaryCard label="Education" value={`${data.educations.length} entries`} />
                  <SummaryCard label="Skills" value={`${data.skills.length} skills`} />
                </div>

                {error && (
                  <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={goToPreviousStep} className="flex-1">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={handleSaveProfile} disabled={isSaving} className="flex-1 gap-2">
                    {isSaving ? (
                      <>
                        <Spinner size="sm" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Create My Follio
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </StepContainer>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// Wrap with Suspense for useSearchParams
export default function OnboardingReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <ReviewPageContent />
    </Suspense>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================

function StepContainer({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {children}
    </motion.div>
  );
}

function StepHeader({
  icon: Icon,
  title,
  description,
  count,
}: {
  icon: typeof User;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="h-7 w-7 text-primary" />
      </div>
      <h2 className="mb-1 text-xl font-semibold">
        {title}
        {count !== undefined && (
          <Badge variant="secondary" className="ml-2">
            {count}
          </Badge>
        )}
      </h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StepNavigation({
  onBack,
  onNext,
  backLabel = 'Back',
  nextLabel = 'Next',
  showSkip = true,
}: {
  onBack: () => void;
  onNext: () => void;
  backLabel?: string;
  nextLabel?: string;
  showSkip?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-6">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {backLabel}
      </Button>
      <div className="flex gap-2">
        {showSkip && (
          <Button variant="ghost" onClick={onNext} className="text-muted-foreground">
            Skip
          </Button>
        )}
        <Button onClick={onNext}>
          {nextLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function EmptyState({
  message,
  onAdd,
  addLabel,
}: {
  message: string;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="mb-4 text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onAdd} className="gap-2">
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}

function ExperienceCard({
  experience,
  isEditing,
  onEdit,
  onSave,
  onUpdate,
  onDelete,
}: {
  experience: ParsedExperience;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onUpdate: (updates: Partial<ParsedExperience>) => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return (
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Company *</label>
              <Input
                placeholder="e.g. Google"
                value={experience.company}
                onChange={(e) => onUpdate({ company: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Role / Title *</label>
              <Input
                placeholder="e.g. Software Engineer"
                value={experience.role}
                onChange={(e) => onUpdate({ role: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Location</label>
            <Input
              placeholder="e.g. San Francisco, CA"
              value={experience.location || ''}
              onChange={(e) => onUpdate({ location: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Start Date</label>
              <Input
                type="month"
                value={experience.startDate || ''}
                onChange={(e) => onUpdate({ startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">End Date</label>
              <Input
                type="month"
                value={experience.isCurrent ? '' : experience.endDate || ''}
                onChange={(e) => onUpdate({ endDate: e.target.value, isCurrent: false })}
                disabled={experience.isCurrent}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`current-${experience.id}`}
              checked={experience.isCurrent || false}
              onChange={(e) =>
                onUpdate({
                  isCurrent: e.target.checked,
                  endDate: e.target.checked ? undefined : experience.endDate,
                })
              }
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor={`current-${experience.id}`} className="text-sm">
              I currently work here
            </label>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Description / Achievements</label>
            <Textarea
              placeholder="Describe your responsibilities and achievements (one per line for bullet points)..."
              value={
                experience.description ||
                (experience.bullets && experience.bullets.length > 0
                  ? experience.bullets.join('\n')
                  : '')
              }
              onChange={(e) => {
                const text = e.target.value;
                // If text has newlines, treat as bullets
                if (text.includes('\n')) {
                  const bullets = text
                    .split('\n')
                    .map((b) => b.trim())
                    .filter((b) => b.length > 0);
                  onUpdate({ description: undefined, bullets });
                } else {
                  onUpdate({ description: text, bullets: undefined });
                }
              }}
              rows={4}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Use new lines to separate bullet points
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-1 h-4 w-4" />
              Delete
            </Button>
            <Button size="sm" onClick={onSave}>
              <Check className="mr-1 h-4 w-4" />
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group relative">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h4 className="font-medium">{experience.role || 'Untitled Role'}</h4>
            <p className="text-sm text-muted-foreground">
              {experience.company || 'Unknown Company'}
              {experience.location && ` · ${experience.location}`}
            </p>
            {(experience.startDate || experience.endDate) && (
              <p className="text-xs text-muted-foreground">
                {experience.startDate || '?'} — {experience.endDate || 'Present'}
              </p>
            )}
            {experience.description && (
              <p className="mt-2 text-sm text-muted-foreground">{experience.description}</p>
            )}
            {experience.bullets && experience.bullets.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {experience.bullets.map((bullet, idx) => (
                  <li key={idx}>{bullet}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EducationCard({
  education,
  isEditing,
  onEdit,
  onSave,
  onUpdate,
  onDelete,
}: {
  education: ParsedEducation;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onUpdate: (updates: Partial<ParsedEducation>) => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return (
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Institution *</label>
            <Input
              placeholder="e.g. Stanford University"
              value={education.institution}
              onChange={(e) => onUpdate({ institution: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Degree</label>
              <Input
                placeholder="e.g. Bachelor of Science"
                value={education.degree || ''}
                onChange={(e) => onUpdate({ degree: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Field of Study</label>
              <Input
                placeholder="e.g. Computer Science"
                value={education.fieldOfStudy || ''}
                onChange={(e) => onUpdate({ fieldOfStudy: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Start Date</label>
              <Input
                type="month"
                value={education.startDate || ''}
                onChange={(e) => onUpdate({ startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">End Date</label>
              <Input
                type="month"
                value={education.endDate || ''}
                onChange={(e) => onUpdate({ endDate: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">GPA</label>
              <Input
                placeholder="e.g. 3.8"
                value={education.gpa || ''}
                onChange={(e) => onUpdate({ gpa: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-1 h-4 w-4" />
              Delete
            </Button>
            <Button size="sm" onClick={onSave}>
              <Check className="mr-1 h-4 w-4" />
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group relative">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="font-medium">{education.degree || 'Degree'}</h4>
            <p className="text-sm text-muted-foreground">
              {education.institution || 'Unknown Institution'}
              {education.fieldOfStudy && ` · ${education.fieldOfStudy}`}
            </p>
            {(education.startDate || education.endDate) && (
              <p className="text-xs text-muted-foreground">
                {education.startDate || '?'} — {education.endDate || 'Present'}
                {education.gpa && ` · GPA: ${education.gpa}`}
              </p>
            )}
          </div>
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkillsEditor({
  skills,
  onAdd,
  onDelete,
}: {
  skills: ParsedSkill[];
  onAdd: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [newSkill, setNewSkill] = useState('');

  const handleAdd = () => {
    if (newSkill.trim()) {
      onAdd(newSkill.trim());
      setNewSkill('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <Badge
            key={skill.id}
            variant="secondary"
            className="group cursor-pointer gap-1 py-1.5 pr-1 text-sm"
            onClick={() => onDelete(skill.id)}
          >
            {skill.name}
            <span className="ml-1 rounded-full p-0.5 opacity-50 transition-opacity group-hover:bg-destructive/20 group-hover:opacity-100">
              <Trash2 className="h-3 w-3" />
            </span>
          </Badge>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Add a skill..."
          value={newSkill}
          onChange={(e) => setNewSkill(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button onClick={handleAdd} disabled={!newSkill.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Click on a skill to remove it. Press Enter or click + to add.
      </p>
    </div>
  );
}

function LinkCard({
  link,
  onUpdate,
  onDelete,
}: {
  link: ParsedLink;
  onUpdate: (updates: Partial<ParsedLink>) => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <select
          value={link.type}
          onChange={(e) => onUpdate({ type: e.target.value })}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          <option value="GITHUB">GitHub</option>
          <option value="LINKEDIN">LinkedIn</option>
          <option value="TWITTER">Twitter</option>
          <option value="PORTFOLIO">Portfolio</option>
          <option value="BLOG">Blog</option>
          <option value="YOUTUBE">YouTube</option>
          <option value="OTHER">Other</option>
        </select>
        <Input
          placeholder="URL"
          value={link.url}
          onChange={(e) => onUpdate({ url: e.target.value })}
          className="flex-1"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}
