'use client';

import {
  Mail,
  MapPin,
  Globe,
  Github,
  Linkedin,
  Twitter,
  ExternalLink,
  Calendar,
  Building2,
  GraduationCap,
  Award,
  FileCheck,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

import { formatDate } from '@/lib/utils';
import type { PublicProfile } from '@/types';

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
                    {exp.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{exp.description}</p>
                    )}
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
    </div>
  );
}
