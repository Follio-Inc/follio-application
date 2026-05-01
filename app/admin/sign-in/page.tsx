import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { AdminSignInForm } from './admin-sign-in-form';

export const metadata = {
  title: 'Admin Sign In - Follio',
};

export default async function AdminSignInPage() {
  const { userId: clerkId } = await auth();

  if (clerkId) {
    // Check the separate Admin table
    const admin = await db.admin.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    // Already signed in as admin → go to dashboard
    if (admin) {
      redirect('/admin');
    }

    // Signed in but not admin → pretend this doesn't exist
    notFound();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <AdminSignInForm />
    </div>
  );
}
