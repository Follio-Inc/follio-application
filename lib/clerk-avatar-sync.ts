/**
 * Clerk Avatar Sync Utility
 *
 * Syncs the Follio profile avatar to the Clerk user account.
 * This ensures the avatar shown in Clerk's dropdown matches the Follio profile.
 */

import { clerkClient } from '@clerk/nextjs/server';
import sharp from 'sharp';

import { logger } from '@/lib/logger';

const avatarLogger = logger.child({ source: 'clerk-avatar-sync' });

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

    avatarLogger.debug('Image compressed', {
      originalSize: imageBuffer.length,
      compressedSize: compressed.length,
    });

    return compressed;
  } catch (error) {
    avatarLogger.error('Failed to compress image', error);
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
    avatarLogger.debug('No avatar URL provided, skipping sync');
    return { success: true };
  }

  try {
    avatarLogger.info('Syncing avatar', {
      urlType: avatarUrl.startsWith('data:') ? 'base64' : 'URL',
    });

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
      avatarLogger.debug('Decoded base64 image', { size: imageBuffer.length });
    } else {
      // Download the image from URL
      avatarLogger.debug('Downloading image from URL');
      const imageResponse = await fetch(avatarUrl);
      if (!imageResponse.ok) {
        avatarLogger.error('Failed to download image', undefined, { status: imageResponse.status });
        return { success: false, error: `Failed to download image: ${imageResponse.status}` };
      }

      const arrayBuffer = await imageResponse.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      avatarLogger.debug('Downloaded image', { size: imageBuffer.length });
    }

    // Compress the image if it's too large or just to standardize profile photos
    // Always compress to ensure consistent quality and size
    const compressedBuffer = await compressImageForClerk(imageBuffer);

    // Final size check
    if (compressedBuffer.length > CLERK_MAX_IMAGE_SIZE) {
      avatarLogger.error('Image still too large after compression', undefined, {
        size: compressedBuffer.length,
      });
      return { success: false, error: 'Image too large even after compression' };
    }

    // Convert buffer to Uint8Array then to File for Clerk API
    const uint8Array = new Uint8Array(compressedBuffer);
    const file = new File([uint8Array], 'avatar.jpg', { type: 'image/jpeg' });

    // Upload to Clerk
    const client = await clerkClient();
    await client.users.updateUserProfileImage(clerkUserId, { file });

    avatarLogger.info('Successfully synced avatar to Clerk');
    return { success: true };
  } catch (error) {
    avatarLogger.error('Error syncing avatar', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync avatar to Clerk',
    };
  }
}
