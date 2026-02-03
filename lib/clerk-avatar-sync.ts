/**
 * Clerk Avatar Sync Utility
 *
 * Syncs the Follio profile avatar to the Clerk user account.
 * This ensures the avatar shown in Clerk's dropdown matches the Follio profile.
 */

import { clerkClient } from '@clerk/nextjs/server';
import sharp from 'sharp';

// Clerk has a 5MB limit for profile images
const CLERK_MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const TARGET_IMAGE_SIZE = 512; // Resize to 512x512 max for profile photos
const JPEG_QUALITY = 85; // Good balance between quality and size

/**
 * Compress an image buffer to fit within Clerk's size limits.
 * Resizes to a reasonable profile photo size and converts to JPEG.
 */
async function compressImageForClerk(imageBuffer: Buffer): Promise<Buffer> {
  try {
    // Use sharp to resize and compress the image
    const compressed = await sharp(imageBuffer)
      .resize(TARGET_IMAGE_SIZE, TARGET_IMAGE_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    console.log(
      `[Clerk Avatar Sync] Compressed image from ${imageBuffer.length} to ${compressed.length} bytes`
    );

    return compressed;
  } catch (error) {
    console.error('[Clerk Avatar Sync] Failed to compress image:', error);
    throw error;
  }
}

/**
 * Sync avatar URL to Clerk user profile.
 * Downloads the image, compresses if needed, and uploads it to Clerk.
 *
 * @param clerkUserId - The Clerk user ID (not the database user ID)
 * @param avatarUrl - The URL of the avatar to sync (can be URL or base64 data URL)
 * @returns Success status and any error message
 */
export async function syncAvatarToClerk(
  clerkUserId: string,
  avatarUrl: string | null | undefined
): Promise<{ success: boolean; error?: string }> {
  if (!avatarUrl) {
    console.log('[Clerk Avatar Sync] No avatar URL provided, skipping sync');
    return { success: true };
  }

  try {
    console.log('[Clerk Avatar Sync] Syncing avatar for user:', clerkUserId);
    console.log(
      '[Clerk Avatar Sync] Avatar URL type:',
      avatarUrl.startsWith('data:') ? 'base64' : 'URL'
    );

    let imageBuffer: Buffer;

    // Handle base64 data URLs (from uploaded photos)
    if (avatarUrl.startsWith('data:')) {
      // Extract the base64 data from the data URL
      const matches = avatarUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return { success: false, error: 'Invalid base64 data URL format' };
      }

      const base64Data = matches[2];
      imageBuffer = Buffer.from(base64Data, 'base64');
      console.log(`[Clerk Avatar Sync] Decoded base64 image: ${imageBuffer.length} bytes`);
    } else {
      // Download the image from URL
      console.log('[Clerk Avatar Sync] Downloading image from URL...');
      const imageResponse = await fetch(avatarUrl);
      if (!imageResponse.ok) {
        console.error('[Clerk Avatar Sync] Failed to download image:', imageResponse.status);
        return { success: false, error: `Failed to download image: ${imageResponse.status}` };
      }

      const arrayBuffer = await imageResponse.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      console.log(`[Clerk Avatar Sync] Downloaded image: ${imageBuffer.length} bytes`);
    }

    // Compress the image if it's too large or just to standardize profile photos
    // Always compress to ensure consistent quality and size
    const compressedBuffer = await compressImageForClerk(imageBuffer);

    // Final size check
    if (compressedBuffer.length > CLERK_MAX_IMAGE_SIZE) {
      console.error(
        `[Clerk Avatar Sync] Image still too large after compression: ${compressedBuffer.length} bytes`
      );
      return { success: false, error: 'Image too large even after compression' };
    }

    // Convert buffer to Uint8Array then to File for Clerk API
    const uint8Array = new Uint8Array(compressedBuffer);
    const file = new File([uint8Array], 'avatar.jpg', { type: 'image/jpeg' });

    // Upload to Clerk
    const client = await clerkClient();
    await client.users.updateUserProfileImage(clerkUserId, { file });

    console.log('[Clerk Avatar Sync] Successfully synced avatar to Clerk');
    return { success: true };
  } catch (error) {
    console.error('[Clerk Avatar Sync] Error syncing avatar:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync avatar to Clerk',
    };
  }
}
