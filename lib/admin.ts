/**
 * Admin Authorization Utilities
 *
 * Provides helpers to verify admin access in API routes and server components.
 * Uses the separate `Admin` table — completely independent from the User model.
 *
 * Usage:
 *   import { requireAdmin } from '@/lib/admin';
 *
 *   // In an API route or server component:
 *   const admin = await requireAdmin();
 *   // Throws AppError(FORBIDDEN) if the caller is not an admin
 */

import { auth } from '@clerk/nextjs/server';

import { db } from '@/lib/db';
import { AppError, ErrorCode } from '@/lib/errors';
import { logger } from '@/lib/logger';

export interface AdminContext {
  adminId: string;
  clerkId: string;
  email: string;
}

/**
 * Verify that the current request is made by an authenticated admin.
 * Queries the separate Admin table — not the User table.
 * Throws if unauthenticated or not an admin.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    throw new AppError('Authentication required', ErrorCode.UNAUTHORIZED, 401);
  }

  const admin = await db.admin.findUnique({
    where: { clerkId },
    select: { id: true, clerkId: true, email: true },
  });

  if (!admin) {
    logger.warn('Non-admin attempted to access admin resource', {
      clerkId,
      source: 'admin',
    });
    throw new AppError('Admin access required', ErrorCode.FORBIDDEN, 403);
  }

  return {
    adminId: admin.id,
    clerkId: admin.clerkId,
    email: admin.email,
  };
}

/**
 * Check if the current user is an admin without throwing.
 * Returns null if not authenticated or not an admin.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}
