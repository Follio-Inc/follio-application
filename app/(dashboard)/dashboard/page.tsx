import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Eye, Download, Edit, Plus, FileText, Briefcase, Clock, Users } from 'lucide-react';

import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default async function DashboardPage() {
  let userId: string | null = null;
  
  try {
    const authResult = await auth();
    userId = authResult?.userId ?? null;
  } catch {
    redirect('/sign-in');
  }

  if (!userId) {
    redirect('/sign-in');
  }

  const user = await currentUser();
  
  if (!user) {
    redirect('/sign-in');
  }

  // Get or create user record
  let dbUser = await db.user.findUnique({
    where: { clerkId: userId },
    include: {
      profile: {
        include: {
          workExperiences: { take: 3, orderBy: { sortOrder: 'asc' } },
          projects: { take: 3, where: { featured: true } },
          skills: { take: 10 },
        },
      },
    },
  });

  // Create user if doesn't exist
  if (!dbUser) {
    dbUser = await db.user.create({
      data: {
        clerkId: userId,
        email: user.emailAddresses[0]?.emailAddress || '',
      },
      include: {
        profile: {
          include: {
            workExperiences: { take: 3, orderBy: { sortOrder: 'asc' } },
            projects: { take: 3, where: { featured: true } },
            skills: { take: 10 },
          },
        },
      },
    });
  }

  const profile = dbUser.profile;

  // If no profile exists, redirect to onboarding
  if (!profile) {
    redirect('/onboarding');
  }

  const profileUrl = `/u/${profile.handle}`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Welcome back, {profile.firstName || 'there'}!</h1>
          <p className="text-muted-foreground">Manage your Follio profile and track your progress.</p>
        </div>
        <div className="flex gap-3">
          <Link href={profileUrl} target="_blank">
            <Button variant="outline" className="gap-2">
              <Eye className="h-4 w-4" />
              View Profile
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
          <Link href="/builder">
            <Button className="gap-2">
              <Edit className="h-4 w-4" />
              Edit Profile
            </Button>
          </Link>
        </div>
      </div>

      {/* Profile Overview Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profile.avatarUrl || undefined} alt={profile.firstName || 'Profile'} />
                <AvatarFallback className="text-lg">
                  {profile.firstName?.[0]}
                  {profile.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-xl">
                  {profile.firstName} {profile.lastName}
                </CardTitle>
                <CardDescription className="mt-1">{profile.headline}</CardDescription>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={profile.status === 'PUBLIC' ? 'default' : 'secondary'}>
                    {profile.status.toLowerCase()}
                  </Badge>
                  <span className="text-sm text-muted-foreground">follio.dev/u/{profile.handle}</span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Work Experiences</CardDescription>
            <CardTitle className="text-3xl">{profile.workExperiences.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/builder?section=experience" className="text-sm text-primary hover:underline">
              Edit experiences →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Projects</CardDescription>
            <CardTitle className="text-3xl">{profile.projects.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/builder?section=projects" className="text-sm text-primary hover:underline">
              Edit projects →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Skills</CardDescription>
            <CardTitle className="text-3xl">{profile.skills.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/builder?section=skills" className="text-sm text-primary hover:underline">
              Edit skills →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Profile Views</CardDescription>
            <CardTitle className="text-3xl">4</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-sm text-muted-foreground">Available view types</span>
          </CardContent>
        </Card>
      </div>

      {/* Profile Views Section */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">Profile Views</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link href={`${profileUrl}?view=resume`} target="_blank">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Resume</CardTitle>
                    <CardDescription className="text-xs">Traditional format</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
          <Link href={`${profileUrl}?view=portfolio`} target="_blank">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Briefcase className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Portfolio</CardTitle>
                    <CardDescription className="text-xs">Project showcase</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
          <Link href={`${profileUrl}?view=timeline`} target="_blank">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Timeline</CardTitle>
                    <CardDescription className="text-xs">Career journey</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
          <Link href={`${profileUrl}?view=recruiter`} target="_blank">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Recruiter</CardTitle>
                    <CardDescription className="text-xs">Quick facts</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>

      {/* Export Section */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">Export Profile</h2>
        <Card>
          <CardContent className="flex flex-wrap gap-3 pt-6">
            <Link href={`/api/export/${profile.handle}/json`} target="_blank">
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                JSON Resume
              </Button>
            </Link>
            <Link href={`/api/export/${profile.handle}/text`} target="_blank">
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Plain Text
              </Button>
            </Link>
            <Link href={`/api/export/${profile.handle}/pdf`} target="_blank">
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                PDF
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
