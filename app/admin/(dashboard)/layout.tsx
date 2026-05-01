import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { AdminShell } from './components/admin-shell';

/**
 * Auth-guarded layout for the admin dashboard.
 * Checks the separate Admin table — not the User table.
 * Lives inside the (dashboard) route group so /admin/sign-in is NOT affected.
 */
export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    redirect('/admin/sign-in');
  }

  const admin = await db.admin.findUnique({
    where: { clerkId },
    select: { email: true },
  });

  // Not an admin (or not found) — pretend admin doesn't exist
  if (!admin) {
    notFound();
  }

  return <AdminShell adminEmail={admin.email}>{children}</AdminShell>;
}
