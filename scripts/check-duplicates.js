const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function run() {
  try {
    // Check profiles count first
    const profiles = await prisma.profile.findMany({
      select: { id: true, handle: true, firstName: true },
    });
    console.log('\n=== Profiles:', profiles.length, '===');
    profiles.forEach((p) => console.log('  -', p.id, '-', p.handle, '-', p.firstName));

    // Check work experiences
    const work = await prisma.workExperience.findMany({
      select: { id: true, company: true, role: true },
    });
    console.log('\n=== Work Experiences:', work.length, '===');
    work.forEach((w) => console.log('  -', w.company, '-', w.role));

    // Check educations
    const edu = await prisma.education.findMany({
      select: { id: true, institution: true, degree: true },
    });
    console.log('\n=== Educations:', edu.length, '===');
    edu.forEach((e) => console.log('  -', e.institution, '-', e.degree));

    // Check projects
    const proj = await prisma.project.findMany({
      select: { id: true, title: true },
    });
    console.log('\n=== Projects:', proj.length, '===');
    proj.forEach((p) => console.log('  -', p.title));

    // Check for duplicates by company+role
    const workDups = {};
    work.forEach((w) => {
      const key = `${w.company}|${w.role}`;
      workDups[key] = (workDups[key] || 0) + 1;
    });
    const hasDupsWork = Object.entries(workDups).filter(([k, v]) => v > 1);
    if (hasDupsWork.length > 0) {
      console.log('\n!!! DUPLICATE Work Experiences !!!');
      hasDupsWork.forEach(([k, v]) => console.log('  -', k, ':', v, 'times'));
    }

    // Check for duplicates by institution+degree
    const eduDups = {};
    edu.forEach((e) => {
      const key = `${e.institution}|${e.degree}`;
      eduDups[key] = (eduDups[key] || 0) + 1;
    });
    const hasDupsEdu = Object.entries(eduDups).filter(([k, v]) => v > 1);
    if (hasDupsEdu.length > 0) {
      console.log('\n!!! DUPLICATE Educations !!!');
      hasDupsEdu.forEach(([k, v]) => console.log('  -', k, ':', v, 'times'));
    }

    // Check for duplicates by title
    const projDups = {};
    proj.forEach((p) => {
      const key = p.title;
      projDups[key] = (projDups[key] || 0) + 1;
    });
    const hasDupsProj = Object.entries(projDups).filter(([k, v]) => v > 1);
    if (hasDupsProj.length > 0) {
      console.log('\n!!! DUPLICATE Projects !!!');
      hasDupsProj.forEach(([k, v]) => console.log('  -', k, ':', v, 'times'));
    }

    if (hasDupsWork.length === 0 && hasDupsEdu.length === 0 && hasDupsProj.length === 0) {
      console.log('\n✓ No duplicates found in database!');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
