/**
 * Bootstrap Super Admin
 *
 * Creates a dedicated admin account in Clerk and the separate Admin table.
 * This is a one-time setup script — run it once to bootstrap the first admin.
 * All subsequent admins should be managed from the admin panel UI.
 *
 * The admin is stored in the Admin table — completely separate from the User table.
 *
 * Usage: npx tsx scripts/admin-setup.ts
 */

import { createClerkClient } from '@clerk/backend';
import { PrismaClient } from '@prisma/client';

const ADMIN_EMAIL = 'shobhit.s@follio.net';
const ADMIN_PASSWORD = 'F0ll!o#Adm1n$2026xQ'; // Change after first login via Clerk dashboard
const ADMIN_FIRST_NAME = 'Shobhit';
const ADMIN_LAST_NAME = 'Admin';

const db = new PrismaClient();

async function main() {
  console.log('🔧 Follio Super Admin Bootstrap\n');

  // Check if admin already exists in the Admin table
  const existingAdmin = await db.admin.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, email: true, clerkId: true },
  });

  if (existingAdmin) {
    console.log('✅ Super admin already exists:', existingAdmin.email);
    console.log('   ID:', existingAdmin.id);
    console.log('\n   No action needed. Sign in at /admin/sign-in');
    await db.$disconnect();
    return;
  }

  // Create in Clerk
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error('❌ CLERK_SECRET_KEY not found in environment. Add it to .env');
    process.exit(1);
  }

  const clerk = createClerkClient({ secretKey });

  console.log('→ Creating Clerk user...');
  let clerkUser;
  try {
    clerkUser = await clerk.users.createUser({
      emailAddress: [ADMIN_EMAIL],
      password: ADMIN_PASSWORD,
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      skipPasswordChecks: true,
    });
    console.log('  Clerk user created:', clerkUser.id);
  } catch (err: unknown) {
    const clerkErr = err as { errors?: Array<{ code: string; message: string }> };
    // If user already exists in Clerk, find them
    if (clerkErr.errors?.some((e) => e.code === 'form_identifier_exists')) {
      console.log('  Clerk user already exists, looking up...');
      const users = await clerk.users.getUserList({ emailAddress: [ADMIN_EMAIL] });
      clerkUser = users.data[0];
      if (!clerkUser) {
        console.error('❌ Could not find existing Clerk user for', ADMIN_EMAIL);
        process.exit(1);
      }
      console.log('  Found Clerk user:', clerkUser.id);
    } else {
      console.error('❌ Failed to create Clerk user:', clerkErr.errors ?? err);
      process.exit(1);
    }
  }

  // Create in the separate Admin table
  console.log('→ Creating admin record...');
  const adminRecord = await db.admin.create({
    data: {
      clerkId: clerkUser.id,
      email: ADMIN_EMAIL,
      name: `${ADMIN_FIRST_NAME} ${ADMIN_LAST_NAME}`,
    },
    select: { id: true, email: true, clerkId: true },
  });

  console.log('\n✅ Super admin created successfully!');
  console.log('   Email:', adminRecord.email);
  console.log('   DB ID:', adminRecord.id);
  console.log('   Clerk ID:', adminRecord.clerkId);
  console.log('\n🔐 Sign in at /admin/sign-in');
  console.log('   Email:', ADMIN_EMAIL);
  console.log('   Password: (as defined in this script)');
  console.log('\n⚠️  Change the password after first login via Clerk Dashboard.');

  await db.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  db.$disconnect();
  process.exit(1);
});
