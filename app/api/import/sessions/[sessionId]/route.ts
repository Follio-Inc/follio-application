import { db } from '@/lib/db';
import {
  discardSession,
  getSessionById,
  markSessionApplied,
  updateSessionSelections,
} from '@/services/import-session.service';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/import/sessions/[sessionId]
 * Retrieve a specific import session by ID.
 *
 * PATCH /api/import/sessions/[sessionId]
 * Save the user's toggle selections and inline edits (auto-save).
 * Body: { selections?, edits? }
 *
 * POST /api/import/sessions/[sessionId]
 * Apply selected changes from the session to Builder data,
 * then mark the session as APPLIED.
 * Body: { action: "apply", syncBody: { ... } }
 *   or  { action: "discard" }
 *
 * DELETE /api/import/sessions/[sessionId]
 * Discard the session without applying anything.
 */

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function GET(request: NextRequest, props: RouteParams) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { clerkId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { sessionId } = await props.params;
    const session = await getSessionById(sessionId, user.id);

    if (!session) {
      return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
    }

    return NextResponse.json({
      session: {
        id: session.id,
        source: session.source,
        status: session.status,
        sourceLabel: session.sourceLabel,
        proposedCount: session.proposedCount,
        parsedData: session.parsedData,
        previewData: session.previewData,
        selections: session.selections,
        edits: session.edits,
        appliedCount: session.appliedCount,
        appliedAt: session.appliedAt,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error('Failed to get import session:', error);
    return NextResponse.json({ error: 'Failed to get session' }, { status: 500 });
  }
}

/**
 * PATCH — Persist toggle/edit state (auto-save as user interacts)
 */
export async function PATCH(request: NextRequest, props: RouteParams) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { clerkId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { sessionId } = await props.params;
    const body = await request.json();

    await updateSessionSelections(sessionId, user.id, {
      selections: body.selections,
      edits: body.edits,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update session:', error);
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
  }
}

/**
 * POST — Apply selected changes or discard the session
 */
export async function POST(request: NextRequest, props: RouteParams) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { clerkId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { sessionId } = await props.params;
    const body = await request.json();

    if (body.action === 'discard') {
      await discardSession(sessionId, user.id);
      return NextResponse.json({ success: true, message: 'Session discarded' });
    }

    if (body.action === 'apply') {
      // The actual sync-apply call is made by the client directly to /api/import/sync-apply.
      // After that succeeds, the client calls this endpoint to mark the session done.
      const appliedCount = body.appliedCount || 0;
      await markSessionApplied(sessionId, user.id, appliedCount);
      return NextResponse.json({
        success: true,
        message: 'Session marked as applied',
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Failed to process session action:', error);
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}

/**
 * DELETE — Discard the session
 */
export async function DELETE(request: NextRequest, props: RouteParams) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { clerkId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { sessionId } = await props.params;
    await discardSession(sessionId, user.id);
    return NextResponse.json({ success: true, message: 'Session discarded' });
  } catch (error) {
    console.error('Failed to discard session:', error);
    return NextResponse.json({ error: 'Failed to discard session' }, { status: 500 });
  }
}
