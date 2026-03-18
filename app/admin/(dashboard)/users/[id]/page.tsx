import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { notFound } from 'next/navigation';

import { UserDetailClient } from './user-detail-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return { title: `User ${id} - Admin - Follio` };
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  const admin = await requireAdmin();

  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      clerkId: true,
      email: true,
      mainPurpose: true,
      lastSignInAt: true,
      createdAt: true,
      updatedAt: true,
      profiles: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          handle: true,
          resumeTitle: true,
          firstName: true,
          lastName: true,
          headline: true,
          avatarUrl: true,
          status: true,
          portfolioVisibility: true,
          resumeVisibility: true,
          isArchived: true,
          createdAt: true,
          updatedAt: true,
          publishedAt: true,
          _count: {
            select: {
              workExperiences: true,
              educations: true,
              skills: true,
              projects: true,
              links: true,
              photos: true,
              blogPosts: true,
              youtubeVideos: true,
              certifications: true,
              awards: true,
              dataSourceConnections: true,
              generatedPortfolios: true,
            },
          },
          dataSourceConnections: {
            select: {
              source: true,
              status: true,
              lastImportedAt: true,
              itemsImported: true,
            },
          },
          githubProfile: {
            select: {
              username: true,
              publicRepos: true,
              followers: true,
              totalStars: true,
            },
          },
        },
      },
      importSessions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          source: true,
          status: true,
          proposedCount: true,
          appliedCount: true,
          createdAt: true,
        },
      },
      shareTokens: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          token: true,
          viewCount: true,
          maxViews: true,
          expiresAt: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          profiles: true,
          importSessions: true,
          importJobs: true,
          importLogs: true,
          shareTokens: true,
        },
      },
    },
  });

  if (!user) {
    notFound();
  }

  // Check admin status from the separate Admin table
  const adminRecord = await db.admin.findUnique({
    where: { clerkId: user.clerkId },
    select: { id: true },
  });

  // Serialize dates
  const serialized = {
    ...user,
    isAdmin: !!adminRecord,
    lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    profiles: user.profiles.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      publishedAt: p.publishedAt?.toISOString() ?? null,
      dataSourceConnections: p.dataSourceConnections.map((d) => ({
        ...d,
        lastImportedAt: d.lastImportedAt?.toISOString() ?? null,
      })),
    })),
    importSessions: user.importSessions.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })),
    shareTokens: user.shareTokens.map((t) => ({
      ...t,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
  };

  return <UserDetailClient user={serialized} currentAdminId={admin.adminId} />;
}
