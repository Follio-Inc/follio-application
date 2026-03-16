'use client';

import { motion } from 'framer-motion';
import {
  Award,
  Briefcase,
  Calendar,
  FileCheck,
  FolderKanban,
  GraduationCap,
  LayoutGrid,
  Mail,
  MapPin,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

import { stripHtmlTags } from '@/lib/html-utils';
import { formatDate } from '@/lib/utils';
import type { CustomSectionContent, CustomSectionItem, PublicProfile } from '@/types';

interface TimelineViewProps {
  profile: PublicProfile;
}

type TimelineItem = {
  id: string;
  type: 'work' | 'education' | 'award' | 'certification' | 'project' | 'custom';
  date: Date | null;
  endDate?: Date | null;
  isCurrent?: boolean;
  title: string;
  subtitle: string;
  description?: string | null;
  tags?: string[];
  icon: typeof Briefcase;
  color: string;
};

function buildTimeline(profile: PublicProfile): TimelineItem[] {
  const items: TimelineItem[] = [];

  // Work experiences
  profile.workExperiences?.forEach((exp) => {
    items.push({
      id: `work-${exp.id}`,
      type: 'work',
      date: exp.startDate,
      endDate: exp.endDate,
      isCurrent: exp.isCurrent,
      title: exp.role,
      subtitle: `${exp.company}${exp.location ? ` · ${exp.location}` : ''}`,
      description: exp.bullets?.map((b) => stripHtmlTags(b)).join(' · ') || undefined,
      tags: exp.tags || [],
      icon: Briefcase,
      color: 'bg-blue-500',
    });
  });

  // Education
  profile.educations?.forEach((edu) => {
    items.push({
      id: `edu-${edu.id}`,
      type: 'education',
      date: edu.startDate,
      endDate: edu.endDate,
      title: edu.degree + (edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ''),
      subtitle: edu.institution,
      description: edu.activities?.join(', ') || null,
      icon: GraduationCap,
      color: 'bg-green-500',
    });
  });

  // Projects (with dates)
  profile.projects
    ?.filter((p) => p.startDate)
    .forEach((project) => {
      items.push({
        id: `project-${project.id}`,
        type: 'project',
        date: project.startDate,
        endDate: project.endDate,
        isCurrent: project.isCurrent,
        title: project.title,
        subtitle: project.shortDesc || 'Project',
        description: project.description,
        tags: project.techStack || [],
        icon: FolderKanban,
        color: 'bg-purple-500',
      });
    });

  // Awards
  profile.awards?.forEach((award) => {
    items.push({
      id: `award-${award.id}`,
      type: 'award',
      date: award.date,
      title: award.title,
      subtitle: award.issuer || 'Award',
      description: award.description,
      icon: Award,
      color: 'bg-yellow-500',
    });
  });

  // Certifications
  profile.certifications?.forEach((cert) => {
    items.push({
      id: `cert-${cert.id}`,
      type: 'certification',
      date: cert.issueDate,
      title: cert.name,
      subtitle: cert.issuer,
      icon: FileCheck,
      color: 'bg-orange-500',
    });
  });

  // Custom sections with date items
  profile.sections
    ?.filter((s) => s.type === 'CUSTOM' && s.isVisible)
    .forEach((section) => {
      const content = section.customContent as CustomSectionContent | null;
      const sectionItems = content?.items || [];

      sectionItems
        .filter((item: CustomSectionItem) => item.startDate)
        .forEach((item: CustomSectionItem) => {
          // Try to parse the date string (could be "Jan 2023" format)
          let parsedDate: Date | null = null;
          if (item.startDate) {
            const parsed = new Date(item.startDate);
            parsedDate = isNaN(parsed.getTime()) ? null : parsed;
          }

          items.push({
            id: `custom-${section.id}-${item.id}`,
            type: 'custom',
            date: parsedDate,
            endDate: item.endDate ? new Date(item.endDate) : null,
            isCurrent: item.isCurrent,
            title: item.title,
            subtitle: section.title,
            description: item.description || null,
            tags: item.tags || [],
            icon: LayoutGrid,
            color: 'bg-pink-500',
          });
        });
    });

  // Sort by date (most recent first), null dates at the end
  return items.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

export function TimelineView({ profile }: TimelineViewProps) {
  const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`;
  const timeline = buildTimeline(profile);

  return (
    <div className="space-y-12">
      {/* Header */}
      <header className="text-center">
        <Avatar className="mx-auto h-24 w-24 border-4 border-background shadow-lg">
          <AvatarImage src={profile.avatarUrl || undefined} alt={profile.firstName || undefined} />
          <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
        </Avatar>
        <h1 className="mt-4 text-3xl font-bold">
          {profile.firstName} {profile.lastName}
        </h1>
        {profile.headline && (
          <p className="mt-1 text-lg text-muted-foreground">{profile.headline}</p>
        )}
        {/* Contact Info */}
        {(profile.location || profile.contactInfo?.email) && (
          <div className="mt-3 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            {profile.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {profile.location}
              </span>
            )}
            {profile.contactInfo?.email && (
              <a
                href={`mailto:${profile.contactInfo.email}`}
                className="flex items-center gap-1 hover:text-primary"
              >
                <Mail className="h-4 w-4" />
                {profile.contactInfo.email}
              </a>
            )}
          </div>
        )}
        <p className="mt-2 text-sm text-muted-foreground">Career Timeline</p>
      </header>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 text-sm">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-blue-500" />
          Work
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-green-500" />
          Education
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-purple-500" />
          Projects
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-yellow-500" />
          Awards
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-orange-500" />
          Certifications
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-pink-500" />
          Custom
        </span>
      </div>

      {/* Timeline */}
      {timeline.length > 0 ? (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 h-full w-0.5 bg-border md:left-1/2 md:-translate-x-1/2" />

          <div className="space-y-8">
            {timeline.map((item, index) => {
              const Icon = item.icon;
              const isLeft = index % 2 === 0;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: isLeft ? -50 : 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className={`relative flex items-start gap-4 md:gap-8 ${
                    isLeft ? 'md:flex-row' : 'md:flex-row-reverse'
                  }`}
                >
                  {/* Content */}
                  <div className={`ml-16 flex-1 md:ml-0 ${isLeft ? 'md:text-right' : ''}`}>
                    <div
                      className={`rounded-lg border bg-card p-4 shadow-sm ${
                        isLeft ? 'md:mr-12' : 'md:ml-12'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {item.date ? formatDate(item.date) : 'No date'}
                        {item.endDate && ` — ${formatDate(item.endDate)}`}
                        {item.isCurrent && ' — Present'}
                      </div>
                      <h3 className="mt-1 font-semibold">{item.title}</h3>
                      <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                      {item.description && (
                        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                      {item.tags && item.tags.length > 0 && (
                        <div
                          className={`mt-2 flex flex-wrap gap-1 ${isLeft ? 'md:justify-end' : ''}`}
                        >
                          {item.tags.slice(0, 4).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Icon on the line */}
                  <div className="absolute left-0 flex h-12 w-12 items-center justify-center rounded-full border-4 border-background bg-muted md:left-1/2 md:-translate-x-1/2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${item.color}`}
                    >
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                  </div>

                  {/* Spacer for the other side */}
                  <div className="hidden flex-1 md:block" />
                </motion.div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="py-12 text-center text-muted-foreground">
          <p>No timeline events to display yet.</p>
        </div>
      )}
    </div>
  );
}
