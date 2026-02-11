import { db } from '@/lib/db';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/import/sync-status
 *
 * Returns the current state of all import sources for the user:
 * - Which sources are connected
 * - How many items came from each source
 * - How many items have been manually edited (source=MANUAL)
 * - Last import dates
 *
 * This powers the Import & Sync page in the builder.
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        profile: {
          include: {
            dataSourceConnections: true,
            workExperiences: { select: { id: true, source: true, company: true } },
            educations: { select: { id: true, source: true, institution: true } },
            skills: { select: { id: true, source: true, name: true } },
            projects: { select: { id: true, source: true, title: true } },
            links: { select: { id: true, source: true, url: true } },
            certifications: { select: { id: true, source: true, name: true } },
            githubProfile: { select: { username: true } },
          },
        },
      },
    });

    if (!user?.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile = user.profile;

    // Get Clerk external accounts to check OAuth connections
    const clerkUser = await currentUser();
    const externalAccounts = clerkUser?.externalAccounts || [];

    const connectedGithub = externalAccounts.find(
      (a) => a.provider === 'oauth_github' || a.provider === 'github'
    );
    const connectedLinkedin = externalAccounts.find((a) => {
      const provider = a.provider as string;
      return (
        provider === 'linkedin_oidc' ||
        provider === 'linkedin' ||
        provider === 'oauth_linkedin_oidc' ||
        provider === 'oauth_linkedin'
      );
    });
    const connectedGoogle = externalAccounts.find((a) => {
      const provider = a.provider as string;
      return provider === 'google' || provider === 'oauth_google' || provider === 'google_oidc';
    });

    // Count items by source
    const countBySource = (items: Array<{ source: string }>) => {
      const counts: Record<string, number> = {};
      for (const item of items) {
        counts[item.source] = (counts[item.source] || 0) + 1;
      }
      return counts;
    };

    // Count manually edited profile fields
    const manualProfileFields: string[] = [];
    if (profile.firstNameSource === 'MANUAL' && profile.firstName)
      manualProfileFields.push('firstName');
    if (profile.lastNameSource === 'MANUAL' && profile.lastName)
      manualProfileFields.push('lastName');
    if (profile.headlineSource === 'MANUAL' && profile.headline)
      manualProfileFields.push('headline');
    if (profile.summarySource === 'MANUAL' && profile.summary) manualProfileFields.push('summary');
    if (profile.locationSource === 'MANUAL' && profile.location)
      manualProfileFields.push('location');

    // Get data source connection info
    const githubConnection = profile.dataSourceConnections.find((c) => c.source === 'GITHUB');
    const linkedinConnection = profile.dataSourceConnections.find((c) => c.source === 'LINKEDIN');
    const googleConnection = profile.dataSourceConnections.find((c) => c.source === 'GOOGLE');
    const resumeConnection = profile.dataSourceConnections.find((c) => c.source === 'RESUME');

    // Build response
    const syncStatus = {
      sources: {
        github: {
          connected: !!connectedGithub,
          oauthUsername: connectedGithub?.username || null,
          avatarUrl: connectedGithub?.imageUrl || null,
          emailAddress: connectedGithub?.emailAddress || null,
          profileUsername: profile.githubProfile?.username || null,
          lastImportedAt: githubConnection?.lastImportedAt || null,
          itemsImported: githubConnection?.itemsImported || 0,
          connectionStatus: githubConnection?.status || null,
          itemsBySource: countBySource(profile.projects.filter((p) => p.source === 'GITHUB')),
          projectCount: profile.projects.filter((p) => p.source === 'GITHUB').length,
          skillCount: profile.skills.filter((s) => s.source === 'GITHUB').length,
        },
        linkedin: {
          connected: !!connectedLinkedin,
          oauthName: connectedLinkedin
            ? `${connectedLinkedin.firstName || ''} ${connectedLinkedin.lastName || ''}`.trim() ||
              connectedLinkedin.username ||
              null
            : null,
          avatarUrl: connectedLinkedin?.imageUrl || null,
          emailAddress: connectedLinkedin?.emailAddress || null,
          lastImportedAt: linkedinConnection?.lastImportedAt || null,
          itemsImported: linkedinConnection?.itemsImported || 0,
          connectionStatus: linkedinConnection?.status || null,
        },
        google: {
          connected: !!connectedGoogle,
          oauthName: connectedGoogle
            ? `${connectedGoogle.firstName || ''} ${connectedGoogle.lastName || ''}`.trim() ||
              connectedGoogle.username ||
              null
            : null,
          avatarUrl: connectedGoogle?.imageUrl || null,
          emailAddress: connectedGoogle?.emailAddress || null,
          lastImportedAt: googleConnection?.lastImportedAt || null,
          itemsImported: googleConnection?.itemsImported || 0,
          connectionStatus: googleConnection?.status || null,
        },
        resume: {
          hasBeenImported: !!resumeConnection,
          lastImportedAt: resumeConnection?.lastImportedAt || null,
          itemsImported: resumeConnection?.itemsImported || 0,
        },
      },
      manualEdits: {
        profileFields: manualProfileFields,
        profileFieldCount: manualProfileFields.length,
        experiences: {
          total: profile.workExperiences.length,
          manual: profile.workExperiences.filter((w) => w.source === 'MANUAL').length,
          fromResume: profile.workExperiences.filter((w) => w.source === 'RESUME').length,
          fromLinkedIn: profile.workExperiences.filter((w) => w.source === 'LINKEDIN').length,
        },
        educations: {
          total: profile.educations.length,
          manual: profile.educations.filter((e) => e.source === 'MANUAL').length,
          fromResume: profile.educations.filter((e) => e.source === 'RESUME').length,
        },
        skills: {
          total: profile.skills.length,
          manual: profile.skills.filter((s) => s.source === 'MANUAL').length,
          fromResume: profile.skills.filter((s) => s.source === 'RESUME').length,
          fromGitHub: profile.skills.filter((s) => s.source === 'GITHUB').length,
        },
        projects: {
          total: profile.projects.length,
          manual: profile.projects.filter((p) => p.source === 'MANUAL').length,
          fromResume: profile.projects.filter((p) => p.source === 'RESUME').length,
          fromGitHub: profile.projects.filter((p) => p.source === 'GITHUB').length,
        },
        links: {
          total: profile.links.length,
          manual: profile.links.filter((l) => l.source === 'MANUAL').length,
        },
      },
      // Summary: any manual edits exist?
      hasManualEdits:
        manualProfileFields.length > 0 ||
        profile.workExperiences.some((w) => w.source === 'MANUAL') ||
        profile.educations.some((e) => e.source === 'MANUAL') ||
        profile.skills.some((s) => s.source === 'MANUAL') ||
        profile.projects.some((p) => p.source === 'MANUAL'),
    };

    return NextResponse.json(syncStatus);
  } catch (error) {
    console.error('Error fetching sync status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
