import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import type { NormalizedProfileData } from '@/services/import/types';
import { shouldOverrideSource } from '@/services/multi-source-merger.service';

/**
 * Google OAuth Import API
 *
 * This endpoint extracts profile data from the user's connected Google account via Clerk.
 * Google OIDC provides the following data through their API:
 * - First name (given_name)
 * - Last name (family_name)
 * - Profile picture URL
 * - Email address
 *
 * Note: Unlike LinkedIn, Google provides reliable access to basic profile data.
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
      '[Google OAuth] External accounts:',
      user.externalAccounts?.map((a) => ({
        provider: a.provider,
        username: a.username,
        firstName: a.firstName,
        lastName: a.lastName,
      }))
    );

    // Find Google connected account - check multiple possible provider names
    const googleAccount = user.externalAccounts?.find(
      (account) =>
        account.provider === 'google' ||
        account.provider === 'oauth_google' ||
        account.provider === 'google_oidc'
    );

    if (!googleAccount) {
      // Provide helpful error with available providers
      const availableProviders = user.externalAccounts?.map((a) => a.provider).join(', ') || 'none';
      return NextResponse.json(
        {
          error: `Google account not connected. Available connected accounts: ${availableProviders}. Please ensure Google is enabled in your Clerk dashboard and try connecting again.`,
        },
        { status: 400 }
      );
    }

    console.log('[Google OAuth] Found Google account:', {
      provider: googleAccount.provider,
      username: googleAccount.username,
      firstName: googleAccount.firstName,
      lastName: googleAccount.lastName,
      emailAddress: googleAccount.emailAddress,
      imageUrl: googleAccount.imageUrl,
      // Log all available properties
      allKeys: Object.keys(googleAccount),
    });

    // Log full external account object for debugging
    console.log('[Google OAuth] Full external account:', JSON.stringify(googleAccount, null, 2));

    // Log the main user object's imageUrl as well
    console.log('[Google OAuth] User object:', {
      imageUrl: user.imageUrl,
      hasImage: user.hasImage,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    // Extract available data from the Google account
    // Google OIDC provides: firstName, lastName, emailAddress, imageUrl
    const googleFirstName = googleAccount.firstName || '';
    const googleLastName = googleAccount.lastName || '';
    const googleEmail = googleAccount.emailAddress || '';
    const googleAvatarUrl = googleAccount.imageUrl || '';
    // Google doesn't typically provide a username
    const googleUsername = googleAccount.username || '';

    console.log('[Google OAuth] Extracted Google data:', {
      firstName: googleFirstName,
      lastName: googleLastName,
      email: googleEmail,
      avatarUrl: googleAvatarUrl,
      username: googleUsername,
    });

    // For saving to profile, we can use fallbacks, but track what's from Google
    const firstName = googleFirstName || user.firstName || '';
    const lastName = googleLastName || user.lastName || '';
    const avatarUrl = googleAvatarUrl || user.imageUrl || '';

    // Create normalized profile data - only what actually came from Google
    const profile: NormalizedProfileData = {
      firstName: googleFirstName, // Only Google data
      lastName: googleLastName, // Only Google data
      avatarUrl: googleAvatarUrl, // Only Google data
      headline: '', // Not available via OIDC
      summary: '', // Not available via OIDC
      location: '', // Not available via OIDC
    };

    // Summary of what was actually imported FROM Google
    const summary = {
      hasName: !!(googleFirstName || googleLastName),
      hasEmail: !!googleEmail,
      hasProfilePicture: !!googleAvatarUrl,
      total:
        (googleFirstName || googleLastName ? 1 : 0) +
        (googleEmail ? 1 : 0) +
        (googleAvatarUrl ? 1 : 0),
    };

    // Build message about what was imported FROM Google
    const importedItems: string[] = [];
    if (googleFirstName || googleLastName) importedItems.push('name');
    if (googleEmail) importedItems.push('email');
    if (googleAvatarUrl) importedItems.push('profile picture');

    const message =
      importedItems.length > 0
        ? `Imported ${importedItems.join(', ')} from Google`
        : 'Google connected but no profile data available';

    // Optionally save to profile
    if (saveToProfile) {
      try {
        const context = await resolveActiveProfileContext(userId).catch(() => null);

        if (context?.profileId) {
          const profileId = context.profileId;
          const currentProfile = await db.profile.findUnique({
            where: { id: profileId },
          });

          if (!currentProfile) {
            throw new Error('Profile not found');
          }

          // Update profile with Google data based on source priority
          // Note: GOOGLE is treated similarly to other OAuth sources
          // Using string type for DataSource as GOOGLE may not be in the generated client yet
          const profileUpdate: Record<string, string> = {};

          if (
            firstName &&
            shouldOverrideSource(currentProfile.firstNameSource, 'GOOGLE', currentProfile.firstName)
          ) {
            profileUpdate.firstName = firstName;
            profileUpdate.firstNameSource = 'GOOGLE';
          }
          if (
            lastName &&
            shouldOverrideSource(currentProfile.lastNameSource, 'GOOGLE', currentProfile.lastName)
          ) {
            profileUpdate.lastName = lastName;
            profileUpdate.lastNameSource = 'GOOGLE';
          }
          if (
            avatarUrl &&
            shouldOverrideSource(currentProfile.avatarUrlSource, 'GOOGLE', currentProfile.avatarUrl)
          ) {
            profileUpdate.avatarUrl = avatarUrl;
            profileUpdate.avatarUrlSource = 'GOOGLE';
          }

          if (Object.keys(profileUpdate).length > 0) {
            await db.profile.update({
              where: { id: profileId },
              data: profileUpdate,
            });
          }

          console.log('[Google OAuth] Saved to profile:', profileId);
        }
      } catch (saveError) {
        console.error('[Google OAuth] Failed to save to profile:', saveError);
        // Don't fail the whole request
      }
    }

    return NextResponse.json({
      success: true,
      message,
      data: {
        profile, // Contains ONLY data from Google
        links: [], // Google doesn't provide profile links
        email: googleEmail, // Only Google email
        summary,
        // Include what actually came from Google for transparency
        fromGoogle: {
          firstName: googleFirstName,
          lastName: googleLastName,
          email: googleEmail,
          avatarUrl: googleAvatarUrl,
          username: googleUsername,
        },
      },
    });
  } catch (error) {
    console.error('[Google OAuth Import] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to import Google data',
      },
      { status: 500 }
    );
  }
}
