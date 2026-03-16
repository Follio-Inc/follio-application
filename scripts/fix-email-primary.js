const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Fixing email setup: signup email as primary, others as additional...\n');

  // Get all users with their profiles and contact info
  const users = await prisma.user.findMany({
    include: {
      profile: {
        include: {
          contactInfo: true,
        },
      },
    },
  });

  console.log(`Found ${users.length} users\n`);

  for (const user of users) {
    if (!user.profile) {
      console.log(`User ${user.email}: No profile, skipping`);
      continue;
    }

    const contactInfo = user.profile.contactInfo;
    const signupEmail = user.email; // This is always the Clerk signup email

    if (!contactInfo) {
      // Create contact info with signup email as primary
      console.log(`User ${user.email}: Creating ContactInfo with signup email as primary`);
      await prisma.contactInfo.create({
        data: {
          profileId: user.profile.id,
          email: signupEmail,
          emailSource: 'MANUAL',
          emailPublic: false,
        },
      });
      continue;
    }

    // Parse existing additional emails
    let additionalEmails = [];
    if (contactInfo.additionalEmails) {
      try {
        if (Array.isArray(contactInfo.additionalEmails)) {
          additionalEmails = contactInfo.additionalEmails;
        } else if (typeof contactInfo.additionalEmails === 'string') {
          additionalEmails = JSON.parse(contactInfo.additionalEmails);
        }
      } catch {
        additionalEmails = [];
      }
    }

    const currentPrimaryEmail = contactInfo.email;
    const currentSource = contactInfo.emailSource;

    // Check if signup email is already primary
    if (currentPrimaryEmail?.toLowerCase() === signupEmail.toLowerCase()) {
      console.log(`User ${user.email}: Signup email already primary ✓`);
      continue;
    }

    // If current primary is different from signup, move it to additional
    if (currentPrimaryEmail && currentPrimaryEmail.toLowerCase() !== signupEmail.toLowerCase()) {
      // Check if this email is not already in additionalEmails
      const alreadyExists = additionalEmails.some(
        (e) => e.email?.toLowerCase() === currentPrimaryEmail.toLowerCase()
      );

      if (!alreadyExists) {
        additionalEmails.push({
          email: currentPrimaryEmail,
          source: currentSource || 'MANUAL',
        });
        console.log(`  - Moved "${currentPrimaryEmail}" (${currentSource}) to additional emails`);
      }
    }

    // Also check if signup email is somehow in additional emails, remove it
    additionalEmails = additionalEmails.filter(
      (e) => e.email?.toLowerCase() !== signupEmail.toLowerCase()
    );

    // Update contact info
    console.log(`User ${user.email}: Setting signup email as primary`);
    console.log(`  - Primary: ${signupEmail}`);
    console.log(`  - Additional: ${additionalEmails.map((e) => e.email).join(', ') || 'none'}`);

    await prisma.contactInfo.update({
      where: { id: contactInfo.id },
      data: {
        email: signupEmail,
        emailSource: 'MANUAL',
        additionalEmails: additionalEmails.length > 0 ? additionalEmails : [],
      },
    });
  }

  console.log('\n✓ Done!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
