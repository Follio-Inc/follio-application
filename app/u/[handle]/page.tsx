import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicProfile } from '@/services/profile.service';
import { ProfileViewer } from './profile-viewer';

interface ProfilePageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ view?: string }>;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);
  
  if (!profile) {
    return {
      title: 'Profile Not Found | Follio',
    };
  }

  const title = `${profile.firstName} ${profile.lastName} | Follio`;
  const description = profile.summary || `${profile.headline || 'Professional'} based in ${profile.location || 'Unknown'}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
      firstName: profile.firstName,
      lastName: profile.lastName || undefined,
      images: profile.avatarUrl ? [profile.avatarUrl] : [],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: profile.avatarUrl ? [profile.avatarUrl] : [],
    },
    alternates: {
      canonical: `/u/${handle}`,
    },
  };
}

export const revalidate = 60; // ISR: revalidate every 60 seconds

export default async function ProfilePage({ params, searchParams }: ProfilePageProps) {
  const { handle } = await params;
  const { view = 'resume' } = await searchParams;
  
  const profile = await getPublicProfile(handle);

  if (!profile || profile.status === 'DRAFT') {
    notFound();
  }

  if (profile.status === 'PRIVATE') {
    // TODO: Check for valid share token
    notFound();
  }

  return (
    <ProfileViewer 
      profile={profile} 
      initialView={view as 'resume' | 'portfolio' | 'timeline' | 'recruiter'} 
    />
  );
}
