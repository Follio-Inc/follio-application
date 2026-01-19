/**
 * LinkedIn Import Service
 *
 * Placeholder service for LinkedIn import functionality.
 * Currently returns "coming soon" status - can be extended later.
 */

import type { ILinkedInImportService, ImportServiceResult } from './types';

/**
 * LinkedIn Import Service Implementation
 */
export class LinkedInImportService implements ILinkedInImportService {
  /**
   * Check if LinkedIn import is available
   */
  isAvailable(): boolean {
    // LinkedIn OAuth requires app approval and is complex
    // Return false until properly implemented
    return false;
  }

  /**
   * Import data from LinkedIn
   * Currently a placeholder that returns "coming soon"
   */
  async importLinkedIn(_accessToken: string, _userId: string): Promise<ImportServiceResult> {
    return {
      success: false,
      error: "LinkedIn import is coming soon! We're working on this feature.",
      errorCode: 'NOT_AVAILABLE',
    };
  }
}

// Export singleton instance
export const linkedInImportService = new LinkedInImportService();
