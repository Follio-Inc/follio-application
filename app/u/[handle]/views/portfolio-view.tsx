'use client';

import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Award,
  BookOpen,
  Briefcase,
  Calendar,
  ExternalLink,
  FileText,
  GitFork,
  Github,
  Globe,
  GraduationCap,
  Layers,
  Lock,
  Mail,
  MapPin,
  Pin,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';

import { useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { containsHtmlFormatting } from '@/lib/html-utils';
import { getResumePath } from '@/lib/url';
import { formatDate, formatDateRange } from '@/lib/utils';
import type { PublicProfile } from '@/types';

interface PortfolioViewProps {
  profile: PublicProfile;
  profileHandle: string;
  resumeVisibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  authState: 'owner' | 'authenticated' | 'anonymous';
}

// ─── Section wrapper with stagger animation ───
function Section({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ y: 32, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function SectionHeading({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="mb-8 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
    </div>
  );
}

export function PortfolioView({
  profile,
  profileHandle,
  resumeVisibility,
  authState,
}: PortfolioViewProps) {
  const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`;

  // Determine whether to show a resume link/button
  const showResumeLink = authState === 'owner' || resumeVisibility === 'PUBLIC';
  const showResumeRequest = resumeVisibility === 'UNLISTED' && authState !== 'owner';

  // ─── Data preparation ───
  const visibleProjects =
    profile.projects?.filter((p) => p.isVisible !== false && p.showOnPortfolio !== false) || [];
  const featuredProjects = visibleProjects.filter((p) => p.featured);
  const otherProjects = visibleProjects.filter((p) => !p.featured);

  const visibleBlogPosts = profile.blogPosts?.filter((b) => b.isVisible !== false) || [];
  const featuredBlogPosts = visibleBlogPosts.filter((b) => b.isFeatured);
  const otherBlogPosts = visibleBlogPosts.filter((b) => !b.isFeatured);
  const allBlogPosts = [...featuredBlogPosts, ...otherBlogPosts].slice(0, 6);

  const visibleVideos = profile.youtubeVideos?.filter((v) => v.isVisible !== false) || [];

  const currentRole = profile.workExperiences?.find((exp) => exp.isCurrent);
  const pastRoles = profile.workExperiences?.filter((exp) => !exp.isCurrent) || [];

  // Calculate years of experience
  const totalYearsExperience =
    profile.workExperiences?.reduce((total, exp) => {
      const start = new Date(exp.startDate);
      const end = exp.isCurrent ? new Date() : exp.endDate ? new Date(exp.endDate) : new Date();
      return total + (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
    }, 0) || 0;

  const uniqueCompanies = [...new Set(profile.workExperiences?.map((e) => e.company) || [])];

  // Skill groups
  const hasSkillGroups = profile.skillGroups && profile.skillGroups.length > 0;
  const ungroupedSkills = profile.skills?.filter((s) => !s.groupId) || [];

  // Section delay counter
  let sectionDelay = 0;
  const nextDelay = () => {
    sectionDelay += 0.1;
    return sectionDelay;
  };

  return (
    <div className="space-y-16">
      {/* ═══════════════════════════════════════════
          HERO SECTION
         ═══════════════════════════════════════════ */}
      <header>
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-primary/10 to-background p-8 md:p-12"
        >
          {/* Decorative background elements */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
          </div>

          {/* View Resume button — top right */}
          {showResumeLink && (
            <a
              href={getResumePath(profileHandle)}
              className="absolute right-4 top-4 z-10 md:right-6 md:top-6"
            >
              <Button variant="outline" size="sm" className="gap-1.5 text-xs shadow-sm">
                <FileText className="h-3.5 w-3.5" />
                View Resume
              </Button>
            </a>
          )}
          {showResumeRequest && <ResumeRequestButton profileHandle={profileHandle} />}

          <div className="relative flex flex-col items-center gap-8 md:flex-row md:items-start md:gap-12">
            {/* Avatar */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="shrink-0"
            >
              <Avatar className="h-32 w-32 border-4 border-background shadow-2xl ring-2 ring-primary/20 md:h-36 md:w-36">
                <AvatarImage
                  src={profile.avatarUrl || undefined}
                  alt={profile.firstName || undefined}
                />
                <AvatarFallback className="text-4xl font-bold">{initials}</AvatarFallback>
              </Avatar>
            </motion.div>

            {/* Info */}
            <div className="flex-1 text-center md:text-left">
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
                  {profile.firstName} {profile.lastName}
                </h1>
                {profile.headline && (
                  <p className="mt-3 text-lg text-muted-foreground md:text-xl">
                    {profile.headline}
                  </p>
                )}

                {/* Location & Contact pills */}
                <div className="mt-4 flex flex-wrap justify-center gap-3 md:justify-start">
                  {profile.location && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {profile.location}
                    </span>
                  )}
                  {profile.contactInfo?.email && (
                    <a
                      href={`mailto:${profile.contactInfo.email}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {profile.contactInfo.email}
                    </a>
                  )}
                  {profile.contactInfo?.website && (
                    <a
                      href={profile.contactInfo.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      Website
                    </a>
                  )}
                </div>
              </motion.div>

              {/* Quick stats row */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mt-6 flex flex-wrap justify-center gap-6 md:justify-start"
              >
                {totalYearsExperience > 0 && (
                  <div className="text-center md:text-left">
                    <p className="text-2xl font-bold">{Math.round(totalYearsExperience)}+</p>
                    <p className="text-xs text-muted-foreground">Years Exp.</p>
                  </div>
                )}
                {visibleProjects.length > 0 && (
                  <div className="text-center md:text-left">
                    <p className="text-2xl font-bold">{visibleProjects.length}</p>
                    <p className="text-xs text-muted-foreground">Projects</p>
                  </div>
                )}
                {(profile.skills?.length || 0) > 0 && (
                  <div className="text-center md:text-left">
                    <p className="text-2xl font-bold">{profile.skills!.length}</p>
                    <p className="text-xs text-muted-foreground">Skills</p>
                  </div>
                )}
                {uniqueCompanies.length > 0 && (
                  <div className="text-center md:text-left">
                    <p className="text-2xl font-bold">{uniqueCompanies.length}</p>
                    <p className="text-xs text-muted-foreground">Companies</p>
                  </div>
                )}
              </motion.div>

              {/* Social / link buttons */}
              {profile.links && profile.links.length > 0 && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="mt-6 flex flex-wrap justify-center gap-2 md:justify-start"
                >
                  {profile.links.slice(0, 6).map((link) => (
                    <Button key={link.id} variant="outline" size="sm" asChild className="gap-1.5">
                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                        {link.label || link.type}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  ))}
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </header>

      {/* ═══════════════════════════════════════════
          ABOUT ME
         ═══════════════════════════════════════════ */}
      {profile.summary && (
        <Section delay={nextDelay()}>
          <SectionHeading icon={Sparkles} title="About Me" />
          <Card className="overflow-hidden">
            <CardContent className="pt-6">
              <p className="whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                {profile.summary}
              </p>
            </CardContent>
          </Card>
        </Section>
      )}

      {/* ═══════════════════════════════════════════
          FEATURED PROJECTS
         ═══════════════════════════════════════════ */}
      {featuredProjects.length > 0 && (
        <Section delay={nextDelay()}>
          <SectionHeading icon={Star} title="Featured Work" />
          <div className="grid gap-8 md:grid-cols-2">
            {featuredProjects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="group h-full overflow-hidden border transition-shadow hover:shadow-lg">
                  {/* Project image */}
                  {project.imageUrl && (
                    <div className="relative aspect-video overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={project.imageUrl}
                        alt={project.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
                      <div className="absolute bottom-4 left-4 right-4">
                        <h3 className="text-xl font-bold text-white drop-shadow-md">
                          {project.title}
                        </h3>
                      </div>
                    </div>
                  )}

                  <CardContent
                    className={`flex flex-col gap-3 ${project.imageUrl ? 'pt-4' : 'pt-6'}`}
                  >
                    {!project.imageUrl && (
                      <div className="flex flex-wrap items-center gap-2 pb-1">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Layers className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold leading-tight">{project.title}</h3>
                          {project.githubPinned && (
                            <Badge variant="outline" className="mt-0.5 gap-1 text-xs">
                              <Pin className="h-3 w-3" />
                              Pinned
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    {(project.customDescription || project.shortDesc || project.description) && (
                      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                        {project.customDescription || project.shortDesc || project.description}
                      </p>
                    )}

                    {/* Highlights */}
                    {project.highlights && project.highlights.length > 0 && (
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {project.highlights.slice(0, 3).map((h, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* GitHub stats */}
                    {project.showStats !== false &&
                      (project.githubStars || project.githubForks || project.githubLanguage) && (
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {project.githubStars != null && (
                            <span className="flex items-center gap-1">
                              <Star className="h-3.5 w-3.5 text-yellow-500" />
                              {project.githubStars.toLocaleString()}
                            </span>
                          )}
                          {project.githubForks != null && (
                            <span className="flex items-center gap-1">
                              <GitFork className="h-3.5 w-3.5" />
                              {project.githubForks.toLocaleString()}
                            </span>
                          )}
                          {project.githubLanguage && (
                            <span className="flex items-center gap-1">
                              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                              {project.githubLanguage}
                            </span>
                          )}
                        </div>
                      )}

                    {/* Tech stack */}
                    {project.techStack && project.techStack.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {project.techStack.slice(0, 8).map((tech) => (
                          <Badge
                            key={tech}
                            variant="secondary"
                            className="rounded-md text-xs font-normal"
                          >
                            {tech}
                          </Badge>
                        ))}
                        {project.techStack.length > 8 && (
                          <Badge variant="outline" className="rounded-md text-xs font-normal">
                            +{project.techStack.length - 8}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Action links */}
                    <div className="mt-auto flex gap-2 pt-2">
                      {project.url && (
                        <Button variant="default" size="sm" asChild className="gap-1.5">
                          <a href={project.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Live Demo
                          </a>
                        </Button>
                      )}
                      {project.repoUrl && (
                        <Button variant="outline" size="sm" asChild className="gap-1.5">
                          <a href={project.repoUrl} target="_blank" rel="noopener noreferrer">
                            <Github className="h-3.5 w-3.5" />
                            Source
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </Section>
      )}

      {/* ═══════════════════════════════════════════
          OTHER PROJECTS (compact grid)
         ═══════════════════════════════════════════ */}
      {otherProjects.length > 0 && (
        <Section delay={nextDelay()}>
          {featuredProjects.length === 0 && <SectionHeading icon={Layers} title="Projects" />}
          {featuredProjects.length > 0 && (
            <h3 className="mb-6 text-lg font-semibold text-muted-foreground">More Projects</h3>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {otherProjects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
              >
                <Card className="group h-full transition-all hover:border-primary/30 hover:shadow-md">
                  <CardContent className="flex h-full flex-col gap-2 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold leading-snug transition-colors group-hover:text-primary">
                        {project.title}
                      </h4>
                      {project.githubStars != null &&
                        project.showStats !== false &&
                        project.githubStars > 0 && (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            <Star className="h-3 w-3 text-yellow-500" />
                            {project.githubStars}
                          </span>
                        )}
                    </div>
                    {(project.customDescription || project.shortDesc || project.description) && (
                      <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                        {project.customDescription || project.shortDesc || project.description}
                      </p>
                    )}
                    {project.techStack && project.techStack.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {project.techStack.slice(0, 4).map((tech) => (
                          <Badge key={tech} variant="outline" className="px-1.5 py-0 text-[10px]">
                            {tech}
                          </Badge>
                        ))}
                        {project.techStack.length > 4 && (
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                            +{project.techStack.length - 4}
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="mt-auto flex gap-2 pt-1">
                      {project.url && (
                        <a
                          href={project.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </a>
                      )}
                      {project.repoUrl && (
                        <a
                          href={project.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <Github className="h-3 w-3" />
                          Code
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </Section>
      )}

      {/* ═══════════════════════════════════════════
          EXPERIENCE HIGHLIGHTS
         ═══════════════════════════════════════════ */}
      {profile.workExperiences && profile.workExperiences.length > 0 && (
        <Section delay={nextDelay()}>
          <SectionHeading icon={Briefcase} title="Experience" />
          <div className="space-y-4">
            {/* Current role — highlight card */}
            {currentRole && (
              <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      {currentRole.companyLogo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={currentRole.companyLogo}
                          alt={currentRole.company}
                          className="h-8 w-8 rounded-md object-contain"
                        />
                      ) : (
                        <Briefcase className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold">{currentRole.role}</h3>
                        <Badge className="bg-green-100 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
                          Current
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {currentRole.companyUrl ? (
                          <a
                            href={currentRole.companyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary hover:underline"
                          >
                            {currentRole.company}
                          </a>
                        ) : (
                          currentRole.company
                        )}
                        {currentRole.location && (
                          <span className="text-muted-foreground/60">
                            {' '}
                            · {currentRole.location}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Since {formatDate(currentRole.startDate)}
                        {currentRole.employmentType && (
                          <span className="text-muted-foreground/60">
                            {' '}
                            · {currentRole.employmentType.replace('_', ' ')}
                          </span>
                        )}
                      </p>
                      {currentRole.bullets && currentRole.bullets.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {currentRole.bullets.slice(0, 3).map((bullet, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm text-muted-foreground"
                            >
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                              {containsHtmlFormatting(bullet) ? (
                                <span dangerouslySetInnerHTML={{ __html: bullet }} />
                              ) : (
                                <span>{bullet}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {currentRole.tags && currentRole.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {currentRole.tags.slice(0, 5).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Past roles — compact list */}
            {pastRoles.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-5">
                    {pastRoles.slice(0, 5).map((exp, index) => (
                      <div
                        key={exp.id}
                        className={index < Math.min(pastRoles.length, 5) - 1 ? 'border-b pb-5' : ''}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                            {exp.companyLogo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={exp.companyLogo}
                                alt={exp.company}
                                className="h-6 w-6 rounded object-contain"
                              />
                            ) : (
                              <Briefcase className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold">{exp.role}</h4>
                            <p className="text-sm text-muted-foreground">
                              {exp.company}
                              {exp.location && (
                                <span className="text-muted-foreground/60"> · {exp.location}</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground/70">
                              {formatDateRange(exp.startDate, exp.endDate, exp.isCurrent)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {pastRoles.length > 5 && (
                      <p className="text-center text-sm text-muted-foreground">
                        +{pastRoles.length - 5} more roles
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </Section>
      )}

      {/* ═══════════════════════════════════════════
          SKILLS & TECH STACK
         ═══════════════════════════════════════════ */}
      {profile.skills && profile.skills.length > 0 && (
        <Section delay={nextDelay()}>
          <SectionHeading icon={Layers} title="Skills & Tech Stack" />
          <Card>
            <CardContent className="pt-6">
              {/* Grouped skills */}
              {hasSkillGroups && (
                <div className="space-y-6">
                  {profile.skillGroups!.map((group) => (
                    <div key={group.id}>
                      <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.name}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {group.skills.map((skill) => (
                          <Badge
                            key={skill.id}
                            variant={skill.level === 'EXPERT' ? 'default' : 'secondary'}
                            className="px-3 py-1.5 text-sm"
                          >
                            {skill.name}
                            {skill.yearsOfExp && (
                              <span className="ml-1 text-xs opacity-60">{skill.yearsOfExp}y</span>
                            )}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                  {/* Ungrouped skills */}
                  {ungroupedSkills.length > 0 && (
                    <div>
                      <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Other
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {ungroupedSkills.map((skill) => (
                          <Badge
                            key={skill.id}
                            variant={skill.level === 'EXPERT' ? 'default' : 'secondary'}
                            className="px-3 py-1.5 text-sm"
                          >
                            {skill.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Flat skills (no groups) */}
              {!hasSkillGroups && (
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((skill) => (
                    <Badge
                      key={skill.id}
                      variant={skill.level === 'EXPERT' ? 'default' : 'secondary'}
                      className="px-3 py-1.5 text-sm"
                    >
                      {skill.name}
                      {skill.yearsOfExp && (
                        <span className="ml-1 text-xs opacity-60">{skill.yearsOfExp}y</span>
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </Section>
      )}

      {/* ═══════════════════════════════════════════
          EDUCATION & CERTIFICATIONS
         ═══════════════════════════════════════════ */}
      {((profile.educations && profile.educations.length > 0) ||
        (profile.certifications && profile.certifications.length > 0)) && (
        <Section delay={nextDelay()}>
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Education */}
            {profile.educations && profile.educations.length > 0 && (
              <div>
                <SectionHeading icon={GraduationCap} title="Education" />
                <div className="space-y-4">
                  {profile.educations.map((edu) => (
                    <Card key={edu.id}>
                      <CardContent className="pt-5">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                            {edu.institutionLogo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={edu.institutionLogo}
                                alt={edu.institution}
                                className="h-7 w-7 rounded object-contain"
                              />
                            ) : (
                              <GraduationCap className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-semibold">
                              {edu.degree}
                              {edu.fieldOfStudy && (
                                <span className="font-normal text-muted-foreground">
                                  {' '}
                                  in {edu.fieldOfStudy}
                                </span>
                              )}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {edu.institutionUrl ? (
                                <a
                                  href={edu.institutionUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-primary hover:underline"
                                >
                                  {edu.institution}
                                </a>
                              ) : (
                                edu.institution
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground/70">
                              {formatDateRange(edu.startDate, edu.endDate, edu.isCurrent)}
                            </p>
                            {edu.gpa && (
                              <p className="mt-1 text-xs">
                                <span className="font-medium">GPA:</span> {edu.gpa}
                              </p>
                            )}
                            {edu.honors && edu.honors.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {edu.honors.map((honor) => (
                                  <Badge key={honor} variant="outline" className="text-xs">
                                    {honor}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {profile.certifications && profile.certifications.length > 0 && (
              <div>
                <SectionHeading icon={ShieldCheck} title="Certifications" />
                <div className="space-y-3">
                  {profile.certifications.map((cert) => (
                    <Card key={cert.id}>
                      <CardContent className="pt-5">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                            {cert.issuerLogo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={cert.issuerLogo}
                                alt={cert.issuer}
                                className="h-7 w-7 rounded object-contain"
                              />
                            ) : (
                              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold leading-snug">{cert.name}</h4>
                            <p className="text-sm text-muted-foreground">{cert.issuer}</p>
                            {cert.issueDate && (
                              <p className="text-xs text-muted-foreground/70">
                                Issued {formatDate(cert.issueDate)}
                                {cert.expirationDate &&
                                  ` · Expires ${formatDate(cert.expirationDate)}`}
                              </p>
                            )}
                            {cert.credentialUrl && (
                              <a
                                href={cert.credentialUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Verify Credential
                              </a>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ═══════════════════════════════════════════
          AWARDS
         ═══════════════════════════════════════════ */}
      {profile.awards && profile.awards.length > 0 && (
        <Section delay={nextDelay()}>
          <SectionHeading icon={Award} title="Awards & Recognition" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profile.awards.map((award) => (
              <Card key={award.id} className="relative overflow-hidden">
                <div className="absolute right-3 top-3 text-yellow-400/20">
                  <Award className="h-12 w-12" />
                </div>
                <CardContent className="relative pt-5">
                  <h4 className="pr-12 font-semibold">{award.title}</h4>
                  {award.issuer && <p className="text-sm text-muted-foreground">{award.issuer}</p>}
                  {award.date && (
                    <p className="text-xs text-muted-foreground/70">{formatDate(award.date)}</p>
                  )}
                  {award.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {award.description}
                    </p>
                  )}
                  {award.url && (
                    <a
                      href={award.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* ═══════════════════════════════════════════
          BLOG POSTS / WRITING
         ═══════════════════════════════════════════ */}
      {allBlogPosts.length > 0 && (
        <Section delay={nextDelay()}>
          <SectionHeading icon={BookOpen} title="Writing & Articles" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allBlogPosts.map((post) => (
              <a
                key={post.id}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <Card className="h-full overflow-hidden transition-all hover:border-primary/30 hover:shadow-md">
                  {post.thumbnail && (
                    <div className="aspect-[2/1] overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={post.thumbnail}
                        alt={post.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  )}
                  <CardContent
                    className={`flex flex-col gap-2 ${post.thumbnail ? 'pt-4' : 'pt-5'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="line-clamp-2 font-semibold leading-snug transition-colors group-hover:text-primary">
                        {post.title}
                      </h4>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    {post.excerpt && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{post.excerpt}</p>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground/70">
                      {post.publishedAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(post.publishedAt)}
                        </span>
                      )}
                      {post.readTimeMin && <span>{post.readTimeMin} min read</span>}
                      {post.platform && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          {post.platform}
                        </Badge>
                      )}
                    </div>
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {post.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* ═══════════════════════════════════════════
          YOUTUBE VIDEOS
         ═══════════════════════════════════════════ */}
      {visibleVideos.length > 0 && (
        <Section delay={nextDelay()}>
          <SectionHeading icon={Globe} title="Videos & Talks" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleVideos.slice(0, 6).map((video) => (
              <a
                key={video.id}
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <Card className="h-full overflow-hidden transition-all hover:border-primary/30 hover:shadow-md">
                  {video.thumbnail && (
                    <div className="relative aspect-video overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white transition-transform group-hover:scale-110">
                          <svg className="ml-0.5 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6.3 2.8A1 1 0 005 3.7v12.6a1 1 0 001.3.9l10-6.3a1 1 0 000-1.8l-10-6.3z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  )}
                  <CardContent className="pt-4">
                    <h4 className="line-clamp-2 font-semibold leading-snug transition-colors group-hover:text-primary">
                      {video.title}
                    </h4>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground/70">
                      {video.viewCount != null && video.viewCount > 0 && (
                        <span>{video.viewCount.toLocaleString()} views</span>
                      )}
                      {video.publishedAt && <span>{formatDate(video.publishedAt)}</span>}
                    </div>
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* ═══════════════════════════════════════════
          CONTACT CTA
         ═══════════════════════════════════════════ */}
      {profile.contactInfo?.email && (
        <Section delay={nextDelay()}>
          <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
            <CardContent className="relative flex flex-col items-center gap-4 py-10 text-center">
              <h3 className="text-2xl font-bold">Let&apos;s Work Together</h3>
              <p className="max-w-md text-muted-foreground">
                Interested in collaborating or have an opportunity? Feel free to reach out —
                I&apos;d love to hear from you.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <a href={`mailto:${profile.contactInfo.email}`}>
                    <Mail className="mr-2 h-4 w-4" />
                    Get in Touch
                  </a>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <a href={`/api/export/${profile.handle}/json`} target="_blank">
                    Download Resume
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </Section>
      )}

      {/* No content fallback */}
      {(!profile.projects || profile.projects.length === 0) &&
        (!profile.workExperiences || profile.workExperiences.length === 0) &&
        (!profile.skills || profile.skills.length === 0) && (
          <div className="py-16 text-center text-muted-foreground">
            <p className="text-lg">This portfolio is being built. Check back soon!</p>
          </div>
        )}
    </div>
  );
}

// ─── Resume Request Button (for UNLISTED resumes) ───

function ResumeRequestButton({ profileHandle }: { profileHandle: string }) {
  const [requestSent, setRequestSent] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // TODO: Implement actual request access API
    console.log('Request access for', profileHandle, { name, email, message });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSubmitting(false);
    setRequestSent(true);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="absolute right-4 top-4 z-10 gap-1.5 text-xs shadow-sm md:right-6 md:top-6"
          disabled={requestSent}
        >
          <Lock className="h-3.5 w-3.5" />
          {requestSent ? 'Request Sent' : 'Request Resume'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Resume Access</DialogTitle>
          <DialogDescription>
            This resume is unlisted. Send a request to the profile owner to get access.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <label htmlFor="req-name" className="text-sm font-medium">
              Your Name
            </label>
            <input
              id="req-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="John Doe"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="req-email" className="text-sm font-medium">
              Your Email
            </label>
            <input
              id="req-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="john@company.com"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="req-message" className="text-sm font-medium">
              Message (optional)
            </label>
            <textarea
              id="req-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="I'd like to view your resume for a potential opportunity..."
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Send Request'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
