import { getPublicProfile } from '@/services/profile.service';
import { auth } from '@clerk/nextjs/server';
import { FileText, Grid3X3, Presentation } from 'lucide-react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/lib/db';
import { getPortfolioUrl } from '@/lib/url';

import { SnapView } from '../views/snap-view';

// Helper to serialize data for client components (converts Date objects to ISO strings)
function serializeForClient<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

interface SnapPageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ token?: string; key?: string }>;
}

async function getAuthState(handle: string): Promise<'owner' | 'authenticated' | 'anonymous'> {
  try {
    const { userId } = await auth();
    if (!userId) return 'anonymous';

    const ownedProfile = await db.profile.findFirst({
      where: {
        handle,
        user: { clerkId: userId },
        isArchived: false,
      },
      select: { id: true },
    });

    if (ownedProfile) return 'owner';
    return 'authenticated';
  } catch {
    return 'anonymous';
  }
}

export async function generateMetadata({ params }: SnapPageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);

  if (!profile) {
    return { title: 'Profile Not Found | Follio' };
  }

  const fullName = `${profile.firstName} ${profile.lastName}`;
  return {
    title: `${fullName} — Snap View | Follio`,
    description: `Professional snapshot of ${fullName}. ${profile.headline || ''}`,
    openGraph: {
      title: `${fullName} — Snap View`,
      description: profile.headline || `Professional snapshot of ${fullName}`,
      type: 'profile',
      url: `${getPortfolioUrl(handle)}/snap`,
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function SnapPage({ params, searchParams }: SnapPageProps) {
  const { handle } = await params;
  const { token, key } = await searchParams;

  const [profile, authState] = await Promise.all([getPublicProfile(handle), getAuthState(handle)]);

  if (!profile || profile.status === 'DRAFT') {
    notFound();
  }

  // Respect visibility: PRIVATE profiles require auth or token
  if (profile.status === 'PRIVATE' && authState !== 'owner') {
    // Check for share token
    if (token) {
      const shareToken = await db.shareToken.findUnique({
        where: { token },
        select: { userId: true, expiresAt: true, maxViews: true, viewCount: true },
      });
      const matchingProfile = shareToken
        ? await db.profile.findFirst({
            where: { userId: shareToken.userId, handle, isArchived: false },
            select: { id: true },
          })
        : null;
      const isValid =
        matchingProfile &&
        (!shareToken!.expiresAt || shareToken!.expiresAt > new Date()) &&
        (!shareToken!.maxViews || shareToken!.viewCount < shareToken!.maxViews);
      if (!isValid) notFound();
    } else if (key) {
      const profileRecord = await db.profile.findFirst({
        where: { handle, isArchived: false },
        select: { unlistedKey: true },
      });
      if (!profileRecord?.unlistedKey || profileRecord.unlistedKey !== key) notFound();
    } else {
      notFound();
    }
  }

  const serializedProfile = serializeForClient(profile);

  const NAV_ITEMS = [
    { href: `/u/${handle}`, label: 'Portfolio', icon: Grid3X3, active: false },
    { href: `/u/${handle}/resume`, label: 'Resume', icon: FileText, active: false },
    { href: `/u/${handle}/snap`, label: 'Snap View', icon: Presentation, active: true },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/20 to-background">
      {/* Navigation */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-[1400px] items-center justify-center px-6 py-2.5 sm:px-10">
          <nav className="inline-flex items-center gap-1 rounded-full border bg-background/80 p-1 shadow-sm backdrop-blur-sm">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    item.active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <SnapView profile={serializedProfile} />
    </div>
  );
}
