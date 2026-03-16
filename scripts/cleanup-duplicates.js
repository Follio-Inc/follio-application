const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanupDuplicates() {
  console.log('Starting cleanup of duplicate records...\n');

  // Get all profiles
  const profiles = await prisma.profile.findMany({
    select: { id: true, handle: true },
  });

  for (const profile of profiles) {
    console.log(`\n=== Cleaning profile: ${profile.handle} (${profile.id}) ===`);

    // Clean Work Experiences
    const workExps = await prisma.workExperience.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'asc' },
    });

    const seenWorkKeys = new Set();
    const workToDelete = [];

    for (const exp of workExps) {
      const key = `${exp.company?.toLowerCase()}|${exp.role?.toLowerCase()}`;
      if (seenWorkKeys.has(key)) {
        workToDelete.push(exp.id);
      } else {
        seenWorkKeys.add(key);
      }
    }

    if (workToDelete.length > 0) {
      console.log(`  Deleting ${workToDelete.length} duplicate work experiences`);
      await prisma.workExperience.deleteMany({
        where: { id: { in: workToDelete } },
      });
    }

    // Clean Educations
    const educations = await prisma.education.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'asc' },
    });

    const seenEduKeys = new Set();
    const eduToDelete = [];

    for (const edu of educations) {
      const key = `${edu.institution?.toLowerCase()}|${edu.degree?.toLowerCase()}`;
      if (seenEduKeys.has(key)) {
        eduToDelete.push(edu.id);
      } else {
        seenEduKeys.add(key);
      }
    }

    if (eduToDelete.length > 0) {
      console.log(`  Deleting ${eduToDelete.length} duplicate educations`);
      await prisma.education.deleteMany({
        where: { id: { in: eduToDelete } },
      });
    }

    // Clean Projects
    const projects = await prisma.project.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'asc' },
    });

    const seenProjKeys = new Set();
    const projToDelete = [];

    for (const proj of projects) {
      const key = proj.title?.toLowerCase();
      if (seenProjKeys.has(key)) {
        projToDelete.push(proj.id);
      } else {
        seenProjKeys.add(key);
      }
    }

    if (projToDelete.length > 0) {
      console.log(`  Deleting ${projToDelete.length} duplicate projects`);
      await prisma.project.deleteMany({
        where: { id: { in: projToDelete } },
      });
    }

    // Clean Skills
    const skills = await prisma.skill.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'asc' },
    });

    const seenSkillKeys = new Set();
    const skillsToDelete = [];

    for (const skill of skills) {
      const key = skill.name?.toLowerCase();
      if (seenSkillKeys.has(key)) {
        skillsToDelete.push(skill.id);
      } else {
        seenSkillKeys.add(key);
      }
    }

    if (skillsToDelete.length > 0) {
      console.log(`  Deleting ${skillsToDelete.length} duplicate skills`);
      await prisma.skill.deleteMany({
        where: { id: { in: skillsToDelete } },
      });
    }
  }

  console.log('\n✓ Cleanup complete!');
}

cleanupDuplicates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
