'use client';

import { motion } from 'framer-motion';
import {
  Award,
  Briefcase,
  Building2,
  GraduationCap,
  Layers,
  Mail,
  MapPin,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { computeAlgorithmicSnapView } from '@/lib/snap-view-utils';
import type { PublicProfile } from '@/types';
import type { SnapViewData } from '@/types/snap-view';

// ============================================================================
// COMPONENT
// ============================================================================

interface SnapViewProps {
  profile: PublicProfile;
}

export function SnapView({ profile }: SnapViewProps) {
  // Start with algorithmic data (instant), upgrade to AI data when ready
  const [snapData, setSnapData] = useState<SnapViewData>(() => computeAlgorithmicSnapView(profile));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchAIData() {
      try {
        const response = await fetch(`/api/profile/${profile.handle}/snap-view`);
        if (!response.ok) return;
        const data: SnapViewData = await response.json();
        if (!cancelled) {
          setSnapData(data);
        }
      } catch {
        // Keep algorithmic data on failure
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchAIData();
    return () => {
      cancelled = true;
    };
  }, [profile.handle]);

  const initials = `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`;
  const fullName = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim();
  const email = profile.contactInfo?.email;
  const linkedIn = profile.links?.find((l) => l.type === 'LINKEDIN');
  const github = profile.links?.find((l) => l.type === 'GITHUB');
  const website = profile.contactInfo?.website;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-8 sm:px-10 md:py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="snap-card overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl"
      >
        {/* ── HEADER ──────────────────────────────────────── */}
        <div className="border-b border-border/40 bg-gradient-to-r from-primary/[0.04] via-transparent to-primary/[0.04] px-8 py-7 sm:px-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
            <Avatar className="h-20 w-20 shrink-0 border-[3px] border-background shadow-lg ring-2 ring-primary/10">
              <AvatarImage src={profile.avatarUrl || undefined} alt={fullName} />
              <AvatarFallback className="text-xl font-semibold">{initials}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{fullName}</h1>
              <p className="mt-1.5 text-base leading-relaxed text-muted-foreground sm:text-lg">
                {snapData.tagline}
              </p>
            </div>

            {/* Contact pills */}
            <div className="flex flex-wrap items-center gap-2 text-sm sm:flex-col sm:items-end">
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {email}
                </a>
              )}
              {profile.location && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {profile.location}
                </span>
              )}
              <div className="flex gap-2">
                {linkedIn && (
                  <a
                    href={linkedIn.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-muted/60 px-3 py-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    LinkedIn
                  </a>
                )}
                {github && (
                  <a
                    href={github.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-muted/60 px-3 py-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    GitHub
                  </a>
                )}
                {website && (
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-muted/60 px-3 py-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    Website
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── STATS BAR ────────────────────────────────────── */}
        <div className="grid grid-cols-2 divide-x divide-border/40 border-b border-border/40 sm:grid-cols-4">
          <StatCell
            value={
              snapData.stats.yearsOfExperience > 0 ? `${snapData.stats.yearsOfExperience}+` : '—'
            }
            label="Years Experience"
            icon={<Briefcase className="h-4 w-4" />}
            color="text-blue-600 dark:text-blue-400"
            bgColor="bg-blue-50 dark:bg-blue-950/40"
          />
          <StatCell
            value={snapData.stats.companiesCount > 0 ? String(snapData.stats.companiesCount) : '—'}
            label="Companies"
            icon={<Building2 className="h-4 w-4" />}
            color="text-emerald-600 dark:text-emerald-400"
            bgColor="bg-emerald-50 dark:bg-emerald-950/40"
          />
          <StatCell
            value={snapData.stats.skillsCount > 0 ? `${snapData.stats.skillsCount}+` : '—'}
            label="Skills"
            icon={<Layers className="h-4 w-4" />}
            color="text-violet-600 dark:text-violet-400"
            bgColor="bg-violet-50 dark:bg-violet-950/40"
          />
          <StatCell
            value={snapData.stats.highestDegree ?? '—'}
            label="Highest Degree"
            icon={<GraduationCap className="h-4 w-4" />}
            color="text-amber-600 dark:text-amber-400"
            bgColor="bg-amber-50 dark:bg-amber-950/40"
          />
        </div>

        {/* ── MAIN CONTENT: TWO COLUMNS ──────────────────── */}
        <div className="grid divide-y divide-border/40 lg:grid-cols-[1fr_1fr] lg:divide-x lg:divide-y-0">
          {/* LEFT: Career + Education */}
          <div className="divide-y divide-border/40">
            {/* Career Timeline */}
            {snapData.careerTimeline.length > 0 && (
              <div className="px-8 py-6 sm:px-10">
                <SectionTitle icon={<Briefcase className="h-4 w-4" />} title="Experience" />
                <div className="mt-4 space-y-0">
                  {snapData.careerTimeline.map((entry, idx) => (
                    <CareerEntry
                      key={idx}
                      entry={entry}
                      isLast={idx === snapData.careerTimeline.length - 1}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {snapData.education.length > 0 && (
              <div className="px-8 py-6 sm:px-10">
                <SectionTitle icon={<GraduationCap className="h-4 w-4" />} title="Education" />
                <div className="mt-4 space-y-3">
                  {snapData.education.map((edu, idx) => (
                    <EducationEntry key={idx} entry={edu} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Skills + Projects + Certs/Awards */}
          <div className="divide-y divide-border/40">
            {/* Skill Clusters */}
            {snapData.skillClusters.length > 0 && (
              <div className="px-8 py-6 sm:px-10">
                <SectionTitle icon={<Layers className="h-4 w-4" />} title="Skills & Expertise" />
                <div className="mt-4 space-y-3">
                  {snapData.skillClusters.map((cluster, idx) => (
                    <SkillCluster key={idx} cluster={cluster} />
                  ))}
                </div>
              </div>
            )}

            {/* Key Projects */}
            {snapData.keyProjects.length > 0 && (
              <div className="px-8 py-6 sm:px-10">
                <SectionTitle icon={<Sparkles className="h-4 w-4" />} title="Key Projects" />
                <div className="mt-4 space-y-3.5">
                  {snapData.keyProjects.map((project, idx) => (
                    <ProjectEntry key={idx} project={project} />
                  ))}
                </div>
              </div>
            )}

            {/* Certifications & Awards (compact) */}
            {(snapData.certifications.length > 0 || snapData.awards.length > 0) && (
              <div className="px-8 py-6 sm:px-10">
                <div className="flex flex-wrap gap-6">
                  {snapData.certifications.length > 0 && (
                    <div className="min-w-0 flex-1">
                      <SectionTitle icon={<Award className="h-4 w-4" />} title="Certifications" />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {snapData.certifications.map((cert, idx) => (
                          <span
                            key={idx}
                            className="inline-block rounded-md bg-muted/70 px-2.5 py-1 text-xs font-medium text-muted-foreground"
                          >
                            {cert}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {snapData.awards.length > 0 && (
                    <div className="min-w-0 flex-1">
                      <SectionTitle icon={<Trophy className="h-4 w-4" />} title="Awards" />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {snapData.awards.map((award, idx) => (
                          <span
                            key={idx}
                            className="inline-block rounded-md bg-muted/70 px-2.5 py-1 text-xs font-medium text-muted-foreground"
                          >
                            {award}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RECRUITER BRIEF ────────────────────────────── */}
        {snapData.recruiterBrief && (
          <div className="border-t border-border/40 bg-gradient-to-r from-primary/[0.03] via-transparent to-primary/[0.03] px-8 py-6 sm:px-10">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-wide text-primary">
                  Recruiter Brief
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {snapData.recruiterBrief}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── FOOTER ─────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-border/40 px-8 py-3 sm:px-10">
          <span className="text-[11px] text-muted-foreground/60">
            Generated by Follio
            {snapData.isAIGenerated && !isLoading && (
              <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <Sparkles className="h-2.5 w-2.5" />
                AI Enhanced
              </span>
            )}
          </span>
          <span className="text-[11px] text-muted-foreground/40">
            follio.app/u/{profile.handle}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatCell({
  value,
  label,
  icon,
  color,
  bgColor,
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="flex items-center gap-3.5 px-6 py-4 sm:px-8">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bgColor} ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
      {icon}
      {title}
    </h2>
  );
}

function CareerEntry({
  entry,
  isLast,
}: {
  entry: SnapViewData['careerTimeline'][number];
  isLast: boolean;
}) {
  return (
    <div className="relative flex gap-3 pb-4">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
            entry.isCurrent
              ? 'bg-primary ring-2 ring-primary/20'
              : 'border-2 border-muted-foreground/30 bg-background'
          }`}
        />
        {!isLast && <div className="mt-1 w-px flex-1 bg-border/60" />}
      </div>
      {/* Content */}
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-sm font-semibold leading-tight">
            {entry.role}
            <span className="font-normal text-muted-foreground"> — {entry.company}</span>
          </p>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
            {entry.period}
          </span>
        </div>
        {entry.highlight && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground/80">
            {entry.highlight}
          </p>
        )}
      </div>
    </div>
  );
}

function EducationEntry({ entry }: { entry: SnapViewData['education'][number] }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{entry.degree}</p>
        <p className="text-xs text-muted-foreground">
          {entry.institution}
          {entry.distinction && (
            <span className="ml-2 text-muted-foreground/60">· {entry.distinction}</span>
          )}
        </p>
      </div>
      {entry.year && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">{entry.year}</span>
      )}
    </div>
  );
}

function SkillCluster({ cluster }: { cluster: SnapViewData['skillClusters'][number] }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-24 shrink-0 text-right text-xs font-medium text-muted-foreground/70">
        {cluster.category}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {cluster.skills.map((skill) => (
          <span
            key={skill}
            className="inline-block rounded-md bg-primary/[0.07] px-2 py-0.5 text-xs font-medium text-foreground/80"
          >
            {skill}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProjectEntry({ project }: { project: SnapViewData['keyProjects'][number] }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold">{project.name}</span>
        {project.tech.length > 0 && (
          <span className="text-[10px] text-muted-foreground/60">{project.tech.join(' · ')}</span>
        )}
      </div>
      {project.impact && (
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground/80">{project.impact}</p>
      )}
    </div>
  );
}
