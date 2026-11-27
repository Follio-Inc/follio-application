/**
 * The authorization chain every rewrite-proposal route runs first.
 *
 * Factored out because it is repeated on five endpoints and the failure mode
 * of getting it wrong once is somebody reading or editing another person's
 * resume. One implementation, called identically everywhere, is easier to
 * audit than five that look similar.
 *
 * Identity is never taken from the request: `resumeId` comes from the path and
 * the user from the Clerk session. Both the resume lookup and every proposal
 * lookup downstream scope by the resolved Follio user id in the `where`
 * clause, so ownership is the query rather than a check performed after the
 * row is already in hand.
 *
 * "Not yours" and "does not exist" deliberately return the same 404. A
 * distinguishable 403 would turn these endpoints into a way to learn that
 * another user's batch id is real.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';

export interface AuthorizedResume {
  userId: string;
  resumeId: string;
}

export type AuthorizeResult =
  | { ok: true; context: AuthorizedResume }
  | { ok: false; response: NextResponse };

/** Authenticate, resolve the Follio user, and prove they own this resume. */
export async function authorizeResume(resumeId: string): Promise<AuthorizeResult> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const user = await db.user.findUnique({ where: { clerkId }, select: { id: true } });
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'User not found' }, { status: 404 }),
    };
  }

  const resume = await db.profile.findFirst({
    where: { id: resumeId, userId: user.id, isArchived: false },
    select: { id: true },
  });

  if (!resume) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Resume not found' }, { status: 404 }),
    };
  }

  return { ok: true, context: { userId: user.id, resumeId: resume.id } };
}

/**
 * Read a JSON body, treating an absent one as `{}`.
 *
 * Several of these endpoints take no input at all, and a client that sends no
 * body for them should succeed rather than get a parse error.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return undefined;
  }
}
