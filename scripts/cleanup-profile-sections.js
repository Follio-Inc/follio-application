const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Checking for duplicate ProfileSection entries...\n');

  // Get all ProfileSections grouped by profile
  const sections = await prisma.profileSection.findMany({
    orderBy: [{ profileId: 'asc' }, { createdAt: 'asc' }],
  });

  // Group by profileId
  const byProfile = {};
  sections.forEach((s) => {
    if (!byProfile[s.profileId]) byProfile[s.profileId] = [];
    byProfile[s.profileId].push(s);
  });

  // Find and clean duplicates
  let totalDuplicates = 0;

  for (const [profileId, profileSections] of Object.entries(byProfile)) {
    // Group by type within this profile
    const byType = {};
    profileSections.forEach((s) => {
      if (!byType[s.type]) byType[s.type] = [];
      byType[s.type].push(s);
    });

    // Find types with duplicates
    const duplicateTypes = Object.entries(byType).filter(([type, secs]) => secs.length > 1);

    if (duplicateTypes.length > 0) {
      console.log(`Profile: ${profileId}`);

      for (const [type, secs] of duplicateTypes) {
        console.log(
          `  ${type}: ${secs.length} entries (keeping first, deleting ${secs.length - 1})`
        );

        // Keep the first one (oldest by createdAt), delete the rest
        const [keep, ...toDelete] = secs;

        for (const section of toDelete) {
          await prisma.profileSection.delete({
            where: { id: section.id },
          });
          totalDuplicates++;
          console.log(`    - Deleted: ${section.id}`);
        }
      }
    }
  }

  if (totalDuplicates === 0) {
    console.log('✓ No duplicate ProfileSection entries found!');
  } else {
    console.log(`\n✓ Cleaned up ${totalDuplicates} duplicate ProfileSection entries!`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
