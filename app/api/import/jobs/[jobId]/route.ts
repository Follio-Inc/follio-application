import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/import/jobs/[jobId]
 * Get the status of an import job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;

    const job = await db.importJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Verify ownership
    const user = await db.user.findUnique({
      where: { clerkId: userId },
    });

    if (job.userId !== user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({
      id: job.id,
      source: job.source,
      status: job.status.toLowerCase(),
      progress: job.progress,
      currentStep: job.currentStep,
      result: job.result,
      error: job.error,
      itemsFound: job.itemsFound,
      itemsMerged: job.itemsMerged,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  } catch (error) {
    console.error('Error fetching job status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
