/**
 * Bootstrap Super Admin (Clerk-only)
 *
 * Creates/links a Clerk user and a row in the separate Admin table.
 * Admins are not Follio product Users — just Clerk + Admin table.
 *
 * Usage: npx tsx scripts/admin-setup.ts
 */

import { createClerkClient } from '@clerk/backend';
import { PrismaClient } from '@prisma/client';

const ADMIN_EMAIL = 'shobhit.s@follio.me';
/** Only used when Clerk must create a brand-new user. Prefer your existing Clerk login if the email already exists. */
const ADMIN_PASSWORD = 'F0ll!o#Adm1n$2026xQ';
const ADMIN_FIRST_NAME = 'Shobhit';
const ADMIN_LAST_NAME = 'Admin';
const LEGACY_ADMIN_EMAIL = 'shobhit.s@follio.net';

const db = new PrismaClient();

async function main() {
  console.log('🔧 Follio Super Admin Bootstrap (Clerk)\n');

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error('❌ CLERK_SECRET_KEY not found in environment. Add it to .env / .env.local');
    process.exit(1);
  }

  const clerk = createClerkClient({ secretKey });

  // Drop legacy .net admin row if present (Clerk user left alone).
  const legacy = await db.admin.findUnique({
    where: { email: LEGACY_ADMIN_EMAIL },
    select: { id: true, email: true },
  });
  if (legacy) {
    await db.admin.delete({ where: { id: legacy.id } });
    console.log('→ Removed legacy Admin row:', LEGACY_ADMIN_EMAIL);
  }

  const existingAdmin = await db.admin.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, email: true, clerkId: true },
  });

  if (existingAdmin) {
    console.log('✅ Admin already exists:', existingAdmin.email);
    console.log('   Sign in at /admin/sign-in with your Clerk password for that email.');
    await db.$disconnect();
    return;
  }

  console.log('→ Resolving Clerk user for', ADMIN_EMAIL);

  let clerkUser;
  let createdNewUser = false;
  const listed = await clerk.users.getUserList({ emailAddress: [ADMIN_EMAIL] });
  clerkUser = listed.data[0];

  if (clerkUser) {
    console.log('  Linked existing Clerk user:', clerkUser.id);
  } else {
    console.log('  No Clerk user yet — creating one…');
    try {
      clerkUser = await clerk.users.createUser({
        emailAddress: [ADMIN_EMAIL],
        password: ADMIN_PASSWORD,
        firstName: ADMIN_FIRST_NAME,
        lastName: ADMIN_LAST_NAME,
        skipPasswordChecks: true,
      });
      createdNewUser = true;
      console.log('  Clerk user created:', clerkUser.id);
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ code: string; message: string }> };
      console.error('❌ Failed to create Clerk user:', clerkErr.errors ?? err);
      process.exit(1);
    }
  }

  // Avoid unique clash if an Admin row already points at this clerkId under another email.
  const byClerk = await db.admin.findUnique({
    where: { clerkId: clerkUser.id },
    select: { id: true, email: true },
  });
  if (byClerk) {
    const adminRecord = await db.admin.update({
      where: { id: byClerk.id },
      data: {
        email: ADMIN_EMAIL,
        name: `${ADMIN_FIRST_NAME} ${ADMIN_LAST_NAME}`,
      },
      select: { id: true, email: true, clerkId: true },
    });
    console.log('\n✅ Updated existing Admin row to', adminRecord.email);
    console.log('   Clerk ID:', adminRecord.clerkId);
  } else {
    const adminRecord = await db.admin.create({
      data: {
        clerkId: clerkUser.id,
        email: ADMIN_EMAIL,
        name: `${ADMIN_FIRST_NAME} ${ADMIN_LAST_NAME}`,
      },
      select: { id: true, email: true, clerkId: true },
    });
    console.log('\n✅ Admin created');
    console.log('   Email:', adminRecord.email);
    console.log('   Clerk ID:', adminRecord.clerkId);
  }

  console.log('\n🔐 Sign in at /admin/sign-in');
  console.log('   Email:', ADMIN_EMAIL);
  if (createdNewUser) {
    console.log('   Password:', ADMIN_PASSWORD);
    console.log('\n⚠️  Change this password after first login (Clerk Dashboard).');
  } else {
    console.log('   Password: your existing Clerk password for this email');
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  db.$disconnect();
  process.exit(1);
});
