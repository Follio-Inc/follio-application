'use client';

import { motion } from 'framer-motion';
import { Mail, MapPin, Calendar, Briefcase, GraduationCap, Code2, Download, CheckCircle, Globe } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import { formatDate } from '@/lib/utils';
import type { PublicProfile } from '@/types';

interface RecruiterViewProps {
  profile: PublicProfile;
}

export function RecruiterView({ profile }: RecruiterViewProps) {
  const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`;

  // Calculate key metrics
  const totalYearsExperience = profile.workExperiences?.reduce((total, exp) => {
    const start = new Date(exp.startDate);
    const end = exp.isCurrent ? new Date() : exp.endDate ? new Date(exp.endDate) : new Date();
    const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365);
    return total + years;
  }, 0) || 0;

  const currentRole = profile.workExperiences?.find((exp) => exp.isCurrent);
  const latestEducation = profile.educations?.[0];
  
  // Get top skills (expert level first)
  const expertSkills = profile.skills?.filter((s) => s.level === 'EXPERT') || [];
  const otherSkills = profile.skills?.filter((s) => s.level !== 'EXPERT') || [];
  const topSkills = [...expertSkills, ...otherSkills].slice(0, 10);

  // Unique companies
  const companies = [...new Set(profile.workExperiences?.map((e) => e.company) || [])];
  
  // Tech stack from projects
  const allTech = profile.projects?.flatMap((p) => p.techStack || []) || [];
  const uniqueTech = [...new Set(allTech)].slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Quick Summary Card */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                <AvatarImage src={profile.avatarUrl || undefined} alt={profile.firstName || undefined} />
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-3xl font-bold">
                  {profile.firstName} {profile.lastName}
                </h1>
                {profile.headline && (
                  <p className="mt-1 text-xl text-muted-foreground">{profile.headline}</p>
                )}
                <div className="mt-3 flex flex-wrap justify-center gap-4 text-sm sm:justify-start">
                  {profile.location && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      {profile.location}
                    </span>
                  )}
                  {profile.contactInfo?.email && (
                    <a
                      href={`mailto:${profile.contactInfo.email}`}
                      className="flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <Mail className="h-4 w-4" />
                      {profile.contactInfo.email}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button asChild>
                  <a href={`/api/export/${profile.handle}/json`} target="_blank">
                    <Download className="mr-2 h-4 w-4" />
                    Export Resume
                  </a>
                </Button>
                {profile.links?.find((l) => l.type === 'LINKEDIN') && (
                  <Button variant="outline" asChild>
                    <a
                      href={profile.links.find((l) => l.type === 'LINKEDIN')?.url}
                      target="_blank"
                      rel="noopener"
                    >
                      <Globe className="mr-2 h-4 w-4" />
                      LinkedIn
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Key Stats */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
              <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{Math.round(totalYearsExperience)}+</p>
              <p className="text-sm text-muted-foreground">Years Experience</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900">
              <Briefcase className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{companies.length}</p>
              <p className="text-sm text-muted-foreground">Companies</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900">
              <Code2 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{profile.skills?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Skills</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900">
              <GraduationCap className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{profile.educations?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Degrees</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Current Position */}
        {currentRole && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Current Position
                </CardTitle>
              </CardHeader>
              <CardContent>
                <h3 className="text-lg font-semibold">{currentRole.title}</h3>
                <p className="text-muted-foreground">{currentRole.company}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Since {formatDate(currentRole.startDate)}
                </p>
                {currentRole.description && (
                  <p className="mt-3 text-sm text-muted-foreground">{currentRole.description}</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Education */}
        {latestEducation && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Education
                </CardTitle>
              </CardHeader>
              <CardContent>
                <h3 className="text-lg font-semibold">{latestEducation.degree}</h3>
                {latestEducation.fieldOfStudy && (
                  <p className="text-muted-foreground">{latestEducation.fieldOfStudy}</p>
                )}
                <p className="text-muted-foreground">{latestEducation.institution}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(latestEducation.startDate)} — {formatDate(latestEducation.endDate)}
                </p>
                {latestEducation.gpa && (
                  <p className="mt-2 text-sm">
                    <span className="font-medium">GPA:</span> {latestEducation.gpa}
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Skills Matrix */}
      {topSkills.length > 0 && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Core Competencies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {topSkills.map((skill) => (
                  <Badge
                    key={skill.id}
                    variant={skill.level === 'EXPERT' ? 'default' : 'secondary'}
                    className="px-3 py-1"
                  >
                    {skill.name}
                    {skill.yearsOfExperience && (
                      <span className="ml-1 opacity-70">{skill.yearsOfExperience}y</span>
                    )}
                  </Badge>
                ))}
              </div>
              {uniqueTech.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="mb-2 text-sm font-medium text-muted-foreground">
                      Project Technologies
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {uniqueTech.map((tech) => (
                        <Badge key={tech} variant="outline">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Career History */}
      {profile.workExperiences && profile.workExperiences.length > 0 && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Career History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {profile.workExperiences.map((exp, index) => (
                  <div
                    key={exp.id}
                    className={`flex items-start gap-4 ${
                      index < profile.workExperiences!.length - 1 ? 'border-b pb-4' : ''
                    }`}
                  >
                    <div className="flex h-2 w-2 translate-y-2 rounded-full bg-primary" />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h4 className="font-medium">{exp.title}</h4>
                          <p className="text-sm text-muted-foreground">{exp.company}</p>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(exp.startDate)} — {exp.isCurrent ? 'Present' : formatDate(exp.endDate)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Quick Actions for Recruiters */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col items-center justify-between gap-4 pt-6 sm:flex-row">
            <div>
              <h3 className="font-semibold">Interested in this candidate?</h3>
              <p className="text-sm text-muted-foreground">
                Download their resume or reach out directly via email
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" asChild>
                <a href={`/api/export/${profile.handle}/text`} target="_blank">
                  Plain Text
                </a>
              </Button>
              <Button asChild>
                <a href={`mailto:${profile.contactInfo?.email || ''}`}>
                  <Mail className="mr-2 h-4 w-4" />
                  Contact
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
