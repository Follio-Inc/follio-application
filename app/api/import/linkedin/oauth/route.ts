import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import type { NormalizedLink, NormalizedProfileData } from '@/services/import/types';

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
      firstName: linkedinAccount.firstName,
      lastName: linkedinAccount.lastName,
      imageUrl: linkedinAccount.imageUrl,
    });

    // Log the main user object's imageUrl as well
    console.log('[LinkedIn OAuth] User object:', {
      imageUrl: user.imageUrl,
      hasImage: user.hasImage,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    // Extract available data from the LinkedIn account
    // LinkedIn OIDC provides: firstName, lastName, emailAddress, imageUrl
    // Note: Sometimes the imageUrl is on the main user object, not the external account
    const firstName = linkedinAccount.firstName || user.firstName || '';
    const lastName = linkedinAccount.lastName || user.lastName || '';
    const email = linkedinAccount.emailAddress || user.emailAddresses?.[0]?.emailAddress || '';
    // Try external account imageUrl first, then fall back to user's main imageUrl
    const avatarUrl = linkedinAccount.imageUrl || user.imageUrl || '';
    const username = linkedinAccount.username || '';

    // Build LinkedIn profile URL if we have a username
    const linkedinProfileUrl = username ? `https://linkedin.com/in/${username}` : '';

    // Create links array
    const links: NormalizedLink[] = linkedinProfileUrl
      ? [{ url: linkedinProfileUrl, type: 'linkedin', label: 'LinkedIn', source: 'LINKEDIN' }]
      : [];

    // Create normalized profile data
    const profile: NormalizedProfileData = {
      firstName,
      lastName,
      avatarUrl,
      headline: '', // Not available via OIDC
      summary: '', // Not available via OIDC
      location: '', // Not available via OIDC
    };

    // Summary of what was imported
    const summary = {
      hasName: !!(firstName || lastName),
      hasEmail: !!email,
      hasProfilePicture: !!avatarUrl,
      hasLinkedInUrl: !!linkedinProfileUrl,
      total:
        (firstName || lastName ? 1 : 0) +
        (email ? 1 : 0) +
        (avatarUrl ? 1 : 0) +
        (linkedinProfileUrl ? 1 : 0),
    };

    // Build message about what was imported
    const importedItems: string[] = [];
    if (firstName || lastName) importedItems.push('name');
    if (email) importedItems.push('email');
    if (avatarUrl) importedItems.push('profile picture');
    if (linkedinProfileUrl) importedItems.push('LinkedIn URL');

    const message =
      importedItems.length > 0
        ? `Imported ${importedItems.join(', ')}`
        : 'Connected but no data available';

    // Optionally save to profile
    if (saveToProfile) {
      try {
        const dbUser = await db.user.findUnique({
          where: { clerkId: userId },
          include: { profile: true },
        });

        if (dbUser?.profile) {
          const profileId = dbUser.profile.id;

          // Update profile with LinkedIn data (only fill in missing fields)
          const profileUpdate: Record<string, string> = {};
          if (!dbUser.profile.firstName && firstName) {
            profileUpdate.firstName = firstName;
          }
          if (!dbUser.profile.lastName && lastName) {
            profileUpdate.lastName = lastName;
          }
          if (!dbUser.profile.avatarUrl && avatarUrl) {
            profileUpdate.avatarUrl = avatarUrl;
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
        profile,
        links,
        email, // Include email separately since it's contact info
        summary,
        // Include raw data for debugging/transparency
        raw: {
          firstName,
          lastName,
          email,
          avatarUrl,
          linkedinProfileUrl,
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
