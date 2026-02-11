'use client';

import {
  Award,
  BookOpen,
  Building2,
  Calendar,
  ExternalLink,
  FileCheck,
  Github,
  Globe,
  GraduationCap,
  Heart,
  LayoutGrid,
  Linkedin,
  Mail,
  MapPin,
  Sparkles,
  Star,
  Twitter,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

import { formatDate } from '@/lib/utils';
import type {
  CustomSectionContent,
  CustomSectionItem,
  InterestItem,
  InterestsSectionContent,
  LanguageItem,
  LanguagesSectionContent,
  ProfileSection,
  PublicationItem,
  PublicationsSectionContent,
  PublicProfile,
  VolunteeringItem,
  VolunteeringSectionContent,
} from '@/types';

interface ResumeViewProps {
  profile: PublicProfile;
}

const getLinkIcon = (type: string) => {
  switch (type) {
    case 'GITHUB':
      return Github;
    case 'LINKEDIN':
      return Linkedin;
    case 'TWITTER':
      return Twitter;
    case 'EMAIL':
      return Mail;
    default:
      return Globe;
  }
};

export function ResumeView({ profile }: ResumeViewProps) {
  const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`;

  // Get visible sections by type
  const getSectionByType = (type: string) =>
    (profile.sections || []).find((s: ProfileSection) => s.type === type && s.isVisible);

  // Get visible custom sections
  const customSections = (profile.sections || [])
    .filter((s: ProfileSection) => s.type === 'CUSTOM' && s.isVisible)
    .sort((a: ProfileSection, b: ProfileSection) => a.sortOrder - b.sortOrder);

  // Get specialized sections
  const volunteeringSection = getSectionByType('VOLUNTEERING');
  const languagesSection = getSectionByType('LANGUAGES');
  const publicationsSection = getSectionByType('PUBLICATIONS');
  const interestsSection = getSectionByType('INTERESTS');

  // Extract items from sections
  const volunteeringItems = volunteeringSection
    ? (volunteeringSection.customContent as unknown as VolunteeringSectionContent)?.items || []
    : [];
  const languageItems = languagesSection
    ? (languagesSection.customContent as unknown as LanguagesSectionContent)?.items || []
    : [];
  const publicationItems = publicationsSection
    ? (publicationsSection.customContent as unknown as PublicationsSectionContent)?.items || []
    : [];
  const interestItems = interestsSection
    ? (interestsSection.customContent as unknown as InterestsSectionContent)?.items || []
    : [];

  const getProficiencyLabel = (proficiency: string) => {
    const labels: Record<string, string> = {
      NATIVE: 'Native / Bilingual',
      FLUENT: 'Fluent',
      ADVANCED: 'Advanced',
      INTERMEDIATE: 'Intermediate',
      BASIC: 'Basic',
    };
    return labels[proficiency] || proficiency;
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <Avatar className="h-24 w-24 sm:h-32 sm:w-32">
              <AvatarImage
                src={profile.avatarUrl || undefined}
                alt={profile.firstName || undefined}
              />
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-3xl font-bold">
                {profile.firstName} {profile.lastName}
              </h1>
              {profile.headline && (
                <p className="mt-1 text-xl text-muted-foreground">{profile.headline}</p>
              )}
              <div className="mt-3 flex flex-wrap justify-center gap-3 text-sm text-muted-foreground sm:justify-start">
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
              {/* Links */}
              {profile.links && profile.links.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                  {profile.links.map((link) => {
                    const Icon = getLinkIcon(link.type);
                    return (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-md bg-muted px-3 py-1 text-sm hover:bg-muted/80"
                      >
                        <Icon className="h-4 w-4" />
                        {link.label}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {profile.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-muted-foreground">{profile.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Skills */}
      {profile.skills && profile.skills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill) => (
                <Badge key={skill.id} variant={skill.level === 'EXPERT' ? 'default' : 'secondary'}>
                  {skill.name}
                  {skill.yearsOfExp && (
                    <span className="ml-1 text-xs opacity-70">{skill.yearsOfExp}y</span>
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Projects - filtered by visibility */}
      {(() => {
        const visibleProjects =
          profile.projects?.filter((p) => p.isVisible !== false && p.showOnResume !== false) || [];
        if (visibleProjects.length === 0) return null;

        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Github className="h-5 w-5" />
                Projects
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {visibleProjects.slice(0, 6).map((project) => (
                  <div key={project.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium">{project.title}</h3>
                      {project.showStats !== false &&
                        project.githubStars != null &&
                        project.githubStars > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Star className="h-3 w-3 text-yellow-500" />
                            {project.githubStars}
                          </span>
                        )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {project.customDescription || project.shortDesc || project.description}
                    </p>
                    {project.techStack && project.techStack.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {project.techStack.slice(0, 3).map((tech) => (
                          <Badge key={tech} variant="outline" className="text-xs">
                            {tech}
                          </Badge>
                        ))}
                        {project.techStack.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{project.techStack.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
                      {project.url && (
                        <a
                          href={project.url}
                          target="_blank"
                          rel="noopener"
                          className="text-xs text-primary hover:underline"
                        >
                          Demo
                        </a>
                      )}
                      {project.repoUrl && (
                        <a
                          href={project.repoUrl}
                          target="_blank"
                          rel="noopener"
                          className="text-xs text-primary hover:underline"
                        >
                          Code
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Work Experience */}
      {profile.workExperiences && profile.workExperiences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" />
              Experience
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {profile.workExperiences.map((exp, index) => (
              <div key={exp.id}>
                {index > 0 && <Separator className="mb-6" />}
                <div className="flex gap-4">
                  <div className="hidden sm:block">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{exp.role}</h3>
                        <p className="text-muted-foreground">
                          {exp.company}
                          {exp.location && <span> · {exp.location}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {formatDate(exp.startDate)} —{' '}
                        {exp.isCurrent ? 'Present' : formatDate(exp.endDate)}
                      </div>
                    </div>
                    {exp.bullets && exp.bullets.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm">
                        {exp.bullets.map((bullet, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-primary">•</span>
                            <span className="text-muted-foreground">{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {exp.tags && exp.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {exp.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Education */}
      {profile.educations && profile.educations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <GraduationCap className="h-5 w-5" />
              Education
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {profile.educations.map((edu, index) => (
              <div key={edu.id}>
                {index > 0 && <Separator className="mb-6" />}
                <div className="flex gap-4">
                  <div className="hidden sm:block">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <GraduationCap className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{edu.institution}</h3>
                        <p className="text-muted-foreground">
                          {edu.degree}
                          {edu.fieldOfStudy && ` in ${edu.fieldOfStudy}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {formatDate(edu.startDate)} — {formatDate(edu.endDate)}
                      </div>
                    </div>
                    {edu.gpa && (
                      <p className="mt-1 text-sm text-muted-foreground">GPA: {edu.gpa}</p>
                    )}
                    {edu.activities && (
                      <p className="mt-2 text-sm text-muted-foreground">{edu.activities}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Certifications */}
      {profile.certifications && profile.certifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileCheck className="h-5 w-5" />
              Certifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {profile.certifications.map((cert) => (
                <div key={cert.id} className="rounded-lg border p-4">
                  <h3 className="font-medium">{cert.name}</h3>
                  <p className="text-sm text-muted-foreground">{cert.issuer}</p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Issued {formatDate(cert.issueDate)}
                    {cert.expirationDate && ` · Expires ${formatDate(cert.expirationDate)}`}
                  </div>
                  {cert.credentialUrl && (
                    <a
                      href={cert.credentialUrl}
                      target="_blank"
                      rel="noopener"
                      className="mt-2 flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View credential
                    </a>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Awards */}
      {profile.awards && profile.awards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Award className="h-5 w-5" />
              Awards & Recognition
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {profile.awards.map((award) => (
                <div key={award.id} className="flex gap-4">
                  <Award className="h-5 w-5 text-yellow-500" />
                  <div>
                    <h3 className="font-medium">{award.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {award.issuer}
                      {award.date && ` · ${formatDate(award.date)}`}
                    </p>
                    {award.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{award.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Publications */}
      {publicationItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5" />
              Publications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {publicationItems.map((pub: PublicationItem, index: number) => (
              <div key={pub.id}>
                {index > 0 && <Separator className="mb-6" />}
                <div className="flex gap-4">
                  <div className="hidden sm:block">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <BookOpen className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{pub.title}</h3>
                    {pub.authors && <p className="text-sm text-muted-foreground">{pub.authors}</p>}
                    {pub.publisher && (
                      <p className="text-sm text-muted-foreground">Published in: {pub.publisher}</p>
                    )}
                    {pub.date && <p className="mt-1 text-xs text-muted-foreground">{pub.date}</p>}
                    {pub.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{pub.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {pub.url && (
                        <a
                          href={pub.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View publication <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {pub.doi && (
                        <a
                          href={`https://doi.org/${pub.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                        >
                          DOI: {pub.doi}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Volunteering */}
      {volunteeringItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Heart className="h-5 w-5" />
              Volunteering
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {volunteeringItems.map((vol: VolunteeringItem, index: number) => (
              <div key={vol.id}>
                {index > 0 && <Separator className="mb-6" />}
                <div className="flex gap-4">
                  <div className="hidden sm:block">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Heart className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{vol.role}</h3>
                        <p className="text-muted-foreground">{vol.organization}</p>
                        {vol.cause && (
                          <p className="text-xs text-muted-foreground">Cause: {vol.cause}</p>
                        )}
                      </div>
                      {(vol.startDate || vol.endDate || vol.isCurrent) && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {vol.startDate}
                          {(vol.endDate || vol.isCurrent) && ' — '}
                          {vol.isCurrent ? 'Present' : vol.endDate}
                        </div>
                      )}
                    </div>
                    {vol.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{vol.description}</p>
                    )}
                    {vol.url && (
                      <a
                        href={vol.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View details
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Languages */}
      {languageItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5" />
              Languages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {languageItems.map((lang: LanguageItem) => (
                <div key={lang.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <span className="font-medium">{lang.language}</span>
                  <Badge variant="outline">{getProficiencyLabel(lang.proficiency)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interests */}
      {interestItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5" />
              Interests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {interestItems.map((interest: InterestItem) => (
                <Badge key={interest.id} variant="secondary" className="px-3 py-1 text-sm">
                  {interest.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Custom Sections */}
      {customSections.map((section) => {
        const content = section.customContent as CustomSectionContent | null;
        const items = content?.items || [];
        const freeformContent = content?.content;

        // Skip if no content
        if (items.length === 0 && !freeformContent) return null;

        return (
          <Card key={section.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LayoutGrid className="h-5 w-5" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Structured items */}
              {items.length > 0 && (
                <div className="space-y-6">
                  {items.map((item: CustomSectionItem, index: number) => (
                    <div key={item.id}>
                      {index > 0 && <Separator className="mb-6" />}
                      <div className="flex gap-4">
                        <div className="hidden sm:block">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                            <LayoutGrid className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="font-semibold">{item.title}</h3>
                              {item.subtitle && (
                                <p className="text-muted-foreground">{item.subtitle}</p>
                              )}
                            </div>
                            {(item.startDate || item.endDate || item.isCurrent) && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Calendar className="h-4 w-4" />
                                {item.startDate && item.startDate}
                                {(item.endDate || item.isCurrent) && ' — '}
                                {item.isCurrent ? 'Present' : item.endDate}
                              </div>
                            )}
                          </div>
                          {item.description && (
                            <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                          )}
                          {item.tags && item.tags.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1">
                              {item.tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View details
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Freeform content */}
              {freeformContent && (
                <div className="prose prose-sm max-w-none text-muted-foreground">
                  <p className="whitespace-pre-wrap">{freeformContent}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
