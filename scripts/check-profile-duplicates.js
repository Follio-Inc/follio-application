const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function run() {
  try {
    // Get all profiles
    const profiles = await prisma.profile.findMany({
      select: { id: true, handle: true, firstName: true },
    });
    console.log('\n=== Profiles:', profiles.length, '===\n');

    let totalDuplicates = false;

    for (const profile of profiles) {
      // Check work experiences for THIS profile
      const work = await prisma.workExperience.findMany({
        where: { profileId: profile.id },
        select: { id: true, company: true, role: true },
      });

      // Check educations for THIS profile
      const edu = await prisma.education.findMany({
        where: { profileId: profile.id },
        select: { id: true, institution: true, degree: true },
      });

      // Check projects for THIS profile
      const proj = await prisma.project.findMany({
        where: { profileId: profile.id },
        select: { id: true, title: true },
      });

      // Check for duplicates within this profile
      const workDups = {};
      work.forEach((w) => {
        const key = `${w.company?.toLowerCase()}|${w.role?.toLowerCase()}`;
        workDups[key] = (workDups[key] || 0) + 1;
      });
      const hasDupsWork = Object.entries(workDups).filter(([k, v]) => v > 1);

      const eduDups = {};
      edu.forEach((e) => {
        const key = `${e.institution?.toLowerCase()}|${e.degree?.toLowerCase()}`;
        eduDups[key] = (eduDups[key] || 0) + 1;
      });
      const hasDupsEdu = Object.entries(eduDups).filter(([k, v]) => v > 1);

      const projDups = {};
      proj.forEach((p) => {
        const key = p.title?.toLowerCase();
        projDups[key] = (projDups[key] || 0) + 1;
      });
      const hasDupsProj = Object.entries(projDups).filter(([k, v]) => v > 1);

      const hasDups = hasDupsWork.length > 0 || hasDupsEdu.length > 0 || hasDupsProj.length > 0;

      if (hasDups) {
        totalDuplicates = true;
        console.log(`\nProfile: ${profile.handle} (${profile.firstName})`);
        console.log(`  Work: ${work.length}, Education: ${edu.length}, Projects: ${proj.length}`);

        if (hasDupsWork.length > 0) {
          console.log('  !!! DUPLICATE Work Experiences !!!');
          hasDupsWork.forEach(([k, v]) => console.log('    -', k, ':', v, 'times'));
        }

        if (hasDupsEdu.length > 0) {
          console.log('  !!! DUPLICATE Educations !!!');
          hasDupsEdu.forEach(([k, v]) => console.log('    -', k, ':', v, 'times'));
        }

        if (hasDupsProj.length > 0) {
          console.log('  !!! DUPLICATE Projects !!!');
          hasDupsProj.forEach(([k, v]) => console.log('    -', k, ':', v, 'times'));
        }
      }
    }

    if (!totalDuplicates) {
      console.log('✓ No duplicates found within any profile!');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
