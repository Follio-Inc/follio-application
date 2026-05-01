/**
 * PATCH /api/admin/users/[id]/role
 *
 * Promotes or demotes a user's admin status.
 * Works with the separate Admin table — not a role column on User.
 *
 * Body: { action: 'promote' | 'demote' }
 *
 * Guards:
 *  - Cannot change your own admin status
 *  - Must always have at least one admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const actionSchema = z.object({
  action: z.enum(['promote', 'demote']),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id: targetUserId } = await params;

    const body = await request.json();
    const { action } = actionSchema.parse(body);

    // Look up the target user
    const targetUser = await db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, clerkId: true, email: true },
    });

    if (!targetUser) {
      throw new AppError('User not found', ErrorCode.NOT_FOUND, 404);
    }

    // Check if target is already an admin (from Admin table)
    const existingAdmin = await db.admin.findUnique({
      where: { clerkId: targetUser.clerkId },
      select: { id: true },
    });
    const isCurrentlyAdmin = !!existingAdmin;

    // Prevent admins from changing their own status
    if (targetUser.clerkId === admin.clerkId) {
      throw new AppError(
        'You cannot change your own admin status. Another admin must do this.',
        ErrorCode.BAD_REQUEST,
        400
      );
    }

    if (action === 'promote') {
      if (isCurrentlyAdmin) {
        return NextResponse.json({
          success: true,
          message: `${targetUser.email} is already an admin`,
          isAdmin: true,
        });
      }

      // Create an Admin record for this user
      await db.admin.create({
        data: {
          clerkId: targetUser.clerkId,
          email: targetUser.email,
        },
      });

      logger.info(`User promoted to admin: ${targetUser.email}`, {
        source: 'admin',
        actionBy: admin.adminId,
        targetUserId,
      });

      return NextResponse.json({
        success: true,
        message: `${targetUser.email} is now an admin`,
        isAdmin: true,
      });
    }

    // action === 'demote'
    if (!isCurrentlyAdmin) {
      return NextResponse.json({
        success: true,
        message: `${targetUser.email} is not an admin`,
        isAdmin: false,
      });
    }

    // Ensure at least one admin remains
    const adminCount = await db.admin.count();
    if (adminCount <= 1) {
      throw new AppError(
        'Cannot remove the last admin. Promote another user first.',
        ErrorCode.BAD_REQUEST,
        400
      );
    }

    // Remove the Admin record
    await db.admin.delete({
      where: { clerkId: targetUser.clerkId },
    });

    logger.info(`Admin removed: ${targetUser.email}`, {
      source: 'admin',
      actionBy: admin.adminId,
      targetUserId,
    });

    return NextResponse.json({
      success: true,
      message: `${targetUser.email} is no longer an admin`,
      isAdmin: false,
    });
  } catch (error) {
    return handleApiError(error, { path: '/api/admin/users/[id]/role', method: 'PATCH' });
  }
}
