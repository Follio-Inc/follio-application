import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import type { NormalizedLink, NormalizedProfileData } from '@/services/import/types';
import { shouldOverrideSource } from '@/services/multi-source-merger.service';
import { DataSource } from '@prisma/client';

/**
 * LinkedIn OAuth Import API
 *
 * This endpoint extracts profile data from the user's connected LinkedIn account via Clerk.
 * LinkedIn OIDC provides limited data through their API:
 * - First name
 * - Last name
 * - Profile picture URL
 * - Email (if authorized)
 *
 * Note: LinkedIn heavily restricts API access. Work history, connections, and other
 * detailed profile data are NOT available through OAuth. For full data access,
 * users would need to use LinkedIn's data export feature.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body for saveToProfile option
    let saveToProfile = false;
    try {
      const body = await request.json();
      saveToProfile = body?.saveToProfile === true;
    } catch {
      // No body provided, that's fine
    }

    // Get the full user object with external accounts
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Log all external accounts for debugging
    console.log(
      '[LinkedIn OAuth] External accounts:',
      user.externalAccounts?.map((a) => ({
        provider: a.provider,
        username: a.username,
        firstName: a.firstName,
        lastName: a.lastName,
      }))
    );

    // Find LinkedIn connected account - check multiple possible provider names
    const linkedinAccount = user.externalAccounts?.find(
      (account) =>
        account.provider === 'linkedin_oidc' ||
        account.provider === 'linkedin' ||
        account.provider === 'oauth_linkedin_oidc' ||
        account.provider === 'oauth_linkedin'
    );

    if (!linkedinAccount) {
      // Provide helpful error with available providers
      const availableProviders = user.externalAccounts?.map((a) => a.provider).join(', ') || 'none';
      return NextResponse.json(
        {
          error: `LinkedIn account not connected. Available connected accounts: ${availableProviders}. Please ensure LinkedIn is enabled in your Clerk dashboard and try connecting again.`,
        },
        { status: 400 }
      );
    }

    console.log('[LinkedIn OAuth] Found LinkedIn account:', {
      provider: linkedinAccount.provider,
      username: linkedinAccount.username,
      firstName: linkedinAccount.firstName,
      lastName: linkedinAccount.lastName,
      emailAddress: linkedinAccount.emailAddress,
      imageUrl: linkedinAccount.imageUrl,
      // Log all available properties
      allKeys: Object.keys(linkedinAccount),
    });

    // Log full external account object for debugging
    console.log(
      '[LinkedIn OAuth] Full external account:',
      JSON.stringify(linkedinAccount, null, 2)
    );

    // Log the main user object's imageUrl as well
    console.log('[LinkedIn OAuth] User object:', {
      imageUrl: user.imageUrl,
      hasImage: user.hasImage,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    // Extract available data from the LinkedIn account
    // With custom LinkedIn app, we should get: firstName, lastName, emailAddress, imageUrl, username
    const linkedinFirstName = linkedinAccount.firstName || '';
    const linkedinLastName = linkedinAccount.lastName || '';
    const linkedinEmail = linkedinAccount.emailAddress || '';
    const linkedinAvatarUrl = linkedinAccount.imageUrl || '';
    const linkedinUsername = linkedinAccount.username || '';

    console.log('[LinkedIn OAuth] Extracted LinkedIn data:', {
      firstName: linkedinFirstName,
      lastName: linkedinLastName,
      email: linkedinEmail,
      avatarUrl: linkedinAvatarUrl,
      username: linkedinUsername,
    });

    // For saving to profile, we can use fallbacks, but track what's from LinkedIn
    const firstName = linkedinFirstName || user.firstName || '';
    const lastName = linkedinLastName || user.lastName || '';
    const avatarUrl = linkedinAvatarUrl || user.imageUrl || '';

    // Build LinkedIn profile URL if we have a username
    const linkedinProfileUrl = linkedinUsername
      ? `https://linkedin.com/in/${linkedinUsername}`
      : '';

    // Create links array
    const links: NormalizedLink[] = linkedinProfileUrl
      ? [{ url: linkedinProfileUrl, type: 'linkedin', label: 'LinkedIn', source: 'LINKEDIN' }]
      : [];

    // Create normalized profile data - only what actually came from LinkedIn
    const profile: NormalizedProfileData = {
      firstName: linkedinFirstName, // Only LinkedIn data
      lastName: linkedinLastName, // Only LinkedIn data
      avatarUrl: linkedinAvatarUrl, // Only LinkedIn data
      headline: '', // Not available via OIDC
      summary: '', // Not available via OIDC
      location: '', // Not available via OIDC
    };

    // Summary of what was actually imported FROM LinkedIn
    const summary = {
      hasName: !!(linkedinFirstName || linkedinLastName),
      hasEmail: !!linkedinEmail,
      hasProfilePicture: !!linkedinAvatarUrl,
      hasLinkedInUrl: !!linkedinProfileUrl,
      total:
        (linkedinFirstName || linkedinLastName ? 1 : 0) +
        (linkedinEmail ? 1 : 0) +
        (linkedinAvatarUrl ? 1 : 0) +
        (linkedinProfileUrl ? 1 : 0),
    };

    // Build message about what was imported FROM LinkedIn
    const importedItems: string[] = [];
    if (linkedinFirstName || linkedinLastName) importedItems.push('name');
    if (linkedinEmail) importedItems.push('email');
    if (linkedinAvatarUrl) importedItems.push('profile picture');
    if (linkedinProfileUrl) importedItems.push('LinkedIn URL');

    const message =
      importedItems.length > 0
        ? `Imported ${importedItems.join(', ')} from LinkedIn`
        : 'LinkedIn connected but no profile data available (LinkedIn restricts API access)';

    // Optionally save to profile
    if (saveToProfile) {
      try {
        const dbUser = await db.user.findUnique({
          where: { clerkId: userId },
          include: { profile: true },
        });

        if (dbUser?.profile) {
          const profileId = dbUser.profile.id;

          // Update profile with LinkedIn data based on source priority
          const profileUpdate: Record<string, string | DataSource> = {};
          const currentProfile = dbUser.profile;

          if (
            firstName &&
            shouldOverrideSource(
              currentProfile.firstNameSource,
              'LINKEDIN',
              currentProfile.firstName
            )
          ) {
            profileUpdate.firstName = firstName;
            profileUpdate.firstNameSource = DataSource.LINKEDIN;
          }
          if (
            lastName &&
            shouldOverrideSource(currentProfile.lastNameSource, 'LINKEDIN', currentProfile.lastName)
          ) {
            profileUpdate.lastName = lastName;
            profileUpdate.lastNameSource = DataSource.LINKEDIN;
          }
          if (
            avatarUrl &&
            shouldOverrideSource(
              currentProfile.avatarUrlSource,
              'LINKEDIN',
              currentProfile.avatarUrl
            )
          ) {
            profileUpdate.avatarUrl = avatarUrl;
            profileUpdate.avatarUrlSource = DataSource.LINKEDIN;
          }

          if (Object.keys(profileUpdate).length > 0) {
            await db.profile.update({
              where: { id: profileId },
              data: profileUpdate,
            });
          }

          // Add LinkedIn link if it doesn't exist
          if (linkedinProfileUrl) {
            const existingLink = await db.link.findFirst({
              where: {
                profileId,
                url: { contains: 'linkedin.com', mode: 'insensitive' },
              },
            });
            if (!existingLink) {
              await db.link.create({
                data: {
                  profileId,
                  type: 'LINKEDIN',
                  url: linkedinProfileUrl,
                  label: 'LinkedIn',
                  source: 'LINKEDIN',
                },
              });
            }
          }

          console.log('[LinkedIn OAuth] Saved to profile:', profileId);
        }
      } catch (saveError) {
        console.error('[LinkedIn OAuth] Failed to save to profile:', saveError);
        // Don't fail the whole request
      }
    }

    return NextResponse.json({
      success: true,
      message,
      data: {
        profile, // Contains ONLY data from LinkedIn
        links,
        email: linkedinEmail, // Only LinkedIn email
        summary,
        // Include what actually came from LinkedIn for transparency
        fromLinkedIn: {
          firstName: linkedinFirstName,
          lastName: linkedinLastName,
          email: linkedinEmail,
          avatarUrl: linkedinAvatarUrl,
          username: linkedinUsername,
          profileUrl: linkedinProfileUrl,
        },
      },
    });
  } catch (error) {
    console.error('[LinkedIn OAuth Import] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to import LinkedIn data',
      },
      { status: 500 }
    );
  }
}
