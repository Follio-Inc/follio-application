const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Get all profiles
  const profiles = await prisma.profile.findMany();

  console.log(`Found ${profiles.length} profiles\n`);

  for (const profile of profiles) {
    // Check if CONTACT section exists
    const existingContact = await prisma.profileSection.findFirst({
      where: {
        profileId: profile.id,
        type: 'CONTACT',
      },
    });

    if (!existingContact) {
      // Get current sections to find max sortOrder
      const sections = await prisma.profileSection.findMany({
        where: { profileId: profile.id },
        orderBy: { sortOrder: 'asc' },
      });

      console.log(`Profile ${profile.handle}: Adding CONTACT section`);
      console.log(`  Current sections: ${sections.map((s) => s.type).join(', ')}`);

      // Insert CONTACT at position 1 (after BASIC_INFO which is at 0)
      // First, shift all existing sections' sortOrder by 1
      for (const section of sections) {
        if (section.sortOrder >= 1) {
          await prisma.profileSection.update({
            where: { id: section.id },
            data: { sortOrder: section.sortOrder + 1 },
          });
        }
      }

      // Create CONTACT section at position 1
      await prisma.profileSection.create({
        data: {
          profileId: profile.id,
          type: 'CONTACT',
          title: 'Contact',
          sortOrder: 1,
          isVisible: true,
        },
      });

      console.log('  ✓ CONTACT section added at position 1\n');
    } else {
      console.log(
        `Profile ${profile.handle}: CONTACT section already exists (sortOrder: ${existingContact.sortOrder})`
      );
    }
  }

  console.log('\nDone!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
