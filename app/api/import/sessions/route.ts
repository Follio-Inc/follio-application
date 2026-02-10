import { db } from '@/lib/db';
import {
  createImportSession,
  getActiveSession,
  listSessions,
} from '@/services/import-session.service';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/import/sessions
 *
 * Creates a new import session from parsed resume data.
 * This persists the proposed changes so the user can review
 * them at their own pace — nothing touches Builder data.
 *
 * Body: { source, parsedData, previewData, sourceLabel?, proposedCount }
 *
 * GET /api/import/sessions?source=RESUME
 *
 * Returns the active (PENDING_REVIEW) import session for the
 * given source, if one exists. Allows the UI to resume review
 * after a page refresh.
 *
 * GET /api/import/sessions?source=RESUME&history=true
 *
 * Returns all import sessions (applied, discarded, etc.) plus
 * ImportLog entries for the given source. Used for the import timeline.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { clerkId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { source, parsedData, previewData, sourceLabel, proposedCount } = body;

    if (!source || !parsedData) {
      return NextResponse.json({ error: 'source and parsedData are required' }, { status: 400 });
    }

    const session = await createImportSession({
      userId: user.id,
      source,
      parsedData,
      previewData: previewData || null,
      sourceLabel,
      proposedCount: proposedCount || 0,
    });

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        source: session.source,
        status: session.status,
        sourceLabel: session.sourceLabel,
        proposedCount: session.proposedCount,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error('Failed to create import session:', error);
    return NextResponse.json({ error: 'Failed to create import session' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { clerkId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const source = request.nextUrl.searchParams.get('source');
    if (!source) {
      return NextResponse.json({ error: 'source query param is required' }, { status: 400 });
    }

    const history = request.nextUrl.searchParams.get('history');

    // ── History mode: return timeline of all imports ──
    if (history === 'true') {
      // Get all sessions (applied, discarded, pending) for this source
      const sessions = await listSessions(user.id, { source: source as never, limit: 20 });

      // Also get ImportLog entries for older imports (e.g. onboarding)
      const importLogs = await db.importLog.findMany({
        where: { userId: user.id, source: source as never, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          source: true,
          itemsFound: true,
          itemsMerged: true,
          metadata: true,
          createdAt: true,
        },
      });

      // Build unified timeline entries
      type TimelineEntry = {
        id: string;
        type: 'session' | 'log';
        label: string;
        date: string;
        itemsFound: number;
        itemsApplied: number | null;
        status: string;
      };

      const timeline: TimelineEntry[] = [];

      for (const s of sessions) {
        timeline.push({
          id: s.id,
          type: 'session',
          label: s.sourceLabel || 'Resume',
          date: (s.appliedAt || s.createdAt).toISOString(),
          itemsFound: s.proposedCount,
          itemsApplied: s.appliedCount,
          status: s.status,
        });
      }

      // Only add ImportLog entries that don't overlap with sessions
      // (sessions are newer mechanism — logs are from legacy imports)
      // Only skip logs when an APPLIED session exists for that day (not discarded/pending)
      const appliedSessionDates = new Set(
        sessions
          .filter((s) => s.status === 'APPLIED')
          .map((s) => s.createdAt.toISOString().slice(0, 10))
      );

      for (const log of importLogs) {
        const logDate = log.createdAt.toISOString().slice(0, 10);
        // Skip if an applied session exists for the same day (likely same import)
        if (appliedSessionDates.has(logDate)) continue;

        const meta = log.metadata as Record<string, unknown> | null;
        const fileName = meta?.fileName as string | null;
        const origin = meta?.origin as string | null;

        timeline.push({
          id: log.id,
          type: 'log',
          label: fileName || (origin === 'onboarding' ? 'Resume (onboarding)' : 'Resume'),
          date: log.createdAt.toISOString(),
          itemsFound: log.itemsFound,
          itemsApplied: log.itemsMerged,
          status: 'APPLIED',
        });
      }

      // Sort newest first
      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return NextResponse.json({ history: timeline });
    }

    // ── Default: return active pending session ──
    const session = await getActiveSession(user.id, source as never);

    if (!session) {
      return NextResponse.json({ session: null });
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
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error('Failed to get import session:', error);
    return NextResponse.json({ error: 'Failed to get import session' }, { status: 500 });
  }
}
