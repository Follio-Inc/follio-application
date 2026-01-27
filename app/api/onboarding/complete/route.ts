import { db } from '@/lib/db';
import { parseDateFlexible } from '@/lib/utils';
import type { NormalizedImportResult } from '@/services/import/types';
import { auth, currentUser } from '@clerk/nextjs/server';
import type { DataSource, Profile, User } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

// Helper to safely cast string to DataSource enum
const toDataSource = (source: string | undefined): DataSource => {
  return (source || 'MANUAL') as DataSource;
};

/**
 * Safely parse a date string using the shared flexible parser.
 * Returns null for invalid dates.
 */
const safeParseDate = (dateStr: string | undefined | null): Date | null => {
  return parseDateFlexible(dateStr);
};

interface ManualLinkInput {
  url: string;
  label: string;
}

// Reviewed data from the step-by-step review flow
interface ReviewedData {
  profile: {
    firstName?: string;
    lastName?: string;
    headline?: string;
    summary?: string;
    location?: string;
    avatarUrl?: string;
  };
  experiences: Array<{
    company: string;
    role: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
    description?: string;
    bullets?: string[];
  }>;
  educations: Array<{
    institution: string;
    degree?: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
  }>;
  skills: string[];
  links: Array<{
    type: string;
    url: string;
    label?: string;
  }>;
  contactInfo?: {
    email?: string;
    phone?: string;
  };
}

/**
 * POST /api/onboarding/complete
 * Complete onboarding - create/update profile with imported data
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    console.log('[Onboarding Complete] Starting for userId:', userId);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    console.log('[Onboarding Complete] Request body keys:', Object.keys(body));

    const {
      importedData,
      reviewedData,
      firstName: providedFirstName,
      lastName: providedLastName,
      handle: providedHandle,
      manualLinks,
    } = body as {
      importedData?: Record<string, NormalizedImportResult | undefined>;
      reviewedData?: ReviewedData;
      firstName?: string;
      lastName?: string;
      handle?: string;
      manualLinks?: ManualLinkInput[];
    };

    console.log('[Onboarding Complete] Has reviewedData:', !!reviewedData);
    console.log('[Onboarding Complete] Has importedData:', !!importedData);
    console.log('[Onboarding Complete] providedFirstName:', providedFirstName);
    console.log('[Onboarding Complete] providedHandle:', providedHandle);

    // Get or create user
    let user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user) {
      const clerkUser = await currentUser();
      if (!clerkUser?.emailAddresses?.[0]?.emailAddress) {
        return NextResponse.json({ error: 'Unable to get user details' }, { status: 400 });
      }

      user = await db.user.create({
        data: {
          clerkId: userId,
          email: clerkUser.emailAddresses[0].emailAddress,
        },
        include: { profile: true },
      });
    }

    // If we have reviewedData from the review flow, use it directly
    if (reviewedData) {
      return await handleReviewedData(
        user,
        reviewedData,
        providedHandle,
        providedFirstName,
        providedLastName
      );
    }

    // Otherwise, merge imported data from the old flow
    console.log(
      '[Onboarding Complete] importedData keys:',
      importedData ? Object.keys(importedData) : 'none'
    );
    console.log(
      '[Onboarding Complete] Calling mergeImportedData with:',
      JSON.stringify(importedData || {}, null, 2)?.substring(0, 1000)
    );
    const mergedProfile = mergeImportedData(importedData || {});
    console.log(
      '[Onboarding Complete] Merged profile:',
      JSON.stringify(mergedProfile, null, 2)?.substring(0, 1000)
    );

    // Use provided handle or generate one
    let handle =
      providedHandle ||
      generateHandle(
        providedFirstName || mergedProfile.firstName,
        providedLastName || mergedProfile.lastName,
        user.email
      );

    // Check if provided handle is available
    if (providedHandle) {
      const existingHandle = await db.profile.findUnique({
        where: { handle: providedHandle },
        select: { id: true },
      });
      if (existingHandle && (!user.profile || existingHandle.id !== user.profile.id)) {
        return NextResponse.json(
          { error: 'Handle is already taken', message: 'Please choose a different handle' },
          { status: 409 }
        );
      }
    } else {
      // Ensure generated handle is unique
      handle = await ensureUniqueHandle(handle, user.profile?.id);
    }

    // Use provided name or fall back to merged data
    const finalFirstName = providedFirstName || mergedProfile.firstName || 'New';
    const finalLastName = providedLastName || mergedProfile.lastName;

    // Create or update profile
    if (!user.profile) {
      // Create new profile
      const profile = await db.profile.create({
        data: {
          userId: user.id,
          handle,
          firstName: finalFirstName,
          lastName: finalLastName,
          headline: mergedProfile.headline,
          summary: mergedProfile.summary,
          location: mergedProfile.location,
          avatarUrl: mergedProfile.avatarUrl,
          status: 'PUBLIC', // Make profile public by default
          // TODO: Uncomment after running migration
          // isAutoGenerated: true,
          // autoGeneratedAt: new Date(),
          // Set sources for provenance
          // firstNameSource: toDataSource(mergedProfile.firstNameSource),
          // lastNameSource: toDataSource(mergedProfile.lastNameSource),
          // headlineSource: toDataSource(mergedProfile.headlineSource),
          // summarySource: toDataSource(mergedProfile.summarySource),
          // locationSource: toDataSource(mergedProfile.locationSource),
          // avatarUrlSource: toDataSource(mergedProfile.avatarUrlSource),
        },
      });

      // Create contact info
      await db.contactInfo.create({
        data: {
          profileId: profile.id,
          email: mergedProfile.email,
          emailPublic: false,
          phone: mergedProfile.phone,
          phonePublic: false,
          website: mergedProfile.website,
        },
      });

      // Create skills
      if (mergedProfile.skills?.length) {
        await db.skill.createMany({
          data: mergedProfile.skills.map((skill, index) => ({
            profileId: profile.id,
            name: skill.name,
            source: toDataSource(skill.source),
            sortOrder: index,
          })),
          skipDuplicates: true,
        });
      }

      // Create projects
      if (mergedProfile.projects?.length) {
        await db.project.createMany({
          data: mergedProfile.projects.map((project, index) => ({
            profileId: profile.id,
            title: project.title,
            description: project.description,
            shortDesc: project.shortDesc,
            url: project.url,
            repoUrl: project.repoUrl,
            techStack: project.techStack || [],
            featured: project.featured || index < 3,
            source: toDataSource(project.source),
            sortOrder: index,
            githubStars: project.ghStars,
            githubForks: project.ghForks,
            githubLanguage: project.ghLanguage,
          })),
        });
      }

      // Create work experiences
      if (mergedProfile.experiences?.length) {
        await db.workExperience.createMany({
          data: mergedProfile.experiences.map((exp, index) => ({
            profileId: profile.id,
            company: exp.company,
            role: exp.role,
            location: exp.location,
            startDate: exp.startDate ? new Date(exp.startDate) : new Date(),
            endDate: exp.endDate ? new Date(exp.endDate) : null,
            isCurrent: exp.isCurrent || false,
            description: exp.description,
            bullets: exp.bullets || [],
            tags: exp.tags || [],
            source: toDataSource(exp.source),
            sortOrder: index,
          })),
        });
      }

      // Create education
      if (mergedProfile.educations?.length) {
        await db.education.createMany({
          data: mergedProfile.educations.map((edu, index) => ({
            profileId: profile.id,
            institution: edu.institution,
            degree: edu.degree,
            fieldOfStudy: edu.fieldOfStudy,
            startDate: edu.startDate ? new Date(edu.startDate) : null,
            endDate: edu.endDate ? new Date(edu.endDate) : null,
            isCurrent: edu.isCurrent || false,
            gpa: edu.gpa,
            source: toDataSource(edu.source),
            sortOrder: index,
          })),
        });
      }

      // Create links
      if (mergedProfile.links?.length) {
        await db.link.createMany({
          data: mergedProfile.links.map((link, index) => ({
            profileId: profile.id,
            type: mapLinkType(link.type),
            url: link.url,
            label: link.label,
            source: toDataSource(link.source),
            sortOrder: index,
          })),
        });
      }

      // Add manual links (deduplicate against imported links)
      if (manualLinks?.length) {
        const existingUrls = new Set((mergedProfile.links || []).map((l) => l.url.toLowerCase()));
        const newManualLinks = manualLinks.filter(
          (l) => l.url && !existingUrls.has(l.url.toLowerCase())
        );

        if (newManualLinks.length) {
          const startOrder = mergedProfile.links?.length || 0;
          await db.link.createMany({
            data: newManualLinks.map((link, index) => ({
              profileId: profile.id,
              type: 'OTHER' as const,
              url: link.url,
              label: link.label,
              source: 'MANUAL' as const,
              sortOrder: startOrder + index,
            })),
          });
        }
      }
    } else {
      // Update existing profile (merge mode)
      await db.profile.update({
        where: { id: user.profile.id },
        data: {
          firstName: mergedProfile.firstName || user.profile.firstName,
          lastName: mergedProfile.lastName || user.profile.lastName,
          headline: mergedProfile.headline || user.profile.headline,
          summary: mergedProfile.summary || user.profile.summary,
          location: mergedProfile.location || user.profile.location,
          avatarUrl: mergedProfile.avatarUrl || user.profile.avatarUrl,
          // TODO: Uncomment after running migration
          // isAutoGenerated: true,
          // autoGeneratedAt: new Date(),
        },
      });

      // Merge skills (avoid duplicates)
      if (mergedProfile.skills?.length) {
        for (const skill of mergedProfile.skills) {
          await db.skill.upsert({
            where: {
              profileId_name: {
                profileId: user.profile.id,
                name: skill.name,
              },
            },
            create: {
              profileId: user.profile.id,
              name: skill.name,
              source: toDataSource(skill.source),
              sortOrder: 0,
            },
            update: {}, // Don't update if exists
          });
        }
      }

      // Add new projects (dedupe by repoUrl or title)
      if (mergedProfile.projects?.length) {
        const existingProjects = await db.project.findMany({
          where: { profileId: user.profile.id },
          select: { title: true, repoUrl: true },
        });

        const existingKeys = new Set(
          existingProjects.map((p) => p.repoUrl || p.title.toLowerCase())
        );

        const newProjects = mergedProfile.projects.filter(
          (p) => !existingKeys.has(p.repoUrl || p.title.toLowerCase())
        );

        if (newProjects.length) {
          await db.project.createMany({
            data: newProjects.map((project, index) => ({
              profileId: user.profile!.id,
              title: project.title,
              description: project.description,
              shortDesc: project.shortDesc,
              url: project.url,
              repoUrl: project.repoUrl,
              techStack: project.techStack || [],
              featured: project.featured || false,
              source: toDataSource(project.source),
              sortOrder: existingProjects.length + index,
              githubStars: project.ghStars,
              githubForks: project.ghForks,
              githubLanguage: project.ghLanguage,
            })),
          });
        }
      }
    }

    // TODO: Uncomment after running migration
    // Mark onboarding as completed
    // await db.user.update({
    //   where: { id: user.id },
    //   data: {
    //     onboardingCompleted: true,
    //     onboardingCompletedAt: new Date(),
    //   },
    // });

    return NextResponse.json({
      success: true,
      handle,
      message: 'Profile created successfully',
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Handle reviewed data from the step-by-step review flow
 * This data has already been verified/edited by the user
 */
async function handleReviewedData(
  user: User & { profile: Profile | null },
  reviewedData: ReviewedData,
  providedHandle?: string,
  providedFirstName?: string,
  providedLastName?: string
) {
  console.log('[handleReviewedData] Starting with reviewed data');
  console.log('[handleReviewedData] Experiences count:', reviewedData.experiences?.length || 0);
  console.log('[handleReviewedData] Educations count:', reviewedData.educations?.length || 0);
  console.log('[handleReviewedData] Skills count:', reviewedData.skills?.length || 0);
  console.log('[handleReviewedData] Links count:', reviewedData.links?.length || 0);

  // Generate or validate handle
  let handle =
    providedHandle ||
    generateHandle(
      providedFirstName || reviewedData.profile.firstName,
      providedLastName || reviewedData.profile.lastName,
      user.email
    );

  // Check if provided handle is available
  if (providedHandle) {
    const existingHandle = await db.profile.findUnique({
      where: { handle: providedHandle },
      select: { id: true },
    });
    if (existingHandle && (!user.profile || existingHandle.id !== user.profile.id)) {
      return NextResponse.json(
        { error: 'Handle is already taken', message: 'Please choose a different handle' },
        { status: 409 }
      );
    }
  } else {
    handle = await ensureUniqueHandle(handle, user.profile?.id);
  }

  const finalFirstName = providedFirstName || reviewedData.profile.firstName || 'New';
  const finalLastName = providedLastName || reviewedData.profile.lastName;

  // Create or update profile
  let profileId: string;

  if (!user.profile) {
    // Create new profile
    const profile = await db.profile.create({
      data: {
        userId: user.id,
        handle,
        firstName: finalFirstName,
        lastName: finalLastName,
        headline: reviewedData.profile.headline,
        summary: reviewedData.profile.summary,
        location: reviewedData.profile.location,
        avatarUrl: reviewedData.profile.avatarUrl,
        status: 'PUBLIC',
      },
    });
    profileId = profile.id;
    console.log('[handleReviewedData] Created new profile:', profileId);
  } else {
    // Update existing profile
    await db.profile.update({
      where: { id: user.profile.id },
      data: {
        firstName: finalFirstName,
        lastName: finalLastName,
        headline: reviewedData.profile.headline || user.profile.headline,
        summary: reviewedData.profile.summary || user.profile.summary,
        location: reviewedData.profile.location || user.profile.location,
        avatarUrl: reviewedData.profile.avatarUrl || user.profile.avatarUrl,
      },
    });
    profileId = user.profile.id;
    console.log('[handleReviewedData] Updated existing profile:', profileId);
  }

  // Create contact info if provided
  if (reviewedData.contactInfo?.email || reviewedData.contactInfo?.phone) {
    await db.contactInfo.upsert({
      where: { profileId },
      create: {
        profileId,
        email: reviewedData.contactInfo.email,
        emailPublic: false,
        phone: reviewedData.contactInfo.phone,
        phonePublic: false,
      },
      update: {
        email: reviewedData.contactInfo.email,
        phone: reviewedData.contactInfo.phone,
      },
    });
  }

  // Create skills
  if (reviewedData.skills?.length) {
    console.log('[handleReviewedData] Creating skills:', reviewedData.skills);
    await db.skill.createMany({
      data: reviewedData.skills.map((skill, index) => ({
        profileId,
        name: skill,
        source: 'RESUME' as const,
        sortOrder: index,
      })),
      skipDuplicates: true,
    });
  }

  // Create work experiences
  if (reviewedData.experiences?.length) {
    console.log('[handleReviewedData] Creating experiences:', reviewedData.experiences.length);
    for (const [index, exp] of reviewedData.experiences.entries()) {
      const startDate = safeParseDate(exp.startDate);
      const endDate = safeParseDate(exp.endDate);

      await db.workExperience.create({
        data: {
          profileId,
          company: exp.company || 'Unknown Company',
          role: exp.role || 'Unknown Role',
          location: exp.location,
          startDate: startDate || new Date(), // Default to now if invalid
          endDate: endDate,
          isCurrent: exp.isCurrent || !endDate,
          description: exp.description,
          bullets: exp.bullets || [],
          tags: [],
          source: 'RESUME' as const,
          sortOrder: index,
        },
      });
    }
    console.log('[handleReviewedData] Created all experiences');
  }

  // Create education
  if (reviewedData.educations?.length) {
    console.log('[handleReviewedData] Creating educations:', reviewedData.educations.length);
    for (const [index, edu] of reviewedData.educations.entries()) {
      const startDate = safeParseDate(edu.startDate);
      const endDate = safeParseDate(edu.endDate);

      await db.education.create({
        data: {
          profileId,
          institution: edu.institution || 'Unknown Institution',
          degree: edu.degree,
          fieldOfStudy: edu.fieldOfStudy,
          startDate: startDate,
          endDate: endDate,
          isCurrent: false,
          gpa: edu.gpa,
          source: 'RESUME' as const,
          sortOrder: index,
        },
      });
    }
    console.log('[handleReviewedData] Created all educations');
  }

  // Create links
  if (reviewedData.links?.length) {
    console.log('[handleReviewedData] Creating links:', reviewedData.links.length);
    await db.link.createMany({
      data: reviewedData.links.map((link, index) => ({
        profileId,
        type: mapLinkType(link.type),
        url: link.url,
        label: link.label,
        source: 'RESUME' as const,
        sortOrder: index,
      })),
    });
  }

  console.log('[handleReviewedData] Complete! Profile handle:', handle);

  return NextResponse.json({
    success: true,
    handle,
    message: 'Profile created successfully',
  });
}

/**
 * Merge data from multiple import sources
 * Handles different data formats from resume, GitHub, LinkedIn APIs
 */
function mergeImportedData(importedData: Record<string, unknown>) {
  const merged: {
    firstName?: string;
    lastName?: string;
    headline?: string;
    summary?: string;
    location?: string;
    avatarUrl?: string;
    email?: string;
    phone?: string;
    website?: string;
    firstNameSource?: string;
    lastNameSource?: string;
    headlineSource?: string;
    summarySource?: string;
    locationSource?: string;
    avatarUrlSource?: string;
    skills: Array<{ name: string; source: string }>;
    projects: Array<{
      title: string;
      description?: string;
      shortDesc?: string;
      url?: string;
      repoUrl?: string;
      techStack?: string[];
      featured?: boolean;
      source: string;
      ghStars?: number;
      ghForks?: number;
      ghLanguage?: string;
    }>;
    experiences: Array<{
      company: string;
      role: string;
      location?: string;
      startDate?: string;
      endDate?: string;
      isCurrent?: boolean;
      description?: string;
      bullets?: string[];
      tags?: string[];
      source: string;
    }>;
    educations: Array<{
      institution: string;
      degree?: string;
      fieldOfStudy?: string;
      startDate?: string;
      endDate?: string;
      isCurrent?: boolean;
      gpa?: string;
      source: string;
    }>;
    links: Array<{
      type: string;
      url: string;
      label?: string;
      source: string;
    }>;
  } = {
    skills: [],
    projects: [],
    experiences: [],
    educations: [],
    links: [],
  };

  // Priority: resume > github > linkedin > manual links
  const sources = ['resume', 'github', 'linkedin', 'links'];

  for (const sourceKey of sources) {
    const rawData = importedData[sourceKey] as Record<string, unknown> | undefined;
    if (!rawData) continue;

    // Determine the source type
    const sourceType = sourceKey.toUpperCase();

    // Handle resume format (profile nested under 'profile' key, experiences under 'experiences')
    if (sourceKey === 'resume') {
      // Profile data is nested under 'profile' key in resume format
      const profileData = rawData.profile as Record<string, unknown> | undefined;
      if (profileData) {
        if (!merged.firstName && profileData.firstName) {
          merged.firstName = profileData.firstName as string;
          merged.firstNameSource = 'RESUME';
        }
        if (!merged.lastName && profileData.lastName) {
          merged.lastName = profileData.lastName as string;
          merged.lastNameSource = 'RESUME';
        }
        if (!merged.headline && profileData.headline) {
          merged.headline = profileData.headline as string;
          merged.headlineSource = 'RESUME';
        }
        if (!merged.summary && profileData.summary) {
          merged.summary = profileData.summary as string;
          merged.summarySource = 'RESUME';
        }
        if (!merged.location && profileData.location) {
          merged.location = profileData.location as string;
          merged.locationSource = 'RESUME';
        }
      }

      // Contact info from resume
      const contactInfo = rawData.contactInfo as Record<string, unknown> | undefined;
      if (contactInfo) {
        if (!merged.email && contactInfo.email) {
          merged.email = contactInfo.email as string;
        }
        if (!merged.phone && contactInfo.phone) {
          merged.phone = contactInfo.phone as string;
        }
      }

      // Work experiences from resume (uses 'experiences' key, not 'workExperiences')
      const experiences = rawData.experiences as Array<Record<string, unknown>> | undefined;
      if (experiences?.length) {
        merged.experiences.push(
          ...experiences.map((exp) => ({
            company: (exp.company as string) || 'Unknown Company',
            role: (exp.title as string) || (exp.role as string) || 'Unknown Role',
            location: exp.location as string | undefined,
            startDate: exp.startDate as string | undefined,
            endDate: exp.endDate as string | undefined,
            isCurrent: exp.isCurrent as boolean | undefined,
            description: exp.description as string | undefined,
            bullets: exp.bullets as string[] | undefined,
            source: 'RESUME',
          }))
        );
      }

      // Education from resume
      const educations = rawData.educations as Array<Record<string, unknown>> | undefined;
      if (educations?.length) {
        merged.educations.push(
          ...educations.map((edu) => ({
            institution: (edu.institution as string) || 'Unknown Institution',
            degree: edu.degree as string | undefined,
            fieldOfStudy: edu.fieldOfStudy as string | undefined,
            startDate: edu.startDate as string | undefined,
            endDate: edu.endDate as string | undefined,
            gpa: edu.gpa as string | undefined,
            source: 'RESUME',
          }))
        );
      }

      // Skills from resume
      const skills = rawData.skills as Array<{ name: string } | string> | undefined;
      if (skills?.length) {
        for (const skill of skills) {
          const skillName = typeof skill === 'string' ? skill : skill.name;
          if (skillName) {
            merged.skills.push({ name: skillName, source: 'RESUME' });
          }
        }
      }

      // Links from resume
      const links = rawData.links as Array<Record<string, unknown>> | undefined;
      if (links?.length) {
        merged.links.push(
          ...links.map((link) => ({
            type: (link.type as string) || 'OTHER',
            url: link.url as string,
            label: link.label as string | undefined,
            source: 'RESUME',
          }))
        );
      }

      continue;
    }

    // Handle GitHub/LinkedIn format (with profile object)
    const data = rawData as unknown as NormalizedImportResult;

    // Profile info (first wins)
    if (data.profile) {
      if (!merged.firstName && data.profile.firstName) {
        merged.firstName = data.profile.firstName;
        merged.firstNameSource = sourceType;
      }
      if (!merged.lastName && data.profile.lastName) {
        merged.lastName = data.profile.lastName;
        merged.lastNameSource = sourceType;
      }
      if (!merged.headline && data.profile.headline) {
        merged.headline = data.profile.headline;
        merged.headlineSource = sourceType;
      }
      if (!merged.summary && data.profile.summary) {
        merged.summary = data.profile.summary;
        merged.summarySource = sourceType;
      }
      if (!merged.location && data.profile.location) {
        merged.location = data.profile.location;
        merged.locationSource = sourceType;
      }
      if (!merged.avatarUrl && data.profile.avatarUrl) {
        merged.avatarUrl = data.profile.avatarUrl;
        merged.avatarUrlSource = sourceType;
      }
    }

    // Contact info
    if (data.contactInfo) {
      if (!merged.email && data.contactInfo.email) {
        merged.email = data.contactInfo.email;
      }
      if (!merged.phone && data.contactInfo.phone) {
        merged.phone = data.contactInfo.phone;
      }
      if (!merged.website && data.contactInfo.website) {
        merged.website = data.contactInfo.website;
      }
    }

    // Append arrays (dedupe later)
    if (data.skills?.length) {
      merged.skills.push(...data.skills.map((s) => ({ name: s.name, source: sourceType })));
    }
    if (data.projects?.length) {
      merged.projects.push(...data.projects.map((p) => ({ ...p, source: sourceType })));
    }
    if (data.experiences?.length) {
      merged.experiences.push(...data.experiences.map((e) => ({ ...e, source: sourceType })));
    }
    if (data.educations?.length) {
      merged.educations.push(...data.educations.map((e) => ({ ...e, source: sourceType })));
    }
    if (data.links?.length) {
      merged.links.push(...data.links.map((l) => ({ ...l, source: data.source })));
    }
  }

  // Deduplicate skills
  const seenSkills = new Set<string>();
  merged.skills = merged.skills.filter((s) => {
    const key = s.name.toLowerCase();
    if (seenSkills.has(key)) return false;
    seenSkills.add(key);
    return true;
  });

  // Deduplicate projects by repoUrl or title
  const seenProjects = new Set<string>();
  merged.projects = merged.projects.filter((p) => {
    const key = p.repoUrl || p.title.toLowerCase();
    if (seenProjects.has(key)) return false;
    seenProjects.add(key);
    return true;
  });

  // Deduplicate links by URL
  const seenLinks = new Set<string>();
  merged.links = merged.links.filter((l) => {
    const key = l.url.toLowerCase();
    if (seenLinks.has(key)) return false;
    seenLinks.add(key);
    return true;
  });

  return merged;
}

/**
 * Generate a URL-friendly handle from name or email
 */
function generateHandle(firstName?: string, lastName?: string, email?: string): string {
  if (firstName) {
    const name = `${firstName}${lastName || ''}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20);
    if (name.length >= 3) return name;
  }

  if (email) {
    const username = email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20);
    if (username.length >= 3) return username;
  }

  // Fallback: generate random handle
  return `user${Date.now().toString(36)}`;
}

/**
 * Ensure handle is unique by appending numbers if needed
 */
async function ensureUniqueHandle(baseHandle: string, excludeProfileId?: string): Promise<string> {
  let handle = baseHandle;
  let counter = 1;

  while (true) {
    const existing = await db.profile.findUnique({
      where: { handle },
      select: { id: true },
    });

    if (!existing || (excludeProfileId && existing.id === excludeProfileId)) {
      return handle;
    }

    handle = `${baseHandle}${counter}`;
    counter++;

    if (counter > 100) {
      // Safety: add random suffix
      handle = `${baseHandle}${Date.now().toString(36).slice(-4)}`;
      break;
    }
  }

  return handle;
}

/**
 * Map link type string to LinkType enum
 */
function mapLinkType(
  type: string
):
  | 'GITHUB'
  | 'LINKEDIN'
  | 'TWITTER'
  | 'PORTFOLIO'
  | 'BLOG'
  | 'DRIBBBLE'
  | 'BEHANCE'
  | 'YOUTUBE'
  | 'OTHER' {
  const typeMap: Record<
    string,
    | 'GITHUB'
    | 'LINKEDIN'
    | 'TWITTER'
    | 'PORTFOLIO'
    | 'BLOG'
    | 'DRIBBBLE'
    | 'BEHANCE'
    | 'YOUTUBE'
    | 'OTHER'
  > = {
    GITHUB: 'GITHUB',
    LINKEDIN: 'LINKEDIN',
    TWITTER: 'TWITTER',
    PORTFOLIO: 'PORTFOLIO',
    BLOG: 'BLOG',
    DRIBBBLE: 'DRIBBBLE',
    BEHANCE: 'BEHANCE',
    YOUTUBE: 'YOUTUBE',
    WEBSITE: 'PORTFOLIO',
    MEDIUM: 'BLOG',
    DEVTO: 'BLOG',
  };

  return typeMap[type.toUpperCase()] || 'OTHER';
}
