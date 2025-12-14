/**
 * Prisma Seed Script
 * Creates demo profile data for development and testing
 */

import { PrismaClient, ProfileStatus, DataSource, LinkType, SkillLevel, EmploymentType, LocationType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo user
  const user = await prisma.user.upsert({
    where: { email: 'demo@follio.dev' },
    update: {},
    create: {
      clerkId: 'demo_clerk_id_12345',
      email: 'demo@follio.dev',
    },
  });

  console.log('✓ Created demo user:', user.email);

  // Create demo profile
  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      handle: 'alexchen',
      status: ProfileStatus.PUBLIC,
      firstName: 'Alex',
      firstNameSource: DataSource.MANUAL,
      lastName: 'Chen',
      lastNameSource: DataSource.MANUAL,
      headline: 'Senior Full-Stack Engineer • Building Products That Scale',
      headlineSource: DataSource.MANUAL,
      summary: `Passionate software engineer with 8+ years of experience building web applications and distributed systems. I specialize in TypeScript, React, and Node.js, with a focus on creating elegant solutions to complex problems.

Currently leading frontend architecture at a Series B startup, where I've helped scale our platform from 10K to 500K users. Previously worked at Google on Chrome DevTools.

I love open source, technical writing, and mentoring junior developers. When I'm not coding, you'll find me hiking trails or experimenting with espresso.`,
      summarySource: DataSource.MANUAL,
      avatarUrl: 'https://avatars.githubusercontent.com/u/1234567',
      location: 'San Francisco, CA',
      locationSource: DataSource.MANUAL,
      publishedAt: new Date(),
    },
  });

  console.log('✓ Created demo profile:', profile.handle);

  // Contact Info
  await prisma.contactInfo.upsert({
    where: { profileId: profile.id },
    update: {},
    create: {
      profileId: profile.id,
      email: 'alex@example.com',
      emailSource: DataSource.MANUAL,
      emailPublic: true,
      website: 'https://alexchen.dev',
      websiteSource: DataSource.MANUAL,
    },
  });

  console.log('✓ Created contact info');

  // Links
  await prisma.link.createMany({
    data: [
      {
        profileId: profile.id,
        type: LinkType.GITHUB,
        url: 'https://github.com/alexchen',
        source: DataSource.GITHUB,
        sortOrder: 0,
      },
      {
        profileId: profile.id,
        type: LinkType.LINKEDIN,
        url: 'https://linkedin.com/in/alexchen',
        source: DataSource.MANUAL,
        sortOrder: 1,
      },
      {
        profileId: profile.id,
        type: LinkType.TWITTER,
        url: 'https://twitter.com/alexchendev',
        source: DataSource.MANUAL,
        sortOrder: 2,
      },
      {
        profileId: profile.id,
        type: LinkType.BLOG,
        url: 'https://blog.alexchen.dev',
        label: 'Technical Blog',
        source: DataSource.MANUAL,
        sortOrder: 3,
      },
    ],
    skipDuplicates: true,
  });

  console.log('✓ Created links');

  // Work Experience
  await prisma.workExperience.createMany({
    data: [
      {
        profileId: profile.id,
        company: 'TechScale Inc.',
        companyUrl: 'https://techscale.io',
        role: 'Senior Frontend Engineer',
        location: 'San Francisco, CA',
        locationType: LocationType.HYBRID,
        employmentType: EmploymentType.FULL_TIME,
        startDate: new Date('2022-03-01'),
        isCurrent: true,
        description: 'Leading frontend architecture and driving technical decisions for a B2B SaaS platform.',
        bullets: [
          'Architected and implemented a new design system using React, TypeScript, and Tailwind CSS, reducing UI development time by 40%',
          'Led migration from REST to GraphQL, improving data fetching efficiency and reducing API calls by 60%',
          'Built real-time collaboration features using WebSockets, enabling 50+ concurrent users per document',
          'Mentored team of 4 junior developers, conducting code reviews and establishing best practices',
          'Reduced bundle size by 45% through code splitting and lazy loading strategies',
        ],
        metrics: JSON.stringify({ teamSize: 12, usersScaled: '10K to 500K', performanceImprovement: '45%' }),
        tags: ['React', 'TypeScript', 'GraphQL', 'WebSockets', 'Tailwind CSS'],
        source: DataSource.MANUAL,
        sortOrder: 0,
      },
      {
        profileId: profile.id,
        company: 'Google',
        companyUrl: 'https://google.com',
        role: 'Software Engineer',
        location: 'Mountain View, CA',
        locationType: LocationType.ONSITE,
        employmentType: EmploymentType.FULL_TIME,
        startDate: new Date('2019-06-01'),
        endDate: new Date('2022-02-28'),
        isCurrent: false,
        description: 'Worked on Chrome DevTools, improving developer experience for millions of web developers.',
        bullets: [
          'Developed new Performance panel features used by 2M+ developers monthly',
          'Implemented accessibility improvements in DevTools, earning internal accessibility award',
          'Contributed to open-source Lighthouse project with 25K+ GitHub stars',
          'Collaborated with Chrome team on new Web Vitals metrics and reporting',
        ],
        metrics: JSON.stringify({ monthlyUsers: '2M+', projectStars: '25K+' }),
        tags: ['JavaScript', 'Chrome', 'DevTools', 'Performance', 'Accessibility'],
        source: DataSource.MANUAL,
        sortOrder: 1,
      },
      {
        profileId: profile.id,
        company: 'StartupXYZ',
        companyUrl: 'https://startupxyz.com',
        role: 'Full Stack Developer',
        location: 'San Francisco, CA',
        locationType: LocationType.ONSITE,
        employmentType: EmploymentType.FULL_TIME,
        startDate: new Date('2017-01-15'),
        endDate: new Date('2019-05-31'),
        isCurrent: false,
        description: 'Early engineer at a YC-backed startup building developer tools.',
        bullets: [
          'Built core product features from scratch using Node.js and React',
          'Designed and implemented RESTful APIs serving 100K+ daily requests',
          'Set up CI/CD pipelines and improved deployment frequency from weekly to daily',
          'Implemented automated testing, achieving 85% code coverage',
        ],
        tags: ['Node.js', 'React', 'PostgreSQL', 'AWS', 'Docker'],
        source: DataSource.MANUAL,
        sortOrder: 2,
      },
    ],
    skipDuplicates: true,
  });

  console.log('✓ Created work experiences');

  // Education
  await prisma.education.createMany({
    data: [
      {
        profileId: profile.id,
        institution: 'Stanford University',
        institutionUrl: 'https://stanford.edu',
        degree: 'Master of Science',
        fieldOfStudy: 'Computer Science',
        location: 'Stanford, CA',
        startDate: new Date('2015-09-01'),
        endDate: new Date('2017-06-15'),
        gpa: '3.9',
        description: 'Focused on distributed systems and machine learning.',
        activities: ['Teaching Assistant for CS 101', 'Stanford ACM Club'],
        honors: ['Dean\'s List', 'Graduate Fellowship'],
        source: DataSource.MANUAL,
        sortOrder: 0,
      },
      {
        profileId: profile.id,
        institution: 'UC Berkeley',
        institutionUrl: 'https://berkeley.edu',
        degree: 'Bachelor of Science',
        fieldOfStudy: 'Electrical Engineering & Computer Science',
        location: 'Berkeley, CA',
        startDate: new Date('2011-08-01'),
        endDate: new Date('2015-05-15'),
        gpa: '3.8',
        activities: ['Berkeley CSUA', 'Hackathon Club'],
        honors: ['Cum Laude'],
        source: DataSource.MANUAL,
        sortOrder: 1,
      },
    ],
    skipDuplicates: true,
  });

  console.log('✓ Created education');

  // Skill Groups
  const frontendGroup = await prisma.skillGroup.create({
    data: {
      profileId: profile.id,
      name: 'Frontend',
      sortOrder: 0,
    },
  });

  const backendGroup = await prisma.skillGroup.create({
    data: {
      profileId: profile.id,
      name: 'Backend',
      sortOrder: 1,
    },
  });

  const toolsGroup = await prisma.skillGroup.create({
    data: {
      profileId: profile.id,
      name: 'Tools & DevOps',
      sortOrder: 2,
    },
  });

  console.log('✓ Created skill groups');

  // Skills
  await prisma.skill.createMany({
    data: [
      // Frontend
      { profileId: profile.id, name: 'TypeScript', level: SkillLevel.EXPERT, yearsOfExp: 6, groupId: frontendGroup.id, source: DataSource.MANUAL, sortOrder: 0 },
      { profileId: profile.id, name: 'React', level: SkillLevel.EXPERT, yearsOfExp: 7, groupId: frontendGroup.id, source: DataSource.MANUAL, sortOrder: 1 },
      { profileId: profile.id, name: 'Next.js', level: SkillLevel.ADVANCED, yearsOfExp: 4, groupId: frontendGroup.id, source: DataSource.MANUAL, sortOrder: 2 },
      { profileId: profile.id, name: 'Tailwind CSS', level: SkillLevel.EXPERT, yearsOfExp: 3, groupId: frontendGroup.id, source: DataSource.MANUAL, sortOrder: 3 },
      { profileId: profile.id, name: 'GraphQL', level: SkillLevel.ADVANCED, yearsOfExp: 4, groupId: frontendGroup.id, source: DataSource.MANUAL, sortOrder: 4 },
      // Backend
      { profileId: profile.id, name: 'Node.js', level: SkillLevel.EXPERT, yearsOfExp: 8, groupId: backendGroup.id, source: DataSource.MANUAL, sortOrder: 0 },
      { profileId: profile.id, name: 'PostgreSQL', level: SkillLevel.ADVANCED, yearsOfExp: 6, groupId: backendGroup.id, source: DataSource.MANUAL, sortOrder: 1 },
      { profileId: profile.id, name: 'Python', level: SkillLevel.INTERMEDIATE, yearsOfExp: 4, groupId: backendGroup.id, source: DataSource.MANUAL, sortOrder: 2 },
      { profileId: profile.id, name: 'Redis', level: SkillLevel.ADVANCED, yearsOfExp: 5, groupId: backendGroup.id, source: DataSource.MANUAL, sortOrder: 3 },
      // Tools
      { profileId: profile.id, name: 'Docker', level: SkillLevel.ADVANCED, yearsOfExp: 5, groupId: toolsGroup.id, source: DataSource.MANUAL, sortOrder: 0 },
      { profileId: profile.id, name: 'AWS', level: SkillLevel.ADVANCED, yearsOfExp: 5, groupId: toolsGroup.id, source: DataSource.MANUAL, sortOrder: 1 },
      { profileId: profile.id, name: 'Git', level: SkillLevel.EXPERT, yearsOfExp: 8, groupId: toolsGroup.id, source: DataSource.MANUAL, sortOrder: 2 },
      { profileId: profile.id, name: 'CI/CD', level: SkillLevel.ADVANCED, yearsOfExp: 5, groupId: toolsGroup.id, source: DataSource.MANUAL, sortOrder: 3 },
    ],
    skipDuplicates: true,
  });

  console.log('✓ Created skills');

  // Projects
  await prisma.project.createMany({
    data: [
      {
        profileId: profile.id,
        title: 'DevDash',
        description: 'An open-source developer dashboard that aggregates GitHub activity, CI/CD status, and project metrics in one beautiful interface. Built with Next.js and real-time WebSocket updates.',
        shortDesc: 'Developer productivity dashboard with real-time updates',
        url: 'https://devdash.dev',
        repoUrl: 'https://github.com/alexchen/devdash',
        imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800',
        techStack: ['Next.js', 'TypeScript', 'Prisma', 'WebSockets', 'Tailwind CSS'],
        highlights: ['2.5K GitHub stars', 'Featured on Hacker News', '500+ daily active users'],
        githubStars: 2500,
        githubForks: 180,
        githubLanguage: 'TypeScript',
        githubTopics: ['dashboard', 'developer-tools', 'nextjs', 'open-source'],
        startDate: new Date('2023-01-01'),
        isCurrent: true,
        featured: true,
        source: DataSource.GITHUB,
        sortOrder: 0,
      },
      {
        profileId: profile.id,
        title: 'CodeReview AI',
        description: 'An AI-powered code review assistant that integrates with GitHub PRs to provide intelligent suggestions and catch potential bugs before merge.',
        shortDesc: 'AI code review assistant for GitHub PRs',
        url: 'https://codereview-ai.com',
        repoUrl: 'https://github.com/alexchen/codereview-ai',
        techStack: ['Python', 'FastAPI', 'OpenAI', 'GitHub Actions'],
        highlights: ['Processes 1000+ PRs daily', 'Reduced review time by 50%', 'Enterprise customers'],
        githubStars: 850,
        githubForks: 95,
        githubLanguage: 'Python',
        startDate: new Date('2023-06-01'),
        isCurrent: true,
        featured: true,
        source: DataSource.GITHUB,
        sortOrder: 1,
      },
      {
        profileId: profile.id,
        title: 'React Component Library',
        description: 'A comprehensive React component library with 50+ accessible, customizable components. Built with TypeScript and styled with CSS-in-JS for maximum flexibility.',
        shortDesc: 'Accessible React component library',
        repoUrl: 'https://github.com/alexchen/react-components',
        techStack: ['React', 'TypeScript', 'Storybook', 'Jest', 'CSS-in-JS'],
        highlights: ['50+ components', '100% TypeScript', 'Full accessibility support', 'Extensive documentation'],
        githubStars: 450,
        githubForks: 60,
        githubLanguage: 'TypeScript',
        startDate: new Date('2022-03-01'),
        endDate: new Date('2023-01-01'),
        featured: false,
        source: DataSource.GITHUB,
        sortOrder: 2,
      },
    ],
    skipDuplicates: true,
  });

  console.log('✓ Created projects');

  // Awards
  await prisma.award.createMany({
    data: [
      {
        profileId: profile.id,
        title: 'Google Peer Bonus Award',
        issuer: 'Google',
        date: new Date('2021-06-01'),
        description: 'Recognized for exceptional contributions to Chrome DevTools accessibility features.',
        source: DataSource.MANUAL,
        sortOrder: 0,
      },
      {
        profileId: profile.id,
        title: 'Hackathon Winner - TechCrunch Disrupt',
        issuer: 'TechCrunch',
        date: new Date('2016-09-15'),
        description: 'First place for building an AI-powered accessibility tool in 24 hours.',
        url: 'https://techcrunch.com/hackathon-2016',
        source: DataSource.MANUAL,
        sortOrder: 1,
      },
    ],
    skipDuplicates: true,
  });

  console.log('✓ Created awards');

  // Certifications
  await prisma.certification.createMany({
    data: [
      {
        profileId: profile.id,
        name: 'AWS Solutions Architect - Professional',
        issuer: 'Amazon Web Services',
        credentialId: 'AWS-SAP-2023-12345',
        credentialUrl: 'https://aws.amazon.com/verify/credential',
        issueDate: new Date('2023-03-15'),
        expirationDate: new Date('2026-03-15'),
        source: DataSource.MANUAL,
        sortOrder: 0,
      },
      {
        profileId: profile.id,
        name: 'Google Cloud Professional Developer',
        issuer: 'Google Cloud',
        credentialId: 'GCP-PD-2022-67890',
        issueDate: new Date('2022-08-01'),
        expirationDate: new Date('2024-08-01'),
        source: DataSource.MANUAL,
        sortOrder: 1,
      },
    ],
    skipDuplicates: true,
  });

  console.log('✓ Created certifications');

  console.log('\n✅ Database seeded successfully!');
  console.log(`\nDemo profile available at: /u/${profile.handle}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
