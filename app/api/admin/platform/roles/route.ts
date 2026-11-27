import { NextResponse } from 'next/server';

import {
  assignPlatformRole,
  authorizePlatform,
  deniedBody,
  enforcePlatformAction,
  listPlatformAdmins,
} from '@/_admin-panel/platform/auth';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AssignBody = { adminId?: unknown; role?: unknown };

/**
 * Platform role assignment (PLATFORM_TODO item 28).
 *
 * Thin shim. Admin auth, then the `roles:assign` permission — maintainer
 * only — then one call into `assignPlatformRole`, which holds every rule.
 *
 * The body carries the admin to change and the role to give them. **Neither
 * is a role for the caller**: the acting admin's own role is read from the
 * database, never from the request, so a viewer sending
 * `{"role":"maintainer"}` is refused by their stored role rather than
 * believed.
 *
 * No `DELETE` and no admin creation: membership of the `Admin` table is
 * `/api/admin/users/[id]/role`'s business and a different concept entirely.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();

    // The gate first, before the body: one rule across every privileged
    // route, and a refused caller's payload is never parsed. `assignPlatformRole`
    // audits the attempt itself once the target is known.
    const authz = await enforcePlatformAction({
      adminId: admin.adminId,
      permission: 'roles:assign',
      action: 'roles:assign',
    });
    if (!authz.allowed) return NextResponse.json(deniedBody(authz), { status: authz.status });

    const body = (await request.json().catch(() => ({}))) as AssignBody;
    const targetAdminId = typeof body.adminId === 'string' ? body.adminId : '';

    if (targetAdminId === '') {
      return NextResponse.json({ error: 'Send an adminId' }, { status: 400 });
    }

    // `body.role` goes in unvalidated on purpose: `assignPlatformRole` is the
    // one place that decides what a role may be, and it audits the refusal.
    const result = await assignPlatformRole(
      { adminId: admin.adminId, role: authz.role },
      targetAdminId,
      body.role
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.detail, reason: result.reason },
        { status: result.reason === 'unknown-admin' ? 404 : 409 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error, { path: '/api/admin/platform/roles', method: 'POST' });
  }
}

/**
 * The admins and their roles.
 *
 * Maintainer-only, like the assignment it exists to inform — who can do what
 * is not something a viewer needs, and listing it is not a read of the
 * Platform's diagnostics. Not audited: it mutates nothing, and auditing
 * reads would bury the attempts that matter.
 */
export async function GET() {
  try {
    const admin = await requireAdmin();

    const authz = await authorizePlatform(admin.adminId, 'roles:assign');
    if (!authz.allowed) {
      return NextResponse.json(deniedBody({ ...authz, status: 403 }), { status: 403 });
    }

    return NextResponse.json({ admins: await listPlatformAdmins() }, { status: 200 });
  } catch (error) {
    return handleApiError(error, { path: '/api/admin/platform/roles', method: 'GET' });
  }
}
