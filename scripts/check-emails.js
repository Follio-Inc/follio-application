const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Get users with profiles and contact info
  const users = await prisma.user.findMany({
    where: {
      profile: { isNot: null },
    },
    include: {
      profile: {
        include: {
          contactInfo: true,
        },
      },
    },
    take: 10,
  });

  console.log('Email Setup Summary:\n');
  console.log('='.repeat(80));

  for (const user of users) {
    const signupEmail = user.email;
    const primaryEmail = user.profile?.contactInfo?.email;
    const emailSource = user.profile?.contactInfo?.emailSource;
    const additionalEmails = user.profile?.contactInfo?.additionalEmails || [];

    const isPrimaryMatchingSignup = primaryEmail?.toLowerCase() === signupEmail.toLowerCase();

    console.log(`\nProfile: ${user.profile?.handle}`);
    console.log(`  Signup Email:    ${signupEmail}`);
    console.log(`  Primary Email:   ${primaryEmail || 'NOT SET'}`);
    console.log(`  Email Source:    ${emailSource || 'N/A'}`);
    console.log(`  Match:           ${isPrimaryMatchingSignup ? '✓ YES' : '✗ NO'}`);
    console.log(`  Additional:      ${JSON.stringify(additionalEmails)}`);
  }

  console.log('\n' + '='.repeat(80));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
