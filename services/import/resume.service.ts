/**
 * Resume Import Service
 *
 * Modular service for parsing resumes and normalizing data.
 * Designed to be swappable with better parsing engines later.
 */

import { db } from '@/lib/db';
import { normalizeResumeData, parseResume } from '@/services/resume-parser.service';
import type { Prisma } from '@prisma/client';
import type {
  IResumeImportService,
  ImportJobStatus,
  ImportServiceResult,
  NormalizedImportResult,
} from './types';

// File validation constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * Validate file before processing
 */
function validateFile(buffer: Buffer, mimeType: string): { valid: boolean; error?: string } {
  if (buffer.length > MAX_FILE_SIZE) {
    return { valid: false, error: 'File size must be less than 5MB' };
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { valid: false, error: 'Only PDF, TXT, DOC, and DOCX files are supported' };
  }

  return { valid: true };
}

/**
 * Sanitize text content
 */
function sanitizeText(text: string): string {
  // Remove null bytes and other problematic characters
  return text
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim();
}

/**
 * Convert parsed resume data to normalized format
 */
function toNormalizedResult(
  parsed: ReturnType<typeof normalizeResumeData>,
  rawText: string
): NormalizedImportResult {
  const result: NormalizedImportResult = {
    source: 'RESUME',
    profile: {},
    contactInfo: undefined,
    links: [],
    experiences: [],
    projects: [],
    educations: [],
    skills: [],
    certifications: [],
    meta: {
      source: 'RESUME',
      importedAt: new Date(),
      rawDataStored: true,
      confidence: parsed._meta?.confidence || 0.5,
    },
    summary: {
      profileFields: 0,
      experiences: 0,
      projects: 0,
      educations: 0,
      skills: 0,
      links: 0,
      certifications: 0,
    },
  };

  // Profile info
  if (parsed.firstName) {
    result.profile!.firstName = sanitizeText(parsed.firstName);
    result.summary!.profileFields!++;
  }
  if (parsed.lastName) {
    result.profile!.lastName = sanitizeText(parsed.lastName);
    result.summary!.profileFields!++;
  }
  if (parsed.headline) {
    result.profile!.headline = sanitizeText(parsed.headline);
    result.summary!.profileFields!++;
  }
  if (parsed.bio) {
    result.profile!.summary = sanitizeText(parsed.bio);
    result.summary!.profileFields!++;
  }
  if (parsed.location) {
    result.profile!.location = sanitizeText(parsed.location);
    result.summary!.profileFields!++;
  }

  // Contact info - email and phone are at top level in NormalizedResumeData
  if (parsed.email || parsed.phone) {
    result.contactInfo = {
      email: parsed.email ? sanitizeText(parsed.email) : undefined,
      phone: parsed.phone ? sanitizeText(parsed.phone) : undefined,
    };
  }

  // Work experiences
  if (parsed.workExperiences?.length) {
    result.experiences = parsed.workExperiences.map((exp) => ({
      company: sanitizeText(exp.company || 'Unknown Company'),
      role: sanitizeText(exp.title || 'Unknown Role'),
      location: exp.location ? sanitizeText(exp.location) : undefined,
      startDate: exp.startDate,
      endDate: exp.endDate,
      isCurrent: exp.isCurrent,
      description: exp.description ? sanitizeText(exp.description) : undefined,
      source: 'RESUME' as const,
    }));
    result.summary!.experiences = result.experiences.length;
  }

  // Educations
  if (parsed.educations?.length) {
    result.educations = parsed.educations.map((edu) => ({
      institution: sanitizeText(edu.institution || 'Unknown Institution'),
      degree: edu.degree ? sanitizeText(edu.degree) : undefined,
      fieldOfStudy: edu.fieldOfStudy ? sanitizeText(edu.fieldOfStudy) : undefined,
      startDate: edu.startDate,
      endDate: edu.endDate,
      gpa: edu.gpa,
      source: 'RESUME',
    }));
    result.summary!.educations = result.educations.length;
  }

  // Skills
  if (parsed.skills?.length) {
    result.skills = parsed.skills.map((skill) => ({
      name: sanitizeText(skill.name),
      source: 'RESUME',
    }));
    result.summary!.skills = result.skills.length;
  }

  // Links
  if (parsed.links?.length) {
    result.links = parsed.links.map((link) => ({
      type: link.type,
      url: link.url,
      source: 'RESUME' as const,
    }));
    result.summary!.links = result.links.length;
  }

  // Certifications
  if (parsed.certifications?.length) {
    result.certifications = parsed.certifications.map((cert) => ({
      name: sanitizeText(cert.name),
      issuer: sanitizeText(cert.issuer),
      issueDate: cert.date,
      source: 'RESUME',
    }));
    result.summary!.certifications = result.certifications.length;
  }

  return result;
}

/**
 * Resume Import Service Implementation
 */
export class ResumeImportService implements IResumeImportService {
  /**
   * Import and parse a resume file
   */
  async importResume(file: Buffer, mimeType: string, userId: string): Promise<ImportServiceResult> {
    try {
      // Validate file
      const validation = validateFile(file, mimeType);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          errorCode: 'VALIDATION_ERROR',
        };
      }

      // Get user by Clerk ID to get database user ID
      const user = await db.user.findUnique({
        where: { clerkId: userId },
        include: { profile: true },
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found',
          errorCode: 'NOT_FOUND',
        };
      }

      // Create job for tracking (use database user ID, not Clerk ID)
      const job = await db.importJob.create({
        data: {
          userId: user.id,
          source: 'RESUME',
          status: 'PROCESSING',
          inputType: 'file',
          progress: 10,
          currentStep: 'Extracting text from resume...',
          startedAt: new Date(),
        },
      });

      try {
        // Parse resume
        await db.importJob.update({
          where: { id: job.id },
          data: { progress: 30, currentStep: 'Parsing resume content...' },
        });

        const parsed = await parseResume(file, mimeType);

        await db.importJob.update({
          where: { id: job.id },
          data: { progress: 60, currentStep: 'Normalizing data...' },
        });

        const normalized = normalizeResumeData(parsed);
        const result = toNormalizedResult(normalized, parsed.rawText);

        // User already fetched at start of function
        if (user.profile) {
          await db.rawImportPayload.create({
            data: {
              profileId: user.profile.id,
              source: 'RESUME',
              rawData: {
                text: parsed.rawText.substring(0, 50000), // Limit stored text
                confidence: parsed.confidence,
              },
              status: 'COMPLETED',
              processedAt: new Date(),
            },
          });
        }

        // Update job as completed
        await db.importJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            progress: 100,
            currentStep: 'Import complete',
            result: result as unknown as Prisma.InputJsonValue,
            itemsFound:
              (result.summary?.experiences || 0) +
              (result.summary?.skills || 0) +
              (result.summary?.educations || 0) +
              (result.summary?.links || 0),
            completedAt: new Date(),
          },
        });

        // Log the import
        await db.importLog.create({
          data: {
            userId: user.id,
            source: 'RESUME',
            status: 'COMPLETED',
            itemsFound:
              (result.summary?.experiences || 0) +
              (result.summary?.skills || 0) +
              (result.summary?.educations || 0),
            metadata: { confidence: result.meta.confidence },
          },
        });

        return {
          success: true,
          data: result,
          jobId: job.id,
          status: 'completed',
        };
      } catch (parseError) {
        // Update job as failed
        await db.importJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            error: parseError instanceof Error ? parseError.message : 'Failed to parse resume',
            completedAt: new Date(),
          },
        });
        throw parseError;
      }
    } catch (error) {
      console.error('Resume import error:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import resume',
        errorCode: 'IMPORT_ERROR',
      };
    }
  }

  /**
   * Import resume from plain text
   */
  async importResumeText(text: string, userId: string): Promise<ImportServiceResult> {
    if (!text || text.trim().length < 50) {
      return {
        success: false,
        error: 'Resume text is too short. Please provide more content.',
        errorCode: 'VALIDATION_ERROR',
      };
    }

    // Convert text to buffer and process
    const buffer = Buffer.from(sanitizeText(text), 'utf-8');
    return this.importResume(buffer, 'text/plain', userId);
  }

  /**
   * Get job status for async tracking
   */
  async getJobStatus(jobId: string): Promise<ImportServiceResult> {
    try {
      const job = await db.importJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        return {
          success: false,
          error: 'Job not found',
          errorCode: 'NOT_FOUND',
        };
      }

      const status: ImportJobStatus = {
        id: job.id,
        source: job.source,
        status: job.status.toLowerCase() as ImportJobStatus['status'],
        progress: job.progress,
        currentStep: job.currentStep || undefined,
        result: job.result as unknown as NormalizedImportResult | undefined,
        error: job.error || undefined,
        startedAt: job.startedAt || undefined,
        completedAt: job.completedAt || undefined,
      };

      return {
        success: true,
        data: status as unknown as NormalizedImportResult,
        jobId: job.id,
        status:
          status.status === 'completed'
            ? 'completed'
            : status.status === 'failed'
              ? 'failed'
              : 'processing',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get job status',
        errorCode: 'ERROR',
      };
    }
  }
}

// Export singleton instance
export const resumeImportService = new ResumeImportService();
