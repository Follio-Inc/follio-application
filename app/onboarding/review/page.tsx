'use client';

import { useReverification, useUser } from '@clerk/nextjs';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  Edit2,
  Eye,
  EyeOff,
  FolderGit2,
  Github,
  GraduationCap,
  Link as LinkIcon,
  Mail,
  Pencil,
  Phone,
  Pin,
  Plus,
  Sparkles,
  Star,
  Trash2,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  PhoneInput,
  formatPhoneValue,
  formatStandardPhone as formatStandardPhoneFn,
  type PhoneValue,
} from '@/components/ui/phone-input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { containsHtmlFormatting, stripHtmlTags } from '@/lib/html-utils';
import { toMonthInputFormat } from '@/lib/utils';

// IndexedDB helpers for retrieving large uploaded photos
const UPLOADED_PHOTO_DB_NAME = 'follio_onboarding';
const UPLOADED_PHOTO_STORE_NAME = 'uploaded_photos';

const openPhotoDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(UPLOADED_PHOTO_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(UPLOADED_PHOTO_STORE_NAME)) {
        db.createObjectStore(UPLOADED_PHOTO_STORE_NAME, { keyPath: 'key' });
      }
    };
  });
};

const getPhotoFromIndexedDB = async (key: string): Promise<string | null> => {
  try {
    const db = await openPhotoDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(UPLOADED_PHOTO_STORE_NAME, 'readonly');
      const store = transaction.objectStore(UPLOADED_PHOTO_STORE_NAME);
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.data || null);
    });
  } catch {
    return null;
  }
};

const clearPhotosFromIndexedDB = async (): Promise<void> => {
  try {
    const db = await openPhotoDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(UPLOADED_PHOTO_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(UPLOADED_PHOTO_STORE_NAME);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch {
    // Ignore errors when clearing
  }
};

/**
 * Convert a base64 data URL to a File object, optionally compressing it
 */
const base64ToFile = async (base64: string, filename: string): Promise<File> => {
  const response = await fetch(base64);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type });
};

/**
 * Compress an image file to a target size (for Clerk's 5MB limit)
 */
const compressImageForClerk = async (file: File, _maxSizeKB = 500): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // Target size: 512x512 for profile photos
      const targetSize = 512;
      canvas.width = targetSize;
      canvas.height = targetSize;

      // Calculate crop to center the image (cover fit)
      const scale = Math.max(targetSize / img.width, targetSize / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const offsetX = (targetSize - scaledWidth) / 2;
      const offsetY = (targetSize - scaledHeight) / 2;

      ctx?.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

      // Convert to JPEG with compression
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
            console.log(
              `[Image Compress] Compressed from ${file.size} to ${compressedFile.size} bytes`
            );
            resolve(compressedFile);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        'image/jpeg',
        0.85 // Quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

// Types for parsed resume data
interface ParsedProfile {
  firstName?: string;
  lastName?: string;
  headline?: string;
  summary?: string;
  location?: string;
  avatarUrl?: string;
}

interface ParsedExperience {
  id: string;
  company: string;
  role: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  bullets?: string[];
}

interface ParsedEducation {
  id: string;
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
}

interface ParsedSkill {
  id: string;
  name: string;
}

interface ParsedLink {
  id: string;
  type: string;
  url: string;
  label?: string;
}

// Project from GitHub or resume
interface ParsedProject {
  id: string;
  title: string;
  description?: string;
  technologies?: string[];
  repoUrl?: string;
  liveUrl?: string;
  // GitHub-specific fields
  ghStars?: number;
  ghForks?: number;
  ghLanguage?: string;
  ghPinned?: boolean;
  ghTopics?: string[];
  ghOwner?: string;
  ghRepo?: string;
  ghReadme?: string;
  ghLastPush?: string;
  ghLicense?: string;
  ghWatchers?: number;
  // Visibility controls
  isVisible: boolean;
  showOnPortfolio: boolean;
  showOnResume: boolean;
  showStats: boolean;
  showReadme: boolean;
  customDescription?: string;
  // Source tracking
  source?: string;
}

interface ReviewData {
  profile: ParsedProfile;
  experiences: ParsedExperience[];
  educations: ParsedEducation[];
  skills: ParsedSkill[];
  links: ParsedLink[];
  projects: ParsedProject[];
  contactInfo?: {
    email?: string;
    phone?: string;
    // All emails - now includes Clerk ID and verification status
    allEmails?: Array<{
      email: string;
      source: string;
      clerkEmailId?: string; // Clerk's email ID for managing it
      verified?: boolean; // Whether verified in Clerk
    }>;
    // All phones collected from all import sources (supports both legacy and new format)
    allPhones?: Array<{
      phone?: string; // Legacy: full phone string
      countryCode?: string | null; // New: country code
      number?: string; // New: number without country code
      source: string;
    }>;
    // Track which email/phone is primary (index in the array)
    primaryEmailIndex?: number;
    primaryPhoneIndex?: number;
  };
  // All names collected from different sources (signup, resume, linkedin, github)
  allNames?: Array<{ firstName?: string; lastName?: string; source: string }>;
}

type ReviewStep =
  | 'profile'
  | 'contact'
  | 'experience'
  | 'education'
  | 'skills'
  | 'links'
  | 'projects'
  | 'complete';

const STEPS: ReviewStep[] = [
  'profile',
  'contact',
  'experience',
  'education',
  'skills',
  'links',
  'projects',
  'complete',
];

const STEP_INFO: Record<ReviewStep, { title: string; description: string; icon: typeof User }> = {
  profile: {
    title: 'Basic Info',
    description: 'Review your name, headline, and summary',
    icon: User,
  },
  contact: {
    title: 'Contact Details',
    description: 'Choose which contact info to display on your profile',
    icon: Mail,
  },
  experience: {
    title: 'Work Experience',
    description: 'Review and edit your work history',
    icon: Briefcase,
  },
  education: {
    title: 'Education',
    description: 'Review your educational background',
    icon: GraduationCap,
  },
  skills: {
    title: 'Skills',
    description: 'Review your skills and expertise',
    icon: Wrench,
  },
  links: {
    title: 'Links',
    description: 'Add your social and portfolio links',
    icon: LinkIcon,
  },
  projects: {
    title: 'Projects',
    description: 'Review your GitHub repositories and projects',
    icon: FolderGit2,
  },
  complete: {
    title: 'All Done!',
    description: 'Your profile is ready',
    icon: Check,
  },
};

// Generate unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// Valid link types for the dropdown
type LinkType =
  | 'GITHUB'
  | 'LINKEDIN'
  | 'TWITTER'
  | 'PORTFOLIO'
  | 'BLOG'
  | 'DRIBBBLE'
  | 'BEHANCE'
  | 'YOUTUBE'
  | 'OTHER';

/**
 * Detect link type from URL
 * This ensures proper categorization regardless of what the parser returns
 */
function detectLinkType(url: string, parsedType?: string): LinkType {
  if (!url) return 'OTHER';

  const lowerUrl = url.toLowerCase();

  // Check URL patterns to determine type
  if (lowerUrl.includes('github.com') || lowerUrl.includes('github.io')) {
    return 'GITHUB';
  }
  if (lowerUrl.includes('linkedin.com')) {
    return 'LINKEDIN';
  }
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
    return 'TWITTER';
  }
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    return 'YOUTUBE';
  }
  if (lowerUrl.includes('dribbble.com')) {
    return 'DRIBBBLE';
  }
  if (lowerUrl.includes('behance.net')) {
    return 'BEHANCE';
  }
  if (
    lowerUrl.includes('medium.com') ||
    lowerUrl.includes('dev.to') ||
    lowerUrl.includes('hashnode.')
  ) {
    return 'BLOG';
  }

  // If URL doesn't match known patterns, try to use parsed type (normalized to uppercase)
  if (parsedType) {
    const upperType = parsedType.toUpperCase();
    const validTypes: LinkType[] = [
      'GITHUB',
      'LINKEDIN',
      'TWITTER',
      'PORTFOLIO',
      'BLOG',
      'DRIBBBLE',
      'BEHANCE',
      'YOUTUBE',
      'OTHER',
    ];
    if (validTypes.includes(upperType as LinkType)) {
      return upperType as LinkType;
    }
    // Map common variations
    if (upperType === 'WEBSITE' || upperType === 'PERSONAL') {
      return 'PORTFOLIO';
    }
  }

  // Default to PORTFOLIO for generic URLs, OTHER if nothing matches
  if (lowerUrl.startsWith('http')) {
    return 'PORTFOLIO';
  }

  return 'OTHER';
}

/**
 * Build emails list combining Clerk emails (verified) and imported emails (unverified).
 * Clerk emails are the source of truth for verified emails.
 */
function buildEmailsList(
  clerkEmails: Array<{
    id: string;
    email: string;
    verified: boolean;
    isPrimary: boolean;
  }>,
  importedEmails: Array<{ email: string; source: string }>
): Array<{
  email: string;
  source: string;
  clerkEmailId?: string;
  verified: boolean;
}> {
  const result: Array<{
    email: string;
    source: string;
    clerkEmailId?: string;
    verified: boolean;
  }> = [];
  const seen = new Set<string>();

  // Add Clerk emails first (these are verified or pending verification)
  for (const clerkEmail of clerkEmails) {
    result.push({
      email: clerkEmail.email,
      source: clerkEmail.isPrimary ? 'SIGNUP' : 'MANUAL',
      clerkEmailId: clerkEmail.id,
      verified: clerkEmail.verified,
    });
    seen.add(clerkEmail.email.toLowerCase());
  }

  // Add imported emails that aren't already in Clerk (these will need to be added/verified)
  for (const entry of importedEmails) {
    const normalized = entry.email.toLowerCase().trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push({
        email: entry.email,
        source: entry.source,
        clerkEmailId: undefined, // Not in Clerk yet
        verified: false,
      });
    }
  }

  return result;
}

function ReviewPageContent() {
  const router = useRouter();
  const { user } = useUser();

  // Wrap Clerk email operations with reverification to handle step-up auth automatically
  // This will show a modal asking user to re-enter password if needed
  const createEmailWithReverification = useReverification(async (email: string) => {
    if (!user) throw new Error('User not found');
    const newEmail = await user.createEmailAddress({ email });
    await newEmail.prepareVerification({ strategy: 'email_code' });
    return newEmail;
  });

  // Wrap setting primary email with reverification
  const setPrimaryEmailWithReverification = useReverification(async (emailId: string) => {
    if (!user) throw new Error('User not found');
    await user.update({ primaryEmailAddressId: emailId });
    return true;
  });

  const [currentStep, setCurrentStep] = useState<ReviewStep>('profile');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email operation states
  const [emailOperationLoading, setEmailOperationLoading] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Review data state
  const [data, setData] = useState<ReviewData>({
    profile: {},
    experiences: [],
    educations: [],
    skills: [],
    links: [],
    projects: [],
  });

  // Editing states
  const [editingExperienceId, setEditingExperienceId] = useState<string | null>(null);
  const [editingEducationId, setEditingEducationId] = useState<string | null>(null);

  // Manual contact input states
  const [newEmailInput, setNewEmailInput] = useState('');
  const [newPhoneInput, setNewPhoneInput] = useState<PhoneValue>({ countryCode: null, number: '' });
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [showPhoneInput, setShowPhoneInput] = useState(false);

  // Phone editing state
  const [editingPhoneIndex, setEditingPhoneIndex] = useState<number | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState<PhoneValue>({
    countryCode: null,
    number: '',
  });

  // Verification code state (for emails pending verification)
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyingEmailId, setVerifyingEmailId] = useState<string | null>(null);

  // Get signup email from Clerk (always primary)
  const signupEmail = user?.primaryEmailAddress?.emailAddress;

  // Load parsed data from sessionStorage or URL
  useEffect(() => {
    const loadData = async () => {
      try {
        // Try to get data from sessionStorage
        const storedData = sessionStorage.getItem('onboarding_parsed_resume');

        if (storedData) {
          const parsed = JSON.parse(storedData);

          // Check if avatarUrl is stored in IndexedDB (for large uploaded photos)
          let avatarUrl = parsed.profile?.avatarUrl;
          if (avatarUrl?.startsWith('indexeddb:')) {
            const photoKey = avatarUrl.replace('indexeddb:', '');
            const photoData = await getPhotoFromIndexedDB(photoKey);
            avatarUrl = photoData || undefined;
          }

          // Transform to our format with IDs and convert dates to YYYY-MM format
          const transformedData: ReviewData = {
            profile: { ...parsed.profile, avatarUrl },
            experiences: (parsed.experiences || []).map((exp: Record<string, unknown>) => ({
              id: generateId(),
              company: exp.company || '',
              role: exp.role || '',
              location: exp.location,
              startDate: toMonthInputFormat(exp.startDate as string),
              endDate: toMonthInputFormat(exp.endDate as string),
              isCurrent: exp.isCurrent,
              bullets: exp.bullets as string[] | undefined,
            })),
            educations: (parsed.educations || []).map((edu: Record<string, unknown>) => ({
              id: generateId(),
              institution: edu.institution || '',
              degree: edu.degree,
              fieldOfStudy: edu.fieldOfStudy,
              startDate: toMonthInputFormat(edu.startDate as string),
              endDate: toMonthInputFormat(edu.endDate as string),
              gpa: edu.gpa,
            })),
            skills: (parsed.skills || []).map((skill: string | { name: string }) => ({
              id: generateId(),
              name: typeof skill === 'string' ? skill : skill.name,
            })),
            links: (parsed.links || []).map((link: Record<string, unknown>) => ({
              id: generateId(),
              type: detectLinkType(link.url as string, link.type as string),
              url: link.url as string,
              label: link.label as string | undefined,
            })),
            // Transform projects with smart visibility defaults
            projects: (parsed.projects || []).map((proj: Record<string, unknown>) => {
              const title = (proj.title as string) || (proj.name as string) || 'Untitled';
              const description = proj.description as string | undefined;
              const isPinned = (proj.ghPinned as boolean) || (proj.pinned as boolean) || false;
              const stars = (proj.ghStars as number) || (proj.stars as number) || 0;
              const forks = (proj.ghForks as number) || (proj.forks as number) || 0;
              const repoUrl = proj.repoUrl as string | undefined;

              // Smart visibility defaults
              const lowQualityPatterns = [
                /^test$/i,
                /^testing$/i,
                /^my-?first/i,
                /^hello-?world/i,
                /^learn/i,
                /^tutorial/i,
                /^practice/i,
                /^playground/i,
                /^experiment/i,
                /^sandbox/i,
                /^temp$/i,
                /^tmp$/i,
                /^scratch/i,
                /^demo$/i,
                /^example$/i,
                /^sample$/i,
                /^dotfiles$/i,
                /^config$/i,
                /^\.[a-z]+$/,
              ];

              const isFork = repoUrl?.includes('/fork/') || false;
              const isLowQuality =
                isFork ||
                lowQualityPatterns.some((p) => p.test(title)) ||
                (!description && stars < 1 && !isPinned);
              const isHighQuality =
                isPinned || stars >= 5 || (description && description.length > 30);

              return {
                id: generateId(),
                title,
                description,
                technologies: (proj.technologies as string[]) || [],
                repoUrl,
                liveUrl: proj.liveUrl as string | undefined,
                ghStars: stars,
                ghForks: forks,
                ghLanguage: proj.ghLanguage as string | undefined,
                ghPinned: isPinned,
                ghTopics: (proj.ghTopics as string[]) || [],
                ghOwner: proj.ghOwner as string | undefined,
                ghRepo: proj.ghRepo as string | undefined,
                ghReadme: proj.ghReadme as string | undefined,
                ghLastPush: proj.ghLastPush as string | undefined,
                ghLicense: proj.ghLicense as string | undefined,
                ghWatchers: proj.ghWatchers as number | undefined,
                // Visibility defaults
                isVisible: !isLowQuality,
                showOnPortfolio: !isLowQuality,
                showOnResume: isHighQuality || stars >= 2,
                showStats: stars >= 3 || forks >= 2,
                showReadme: isPinned,
                source: repoUrl?.includes('github.com') ? 'GITHUB' : 'RESUME',
              };
            }),
            contactInfo: {
              ...parsed.contactInfo,
              // allEmails will be built from Clerk + imported emails in useEffect
              allEmails: parsed.contactInfo?.allEmails || [],
              primaryEmailIndex: 0, // Primary email index
              // Ensure allPhones is populated from phone if not present
              allPhones:
                parsed.contactInfo?.allPhones?.length > 0
                  ? parsed.contactInfo.allPhones
                  : parsed.contactInfo?.phone
                    ? [{ phone: parsed.contactInfo.phone, source: 'RESUME' }]
                    : [],
              primaryPhoneIndex: 0, // First phone is default primary
            },
            // Load allNames from all import sources (signup, resume, linkedin, github)
            allNames: parsed.allNames || [],
          };

          setData(transformedData);
        }
      } catch (err) {
        console.error('Failed to load parsed data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build emails list from Clerk + imported emails
  useEffect(() => {
    if (!user || isLoading) return;

    // Get Clerk emails with verification status
    const clerkEmails = user.emailAddresses.map((emailAddr) => ({
      id: emailAddr.id,
      email: emailAddr.emailAddress,
      verified: emailAddr.verification?.status === 'verified',
      isPrimary: emailAddr.id === user.primaryEmailAddressId,
    }));

    // Get imported emails from data (excluding any that match Clerk emails)
    const importedEmails =
      data.contactInfo?.allEmails?.filter(
        (e) =>
          !e.clerkEmailId &&
          !clerkEmails.some((c) => c.email.toLowerCase() === e.email.toLowerCase())
      ) || [];

    // Build combined list
    const combinedEmails = buildEmailsList(clerkEmails, importedEmails);

    // Find the primary email index (the one that matches Clerk's primary)
    const primaryClerkEmail = clerkEmails.find((e) => e.isPrimary);
    const primaryIndex = primaryClerkEmail
      ? combinedEmails.findIndex(
          (e) => e.email.toLowerCase() === primaryClerkEmail.email.toLowerCase()
        )
      : 0;

    setData((prev) => ({
      ...prev,
      contactInfo: {
        ...prev.contactInfo,
        allEmails: combinedEmails,
        primaryEmailIndex: primaryIndex >= 0 ? primaryIndex : 0,
        email: combinedEmails[primaryIndex >= 0 ? primaryIndex : 0]?.email,
      },
    }));
  }, [user, isLoading]);

  const currentStepIndex = STEPS.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const goToNextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  };

  const goToPreviousStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Get handle from sessionStorage or generate one
      const storedHandle = sessionStorage.getItem('onboarding_handle');
      const firstName = data.profile.firstName || 'User';
      const lastName = data.profile.lastName || '';

      // Handle avatar upload to Clerk directly from client
      const avatarUrl = data.profile.avatarUrl;
      const profileForApi = { ...data.profile };

      // Keep the original full-resolution data URL for permanent storage.
      // Clerk gets a compressed 512×512 copy; the server stores the original
      // in ProfilePhoto and serves it via /api/photos/[id] for the portfolio.
      let originalAvatarDataUrl: string | undefined;

      if (avatarUrl?.startsWith('data:')) {
        originalAvatarDataUrl = avatarUrl;
        console.log('[Review] Uploading avatar directly to Clerk...');
        try {
          // Convert base64 to File and compress
          const originalFile = await base64ToFile(avatarUrl, 'avatar.jpg');
          const compressedFile = await compressImageForClerk(originalFile);

          // Upload to Clerk using the user object
          await user?.setProfileImage({ file: compressedFile });
          console.log('[Review] Successfully uploaded avatar to Clerk');

          // Always use the canonical user.imageUrl after a successful upload.
          // imageResource.publicUrl is version-specific and becomes invalid if
          // the image is re-synced server-side. user.imageUrl is the stable,
          // canonical URL that Clerk keeps up-to-date.
          await user?.reload();
          if (user?.imageUrl) {
            profileForApi.avatarUrl = user.imageUrl;
            console.log('[Review] Clerk canonical image URL:', user.imageUrl);
          } else {
            console.warn('[Review] No avatar URL available from Clerk after upload');
            delete profileForApi.avatarUrl;
          }
        } catch (uploadErr) {
          console.error('[Review] Failed to upload avatar to Clerk:', uploadErr);
          // Fallback: try to use current Clerk image URL instead of losing the avatar
          if (user?.imageUrl) {
            profileForApi.avatarUrl = user.imageUrl;
            console.log('[Review] Using existing user.imageUrl as fallback:', user.imageUrl);
          } else {
            delete profileForApi.avatarUrl;
          }
        }
      }

      // Sync name to Clerk to ensure consistency between Follio and Clerk
      // This updates Clerk's profile to match what the user confirmed in Follio
      try {
        console.log('[Review] Syncing name to Clerk:', firstName, lastName);
        await user?.update({
          firstName: firstName,
          lastName: lastName || undefined,
        });
        console.log('[Review] Successfully synced name to Clerk');
      } catch (nameErr) {
        console.error('[Review] Failed to sync name to Clerk:', nameErr);
        // Continue with save - name sync is not critical
      }

      // Retrieve the resume filename stored during import step
      const storedParsed = sessionStorage.getItem('onboarding_parsed_resume');
      const resumeFileName = storedParsed ? JSON.parse(storedParsed)?._resumeFileName : null;

      // Retrieve gallery photos from IndexedDB
      const galleryPhotoRefs: string[] = storedParsed
        ? JSON.parse(storedParsed)?.galleryPhotos || []
        : [];
      const resolvedGalleryPhotos: string[] = [];
      for (const ref of galleryPhotoRefs) {
        if (ref.startsWith('indexeddb:')) {
          const key = ref.replace('indexeddb:', '');
          const photoData = await getPhotoFromIndexedDB(key);
          if (photoData) resolvedGalleryPhotos.push(photoData);
        } else {
          resolvedGalleryPhotos.push(ref);
        }
      }

      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          handle: storedHandle,
          resumeFileName: resumeFileName || undefined,
          galleryPhotos: resolvedGalleryPhotos.length > 0 ? resolvedGalleryPhotos : undefined,
          // Original full-resolution avatar for permanent storage (separate from Clerk)
          originalAvatarDataUrl: originalAvatarDataUrl || undefined,
          // When adding a new resume from builder, target the specific blank profile
          targetProfileId: sessionStorage.getItem('importTargetProfileId') || undefined,
          reviewedData: {
            profile: profileForApi,
            experiences: data.experiences,
            educations: data.educations,
            skills: data.skills.map((s) => s.name),
            links: data.links,
            contactInfo: data.contactInfo,
            // Include projects with visibility settings
            projects: data.projects.map((p) => ({
              title: p.title,
              description: p.description,
              technologies: p.technologies,
              repoUrl: p.repoUrl,
              liveUrl: p.liveUrl,
              ghStars: p.ghStars,
              ghForks: p.ghForks,
              ghLanguage: p.ghLanguage,
              ghPinned: p.ghPinned,
              ghTopics: p.ghTopics,
              ghOwner: p.ghOwner,
              ghRepo: p.ghRepo,
              ghReadme: p.ghReadme,
              ghLastPush: p.ghLastPush,
              ghLicense: p.ghLicense,
              ghWatchers: p.ghWatchers,
              isVisible: p.isVisible,
              showOnPortfolio: p.showOnPortfolio,
              showOnResume: p.showOnResume,
              showStats: p.showStats,
              showReadme: p.showReadme,
              customDescription: p.customDescription,
            })),
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save profile');
      }

      // Clear session data and IndexedDB photos
      sessionStorage.removeItem('onboarding_parsed_resume');
      sessionStorage.removeItem('onboarding_handle');
      sessionStorage.removeItem('importTargetProfileId');
      await clearPhotosFromIndexedDB();

      // Check if there's a return URL (e.g., coming from builder's "New resume from upload")
      const returnUrl = sessionStorage.getItem('importReturnUrl');
      sessionStorage.removeItem('importReturnUrl');

      // Redirect to return URL or default to profile
      router.refresh();
      router.push(returnUrl || '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  };

  // Profile update handlers
  const updateProfile = (field: keyof ParsedProfile, value: string) => {
    setData((prev) => ({
      ...prev,
      profile: { ...prev.profile, [field]: value },
    }));
  };

  // Contact info update handlers
  const _updateContactInfo = (field: 'email' | 'phone', value: string) => {
    setData((prev) => ({
      ...prev,
      contactInfo: { ...prev.contactInfo, [field]: value },
    }));
  };

  // Set primary email - must be verified in Clerk
  // Uses reverification wrapper which will show password prompt if needed
  const setPrimaryEmailClerk = async (index: number) => {
    const allEmails = data.contactInfo?.allEmails || [];
    const emailEntry = allEmails[index];
    if (!emailEntry) return;

    // Check if verified
    if (!emailEntry.verified) {
      setEmailError('Email must be verified before setting as primary. Click "Verify" first.');
      return;
    }

    // Check if it's a Clerk email
    if (!emailEntry.clerkEmailId) {
      setEmailError('This email needs to be added to your account first. Click "Add & Verify".');
      return;
    }

    setEmailOperationLoading(emailEntry.email);
    setEmailError(null);

    try {
      // Set as primary in Clerk using reverification wrapper
      await setPrimaryEmailWithReverification(emailEntry.clerkEmailId);

      // Reload user to get updated state
      await user?.reload();

      // Update local state
      setData((prev) => ({
        ...prev,
        contactInfo: {
          ...prev.contactInfo,
          primaryEmailIndex: index,
          email: emailEntry.email,
        },
      }));
    } catch (err) {
      console.error('Failed to set primary email:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to set primary email';
      // Handle cancellation (user closed the reverification modal)
      if (errorMessage.includes('cancelled') || errorMessage.includes('canceled')) {
        setEmailError(null); // User cancelled, no error
      } else {
        setEmailError(errorMessage);
      }
    } finally {
      setEmailOperationLoading(null);
    }
  };

  // Add email to Clerk (triggers verification)
  // Uses reverification wrapper which will show password prompt if needed
  const addEmailToClerk = async (email: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !user) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    // Check for duplicates
    const allEmails = data.contactInfo?.allEmails || [];
    const isDuplicate = allEmails.some((e) => e.email.toLowerCase() === trimmedEmail);
    if (isDuplicate) {
      setEmailError('This email is already in your list');
      return;
    }

    setEmailOperationLoading(trimmedEmail);
    setEmailError(null);

    try {
      // Use reverification-wrapped function - this will show password modal if needed
      await createEmailWithReverification(trimmedEmail);

      // Reload user to get updated state
      await user.reload();

      setNewEmailInput('');
      setShowEmailInput(false);
      setEmailError('Verification email sent! Check your inbox and enter the code.');
    } catch (err) {
      console.error('Failed to add email:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to add email';
      // Handle cancellation (user closed the reverification modal)
      if (errorMessage.includes('cancelled') || errorMessage.includes('canceled')) {
        setEmailError(null); // User cancelled, no error
      } else if (errorMessage.includes('already exists') || errorMessage.includes('taken')) {
        setEmailError('This email is already associated with another account.');
      } else {
        setEmailError(errorMessage);
      }
    } finally {
      setEmailOperationLoading(null);
    }
  };

  // Verify email with code
  const verifyEmailCode = async (clerkEmailId: string, code: string) => {
    if (!user) return;

    setEmailOperationLoading(clerkEmailId);
    setEmailError(null);

    try {
      const emailAddr = user.emailAddresses.find((e) => e.id === clerkEmailId);
      if (!emailAddr) throw new Error('Email not found');

      await emailAddr.attemptVerification({ code });

      // Reload user to get updated state
      await user.reload();

      setEmailError(null);
    } catch (err) {
      console.error('Failed to verify email:', err);
      setEmailError(err instanceof Error ? err.message : 'Invalid verification code');
    } finally {
      setEmailOperationLoading(null);
    }
  };

  // Resend verification code
  const resendVerificationCode = async (clerkEmailId: string) => {
    if (!user) return;

    setEmailOperationLoading(clerkEmailId);
    setEmailError(null);

    try {
      const emailAddr = user.emailAddresses.find((e) => e.id === clerkEmailId);
      if (!emailAddr) throw new Error('Email not found');

      await emailAddr.prepareVerification({ strategy: 'email_code' });

      setEmailError('Verification code sent! Check your inbox.');
    } catch (err) {
      console.error('Failed to resend verification:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to resend verification code';
      if (errorMessage.includes('additional verification')) {
        setEmailError(
          'Clerk requires session verification. Please sign out and sign back in, then try again.'
        );
      } else {
        setEmailError(errorMessage);
      }
    } finally {
      setEmailOperationLoading(null);
    }
  };

  // Delete email from Clerk
  const deleteEmailFromClerk = async (index: number) => {
    const allEmails = data.contactInfo?.allEmails || [];
    const emailEntry = allEmails[index];
    if (!emailEntry || !user) return;

    // Don't allow deleting the primary email
    const currentPrimaryIndex = data.contactInfo?.primaryEmailIndex ?? 0;
    if (index === currentPrimaryIndex) {
      setEmailError('Cannot delete primary email. Set another email as primary first.');
      return;
    }

    setEmailOperationLoading(emailEntry.email);
    setEmailError(null);

    try {
      // If it's a Clerk email, delete from Clerk
      if (emailEntry.clerkEmailId) {
        const clerkEmailAddr = user.emailAddresses.find((e) => e.id === emailEntry.clerkEmailId);
        if (clerkEmailAddr) {
          await clerkEmailAddr.destroy();
        }
        await user.reload();
      }

      // Update local state
      setData((prev) => {
        const newEmails = (prev.contactInfo?.allEmails || []).filter((_, i) => i !== index);
        const currentIdx = prev.contactInfo?.primaryEmailIndex ?? 0;
        let newPrimaryIndex = currentIdx;
        if (index < currentIdx) {
          newPrimaryIndex = currentIdx - 1;
        }

        return {
          ...prev,
          contactInfo: {
            ...prev.contactInfo,
            allEmails: newEmails,
            primaryEmailIndex: newPrimaryIndex,
            email: newEmails[newPrimaryIndex]?.email,
          },
        };
      });
    } catch (err) {
      console.error('Failed to delete email:', err);
      setEmailError(err instanceof Error ? err.message : 'Failed to delete email');
    } finally {
      setEmailOperationLoading(null);
    }
  };

  // Set primary phone by index - simply update the primaryPhoneIndex
  const setPrimaryPhone = (index: number) => {
    setData((prev) => {
      const allPhones = prev.contactInfo?.allPhones || [];
      if (index < 0 || index >= allPhones.length) return prev;

      return {
        ...prev,
        contactInfo: {
          ...prev.contactInfo,
          primaryPhoneIndex: index,
          phone: allPhones[index].phone, // Update the primary phone field for backward compat
        },
      };
    });
  };

  // Delete phone from list
  const deletePhone = (index: number) => {
    setData((prev) => {
      const allPhones = prev.contactInfo?.allPhones || [];
      if (index < 0 || index >= allPhones.length) return prev;

      const currentPrimaryIndex = prev.contactInfo?.primaryPhoneIndex ?? 0;
      // Don't allow deleting primary phone
      if (index === currentPrimaryIndex && allPhones.length > 1) {
        return prev;
      }

      const newPhones = allPhones.filter((_, i) => i !== index);

      // Adjust primary index if needed
      let newPrimaryIndex = currentPrimaryIndex;
      if (index < currentPrimaryIndex) {
        newPrimaryIndex = currentPrimaryIndex - 1;
      } else if (index === currentPrimaryIndex) {
        newPrimaryIndex = 0;
      }

      return {
        ...prev,
        contactInfo: {
          ...prev.contactInfo,
          allPhones: newPhones,
          primaryPhoneIndex: newPrimaryIndex,
          phone: newPhones[newPrimaryIndex]?.phone,
        },
      };
    });
  };

  // Add phone manually
  const addPhone = (phoneValue: PhoneValue) => {
    if (!phoneValue.number.trim()) return;

    setData((prev) => {
      const allPhones = prev.contactInfo?.allPhones || [];

      // Check for duplicates
      const normalizePhone = (p: string) => p.replace(/\D/g, '');
      const newPhoneNormalized = normalizePhone(phoneValue.number);
      const isDuplicate = allPhones.some((p) => {
        const existingNumber = p.number || p.phone || '';
        return normalizePhone(existingNumber) === newPhoneNormalized;
      });
      if (isDuplicate) return prev;

      return {
        ...prev,
        contactInfo: {
          ...prev.contactInfo,
          allPhones: [
            ...allPhones,
            {
              countryCode: phoneValue.countryCode,
              number: phoneValue.number,
              phone: formatPhoneValue(phoneValue), // Legacy field for backward compat
              source: 'MANUAL',
            },
          ],
        },
      };
    });

    setNewPhoneInput({ countryCode: null, number: '' });
    setShowPhoneInput(false);
  };

  // Start editing a phone
  const startEditPhone = (index: number) => {
    const phone = data.contactInfo?.allPhones?.[index];
    if (phone) {
      setEditingPhoneIndex(index);
      setEditingPhoneValue({
        countryCode: phone.countryCode || null,
        number: phone.number || phone.phone || '',
      });
    }
  };

  // Cancel editing phone
  const cancelEditPhone = () => {
    setEditingPhoneIndex(null);
    setEditingPhoneValue({ countryCode: null, number: '' });
  };

  // Save edited phone
  const saveEditPhone = () => {
    if (editingPhoneIndex === null) return;

    setData((prev) => {
      const allPhones = [...(prev.contactInfo?.allPhones || [])];
      if (editingPhoneIndex >= 0 && editingPhoneIndex < allPhones.length) {
        allPhones[editingPhoneIndex] = {
          ...allPhones[editingPhoneIndex],
          countryCode: editingPhoneValue.countryCode,
          number: editingPhoneValue.number,
          phone: formatPhoneValue(editingPhoneValue), // Update legacy field
        };
      }
      return {
        ...prev,
        contactInfo: {
          ...prev.contactInfo,
          allPhones,
        },
      };
    });

    setEditingPhoneIndex(null);
    setEditingPhoneValue({ countryCode: null, number: '' });
  };

  // Experience handlers
  const updateExperience = (id: string, updates: Partial<ParsedExperience>) => {
    setData((prev) => ({
      ...prev,
      experiences: prev.experiences.map((exp) => (exp.id === id ? { ...exp, ...updates } : exp)),
    }));
  };

  const deleteExperience = (id: string) => {
    setData((prev) => ({
      ...prev,
      experiences: prev.experiences.filter((exp) => exp.id !== id),
    }));
  };

  const addExperience = () => {
    const newExp: ParsedExperience = {
      id: generateId(),
      company: '',
      role: '',
    };
    setData((prev) => ({
      ...prev,
      experiences: [...prev.experiences, newExp],
    }));
    setEditingExperienceId(newExp.id);
  };

  // Education handlers
  const updateEducation = (id: string, updates: Partial<ParsedEducation>) => {
    setData((prev) => ({
      ...prev,
      educations: prev.educations.map((edu) => (edu.id === id ? { ...edu, ...updates } : edu)),
    }));
  };

  const deleteEducation = (id: string) => {
    setData((prev) => ({
      ...prev,
      educations: prev.educations.filter((edu) => edu.id !== id),
    }));
  };

  const addEducation = () => {
    const newEdu: ParsedEducation = {
      id: generateId(),
      institution: '',
    };
    setData((prev) => ({
      ...prev,
      educations: [...prev.educations, newEdu],
    }));
    setEditingEducationId(newEdu.id);
  };

  // Skill handlers
  const deleteSkill = (id: string) => {
    setData((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s.id !== id),
    }));
  };

  const addSkill = (name: string) => {
    if (!name.trim()) return;
    setData((prev) => ({
      ...prev,
      skills: [...prev.skills, { id: generateId(), name: name.trim() }],
    }));
  };

  // Link handlers
  // Check if a URL already exists in the links (excluding a specific link by id)
  const isUrlDuplicate = (url: string, excludeId?: string): boolean => {
    if (!url.trim()) return false;
    const normalizedUrl = url.toLowerCase().trim();
    return data.links.some(
      (link) => link.id !== excludeId && link.url.toLowerCase().trim() === normalizedUrl
    );
  };

  const updateLink = (id: string, updates: Partial<ParsedLink>) => {
    // If updating URL, check for duplicates
    if (updates.url !== undefined && isUrlDuplicate(updates.url, id)) {
      // Don't update if it's a duplicate - the LinkCard will show the error
      return;
    }
    setData((prev) => ({
      ...prev,
      links: prev.links.map((link) => (link.id === id ? { ...link, ...updates } : link)),
    }));
  };

  const deleteLink = (id: string) => {
    setData((prev) => ({
      ...prev,
      links: prev.links.filter((link) => link.id !== id),
    }));
  };

  const addLink = () => {
    setData((prev) => ({
      ...prev,
      links: [...prev.links, { id: generateId(), type: 'OTHER', url: '' }],
    }));
  };

  // Project handlers
  const updateProject = (id: string, updates: Partial<ParsedProject>) => {
    setData((prev) => ({
      ...prev,
      projects: prev.projects.map((proj) => (proj.id === id ? { ...proj, ...updates } : proj)),
    }));
  };

  const toggleProjectVisibility = (
    id: string,
    field: 'isVisible' | 'showOnPortfolio' | 'showOnResume' | 'showStats' | 'showReadme'
  ) => {
    setData((prev) => ({
      ...prev,
      projects: prev.projects.map((proj) =>
        proj.id === id ? { ...proj, [field]: !proj[field] } : proj
      ),
    }));
  };

  const deleteProject = (id: string) => {
    setData((prev) => ({
      ...prev,
      projects: prev.projects.filter((proj) => proj.id !== id),
    }));
  };

  // Batch operations for projects
  const showAllProjects = () => {
    setData((prev) => ({
      ...prev,
      projects: prev.projects.map((proj) => ({ ...proj, isVisible: true, showOnPortfolio: true })),
    }));
  };

  const hideAllProjects = () => {
    setData((prev) => ({
      ...prev,
      projects: prev.projects.map((proj) => ({
        ...proj,
        isVisible: false,
        showOnPortfolio: false,
        showOnResume: false,
      })),
    }));
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      {/* Progress bar */}
      <div className="fixed left-0 right-0 top-16 z-40 h-1 bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Step indicators */}
      <div className="fixed left-0 right-0 top-20 z-30">
        <div className="mx-auto flex max-w-md justify-center gap-2 px-4">
          {STEPS.slice(0, -1).map((step, index) => (
            <button
              key={step}
              onClick={() => setCurrentStep(step)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all ${
                index < currentStepIndex
                  ? 'bg-primary text-primary-foreground'
                  : index === currentStepIndex
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {index < currentStepIndex ? <Check className="h-4 w-4" /> : index + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-16 pt-20">
        <AnimatePresence mode="wait">
          {/* Profile Step */}
          {currentStep === 'profile' && (
            <StepContainer key="profile">
              <StepHeader
                icon={STEP_INFO.profile.icon}
                title={STEP_INFO.profile.title}
                description={STEP_INFO.profile.description}
              />

              <div className="space-y-4">
                {/* Show name sources if multiple unique names available */}
                {(() => {
                  // Compute unique names by combining firstName + lastName
                  const uniqueNamesMap = new Map<
                    string,
                    { firstName: string; lastName: string; sources: string[] }
                  >();

                  if (data.allNames) {
                    for (const nameEntry of data.allNames) {
                      const firstName = (nameEntry.firstName || '').trim();
                      const lastName = (nameEntry.lastName || '').trim();
                      const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;

                      if (key === '|') continue; // Skip empty names

                      if (uniqueNamesMap.has(key)) {
                        // Add source to existing entry
                        const existing = uniqueNamesMap.get(key)!;
                        if (!existing.sources.includes(nameEntry.source)) {
                          existing.sources.push(nameEntry.source);
                        }
                      } else {
                        uniqueNamesMap.set(key, {
                          firstName,
                          lastName,
                          sources: [nameEntry.source],
                        });
                      }
                    }
                  }

                  const uniqueNames = Array.from(uniqueNamesMap.values());

                  // Only show the list if there are multiple unique names
                  if (uniqueNames.length <= 1) return null;

                  return (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                      <label className="mb-2 block text-sm font-medium text-primary">
                        We found different names from your imports. Select one or edit below:
                      </label>
                      <div className="space-y-2">
                        {uniqueNames.map((nameEntry, idx) => {
                          const fullName = `${nameEntry.firstName} ${nameEntry.lastName}`.trim();
                          const isSelected =
                            data.profile.firstName === nameEntry.firstName &&
                            data.profile.lastName === nameEntry.lastName;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setData((prev) => ({
                                  ...prev,
                                  profile: {
                                    ...prev.profile,
                                    firstName: nameEntry.firstName,
                                    lastName: nameEntry.lastName,
                                  },
                                }));
                              }}
                              className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                                isSelected
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border bg-background hover:bg-muted/30'
                              }`}
                            >
                              <span className="font-medium">{fullName || 'No name'}</span>
                              <span className="text-xs text-muted-foreground">
                                {nameEntry.sources.join(', ')}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">First Name</label>
                    <Input
                      value={data.profile.firstName || ''}
                      onChange={(e) => updateProfile('firstName', e.target.value)}
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Last Name</label>
                    <Input
                      value={data.profile.lastName || ''}
                      onChange={(e) => updateProfile('lastName', e.target.value)}
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Headline</label>
                  <Input
                    value={data.profile.headline || ''}
                    onChange={(e) => updateProfile('headline', e.target.value)}
                    placeholder="Software Engineer at Google"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Location</label>
                  <Input
                    value={data.profile.location || ''}
                    onChange={(e) => updateProfile('location', e.target.value)}
                    placeholder="San Francisco, CA"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Summary</label>
                  <Textarea
                    value={data.profile.summary || ''}
                    onChange={(e) => updateProfile('summary', e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={4}
                  />
                </div>
              </div>

              <StepNavigation
                onBack={() => router.push('/onboarding/import')}
                onNext={goToNextStep}
                backLabel="Back"
              />
            </StepContainer>
          )}

          {/* Contact Step */}
          {currentStep === 'contact' && (
            <StepContainer key="contact">
              <StepHeader
                icon={STEP_INFO.contact.icon}
                title={STEP_INFO.contact.title}
                description={STEP_INFO.contact.description}
              />

              <div className="space-y-6">
                {/* Emails Section */}
                <div>
                  <label className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Mail className="h-4 w-4" />
                    Email Addresses
                  </label>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Manage your email addresses. The primary email is used for login and will be
                    displayed on your profile. Emails must be verified before they can be set as
                    primary.
                  </p>

                  {/* Error message */}
                  {emailError && (
                    <div className="mb-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
                      {emailError}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2 h-5 px-1"
                        onClick={() => setEmailError(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}

                  {data.contactInfo?.allEmails && data.contactInfo.allEmails.length > 0 ? (
                    <div className="space-y-2">
                      {data.contactInfo.allEmails.map((item, idx) => {
                        const isPrimary = idx === (data.contactInfo?.primaryEmailIndex ?? 0);
                        const isLoading =
                          emailOperationLoading === item.email ||
                          emailOperationLoading === item.clerkEmailId;
                        const isVerifying = verifyingEmailId === item.clerkEmailId;

                        return (
                          <div
                            key={idx}
                            className={`rounded-lg border p-3 transition-colors ${
                              isPrimary
                                ? 'border-primary/30 bg-primary/5'
                                : 'border-border bg-background'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {isPrimary && (
                                  <Star className="h-4 w-4 fill-primary text-primary" />
                                )}
                                <div>
                                  <p className={`text-sm ${isPrimary ? 'font-medium' : ''}`}>
                                    {item.email}
                                  </p>
                                  <div className="mt-0.5 flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                      {item.source.toLowerCase()}
                                    </Badge>
                                    {item.verified ? (
                                      <Badge
                                        variant="outline"
                                        className="border-green-300 bg-green-50 text-xs text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300"
                                      >
                                        <Check className="mr-1 h-3 w-3" />
                                        Verified
                                      </Badge>
                                    ) : item.clerkEmailId ? (
                                      <Badge
                                        variant="outline"
                                        className="border-yellow-300 bg-yellow-50 text-xs text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300"
                                      >
                                        Pending Verification
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="border-gray-300 text-xs text-gray-500"
                                      >
                                        Not Added
                                      </Badge>
                                    )}
                                    {isPrimary && (
                                      <span className="text-xs font-medium text-primary">
                                        Primary
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {isLoading ? (
                                  <Spinner className="h-4 w-4" />
                                ) : (
                                  <>
                                    {/* For unverified Clerk emails: show verify button */}
                                    {item.clerkEmailId && !item.verified && !isVerifying && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setVerifyingEmailId(item.clerkEmailId!);
                                          setVerificationCode('');
                                        }}
                                        className="h-7 text-xs"
                                      >
                                        Enter Code
                                      </Button>
                                    )}

                                    {/* For imported emails not in Clerk: show add & verify button */}
                                    {!item.clerkEmailId && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => addEmailToClerk(item.email)}
                                        className="h-7 text-xs"
                                      >
                                        Add & Verify
                                      </Button>
                                    )}

                                    {/* Make primary - only for verified emails */}
                                    {!isPrimary && item.verified && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPrimaryEmailClerk(idx)}
                                        className="h-7 text-xs"
                                      >
                                        <Star className="mr-1 h-3 w-3" />
                                        Make Primary
                                      </Button>
                                    )}

                                    {/* Delete - not for primary */}
                                    {!isPrimary && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => deleteEmailFromClerk(idx)}
                                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Verification code input */}
                            {isVerifying && (
                              <div className="mt-3 flex items-center gap-2 border-t pt-3">
                                <Input
                                  type="text"
                                  placeholder="Enter 6-digit code"
                                  value={verificationCode}
                                  onChange={(e) => setVerificationCode(e.target.value)}
                                  className="w-32"
                                  maxLength={6}
                                />
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    verifyEmailCode(item.clerkEmailId!, verificationCode);
                                    setVerifyingEmailId(null);
                                    setVerificationCode('');
                                  }}
                                  disabled={verificationCode.length < 6}
                                >
                                  Verify
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => resendVerificationCode(item.clerkEmailId!)}
                                >
                                  Resend
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setVerifyingEmailId(null);
                                    setVerificationCode('');
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                      No email addresses found. Add one below.
                    </div>
                  )}

                  {/* Add Email Input */}
                  {showEmailInput ? (
                    <div className="mt-3 flex items-center gap-2">
                      <Input
                        type="email"
                        placeholder="Enter email address"
                        value={newEmailInput}
                        onChange={(e) => setNewEmailInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            addEmailToClerk(newEmailInput);
                          } else if (e.key === 'Escape') {
                            setShowEmailInput(false);
                            setNewEmailInput('');
                          }
                        }}
                        className="flex-1"
                        autoFocus
                        disabled={!!emailOperationLoading}
                      />
                      <Button
                        size="sm"
                        onClick={() => addEmailToClerk(newEmailInput)}
                        disabled={!newEmailInput.trim() || !!emailOperationLoading}
                      >
                        {emailOperationLoading ? <Spinner className="h-4 w-4" /> : 'Add & Verify'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowEmailInput(false);
                          setNewEmailInput('');
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setShowEmailInput(true)}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Add Email
                    </Button>
                  )}
                </div>

                {/* Phones Section */}
                <div>
                  <label className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Phone className="h-4 w-4" />
                    Contact Phone
                  </label>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Choose which phone number to display on your public profile.
                  </p>

                  {data.contactInfo?.allPhones && data.contactInfo.allPhones.length > 0 ? (
                    <div className="space-y-2">
                      {data.contactInfo.allPhones.map((item, idx) => {
                        const isPrimary = idx === (data.contactInfo?.primaryPhoneIndex ?? 0);
                        const isEditing = editingPhoneIndex === idx;
                        // Support both new and legacy format - show only numeric code + formatted number
                        const dialCodeVal = item.countryCode
                          ? item.countryCode.includes('::')
                            ? item.countryCode.split('::')[0]
                            : item.countryCode
                          : null;
                        const rawNum = item.number || item.phone || '';
                        const displayPhone =
                          dialCodeVal && rawNum
                            ? `${dialCodeVal} ${formatStandardPhoneFn(rawNum, dialCodeVal)}`
                            : rawNum
                              ? formatStandardPhoneFn(rawNum, null)
                              : '';
                        const hasCountryCode = !!item.countryCode;

                        // Show inline editor when editing
                        if (isEditing) {
                          return (
                            <div key={idx} className="rounded-lg border border-primary p-3">
                              <div className="space-y-2">
                                <PhoneInput
                                  value={editingPhoneValue}
                                  onChange={setEditingPhoneValue}
                                  placeholder="Phone number"
                                />
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={cancelEditPhone}
                                    className="h-7 text-xs"
                                  >
                                    <X className="mr-1 h-3 w-3" />
                                    Cancel
                                  </Button>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={saveEditPhone}
                                    className="h-7 text-xs"
                                  >
                                    <Check className="mr-1 h-3 w-3" />
                                    Save
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={idx}
                            className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                              isPrimary
                                ? 'border-primary/30 bg-primary/5'
                                : 'border-border bg-background hover:bg-muted/30'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {isPrimary && <Star className="h-4 w-4 fill-primary text-primary" />}
                              <div>
                                <p className={`text-sm ${isPrimary ? 'font-medium' : ''}`}>
                                  {displayPhone}
                                </p>
                                <div className="mt-0.5 flex items-center gap-2">
                                  {!hasCountryCode && (
                                    <Badge variant="outline" className="text-xs text-amber-600">
                                      No country code
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="text-xs">
                                    {item.source.toLowerCase()}
                                  </Badge>
                                  {isPrimary && (
                                    <span className="text-xs font-medium text-primary">
                                      Display Phone
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEditPhone(idx)}
                                className="h-7 text-xs"
                                title="Edit phone number and country code"
                              >
                                <Edit2 className="mr-1 h-3 w-3" />
                                Edit
                              </Button>
                              {!isPrimary && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setPrimaryPhone(idx)}
                                  className="h-7 text-xs"
                                >
                                  <Star className="mr-1 h-3 w-3" />
                                  Use as Display
                                </Button>
                              )}
                              {!isPrimary && data.contactInfo!.allPhones!.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deletePhone(idx)}
                                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                      No phone numbers found. Add one below.
                    </div>
                  )}

                  {/* Add Phone Input */}
                  {showPhoneInput ? (
                    <div className="mt-3 space-y-2">
                      <PhoneInput
                        value={newPhoneInput}
                        onChange={setNewPhoneInput}
                        placeholder="Phone number"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => addPhone(newPhoneInput)}
                          disabled={!newPhoneInput.number.trim()}
                        >
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setShowPhoneInput(false);
                            setNewPhoneInput({ countryCode: null, number: '' });
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setShowPhoneInput(true)}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Add Phone
                    </Button>
                  )}
                </div>
              </div>

              <StepNavigation
                onBack={() => {
                  // Auto-save any pending phone edit before going back
                  if (editingPhoneIndex !== null) {
                    saveEditPhone();
                  }
                  goToPreviousStep();
                }}
                onNext={() => {
                  // Auto-save any pending phone edit before moving to next step
                  if (editingPhoneIndex !== null) {
                    saveEditPhone();
                  }
                  goToNextStep();
                }}
              />
            </StepContainer>
          )}

          {/* Experience Step */}
          {currentStep === 'experience' && (
            <StepContainer key="experience">
              <StepHeader
                icon={STEP_INFO.experience.icon}
                title={STEP_INFO.experience.title}
                description={STEP_INFO.experience.description}
                count={data.experiences.length}
              />

              {data.experiences.length === 0 ? (
                <EmptyState
                  message="No work experience found in your resume"
                  onAdd={addExperience}
                  addLabel="Add Experience"
                />
              ) : (
                <div className="space-y-3">
                  {data.experiences.map((exp) => (
                    <ExperienceCard
                      key={exp.id}
                      experience={exp}
                      isEditing={editingExperienceId === exp.id}
                      onEdit={() => setEditingExperienceId(exp.id)}
                      onSave={() => setEditingExperienceId(null)}
                      onUpdate={(updates) => updateExperience(exp.id, updates)}
                      onDelete={() => deleteExperience(exp.id)}
                    />
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addExperience}
                    className="w-full gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Another Experience
                  </Button>
                </div>
              )}

              <StepNavigation onBack={goToPreviousStep} onNext={goToNextStep} />
            </StepContainer>
          )}

          {/* Education Step */}
          {currentStep === 'education' && (
            <StepContainer key="education">
              <StepHeader
                icon={STEP_INFO.education.icon}
                title={STEP_INFO.education.title}
                description={STEP_INFO.education.description}
                count={data.educations.length}
              />

              {data.educations.length === 0 ? (
                <EmptyState
                  message="No education found in your resume"
                  onAdd={addEducation}
                  addLabel="Add Education"
                />
              ) : (
                <div className="space-y-3">
                  {data.educations.map((edu) => (
                    <EducationCard
                      key={edu.id}
                      education={edu}
                      isEditing={editingEducationId === edu.id}
                      onEdit={() => setEditingEducationId(edu.id)}
                      onSave={() => setEditingEducationId(null)}
                      onUpdate={(updates) => updateEducation(edu.id, updates)}
                      onDelete={() => deleteEducation(edu.id)}
                    />
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addEducation}
                    className="w-full gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Another Education
                  </Button>
                </div>
              )}

              <StepNavigation onBack={goToPreviousStep} onNext={goToNextStep} />
            </StepContainer>
          )}

          {/* Skills Step */}
          {currentStep === 'skills' && (
            <StepContainer key="skills">
              <StepHeader
                icon={STEP_INFO.skills.icon}
                title={STEP_INFO.skills.title}
                description={STEP_INFO.skills.description}
                count={data.skills.length}
              />

              <SkillsEditor skills={data.skills} onAdd={addSkill} onDelete={deleteSkill} />

              <StepNavigation onBack={goToPreviousStep} onNext={goToNextStep} />
            </StepContainer>
          )}

          {/* Links Step */}
          {currentStep === 'links' && (
            <StepContainer key="links">
              <StepHeader
                icon={STEP_INFO.links.icon}
                title={STEP_INFO.links.title}
                description={STEP_INFO.links.description}
                count={data.links.length}
              />

              <div className="space-y-3">
                {data.links.map((link) => (
                  <LinkCard
                    key={link.id}
                    link={link}
                    onUpdate={(updates) => updateLink(link.id, updates)}
                    onDelete={() => deleteLink(link.id)}
                    isUrlDuplicate={(url) => isUrlDuplicate(url, link.id)}
                  />
                ))}
                <Button variant="outline" size="sm" onClick={addLink} className="w-full gap-2">
                  <Plus className="h-4 w-4" />
                  Add Link
                </Button>
              </div>

              <StepNavigation onBack={goToPreviousStep} onNext={goToNextStep} />
            </StepContainer>
          )}

          {/* Projects Step */}
          {currentStep === 'projects' && (
            <StepContainer key="projects">
              <StepHeader
                icon={STEP_INFO.projects.icon}
                title={STEP_INFO.projects.title}
                description={STEP_INFO.projects.description}
                count={data.projects.filter((p) => p.isVisible).length}
              />

              {data.projects.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <FolderGit2 className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>No projects found.</p>
                  <p className="text-sm">
                    Connect GitHub to import your repositories, or add projects manually in the
                    Builder.
                  </p>
                </div>
              ) : (
                <>
                  {/* Batch actions */}
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {data.projects.filter((p) => p.isVisible).length} of {data.projects.length}{' '}
                      visible
                    </p>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={showAllProjects}>
                        <Eye className="mr-1 h-4 w-4" />
                        Show All
                      </Button>
                      <Button variant="ghost" size="sm" onClick={hideAllProjects}>
                        <EyeOff className="mr-1 h-4 w-4" />
                        Hide All
                      </Button>
                    </div>
                  </div>

                  {/* GitHub repos first, sorted by pinned then stars */}
                  <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-2">
                    {data.projects
                      .sort((a, b) => {
                        // Pinned first
                        if (a.ghPinned && !b.ghPinned) return -1;
                        if (!a.ghPinned && b.ghPinned) return 1;
                        // Then by stars
                        return (b.ghStars || 0) - (a.ghStars || 0);
                      })
                      .map((project) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          onToggleVisibility={(field) => toggleProjectVisibility(project.id, field)}
                          onUpdate={(updates) => updateProject(project.id, updates)}
                          onDelete={() => deleteProject(project.id)}
                        />
                      ))}
                  </div>
                </>
              )}

              <StepNavigation
                onBack={goToPreviousStep}
                onNext={goToNextStep}
                nextLabel="Review & Create"
              />
            </StepContainer>
          )}

          {/* Complete Step */}
          {currentStep === 'complete' && (
            <StepContainer key="complete">
              <div className="py-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.5 }}
                  className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"
                >
                  <Sparkles className="h-10 w-10 text-primary" />
                </motion.div>

                <h2 className="mb-2 text-2xl font-bold">You&apos;re All Set!</h2>
                <p className="mb-8 text-muted-foreground">
                  Your profile is ready to be created. Here&apos;s a summary:
                </p>

                <div className="mb-8 grid grid-cols-2 gap-4 text-left">
                  <SummaryCard
                    label="Profile"
                    value={
                      data.profile.firstName
                        ? `${data.profile.firstName} ${data.profile.lastName || ''}`
                        : 'Not set'
                    }
                  />
                  <SummaryCard label="Experiences" value={`${data.experiences.length} entries`} />
                  <SummaryCard label="Education" value={`${data.educations.length} entries`} />
                  <SummaryCard label="Skills" value={`${data.skills.length} skills`} />
                  <SummaryCard
                    label="Projects"
                    value={`${data.projects.filter((p) => p.isVisible).length} visible`}
                  />
                </div>

                {error && (
                  <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={goToPreviousStep} className="flex-1">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={handleSaveProfile} disabled={isSaving} className="flex-1 gap-2">
                    {isSaving ? (
                      <>
                        <Spinner size="sm" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Create My Follio
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </StepContainer>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// Wrap with Suspense for useSearchParams
export default function OnboardingReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <ReviewPageContent />
    </Suspense>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================

function StepContainer({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {children}
    </motion.div>
  );
}

function StepHeader({
  icon: Icon,
  title,
  description,
  count,
}: {
  icon: typeof User;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="h-7 w-7 text-primary" />
      </div>
      <h2 className="mb-1 text-xl font-semibold">
        {title}
        {count !== undefined && (
          <Badge variant="secondary" className="ml-2">
            {count}
          </Badge>
        )}
      </h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StepNavigation({
  onBack,
  onNext,
  backLabel = 'Back',
  nextLabel = 'Next',
  showSkip = true,
}: {
  onBack: () => void;
  onNext: () => void;
  backLabel?: string;
  nextLabel?: string;
  showSkip?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-6">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {backLabel}
      </Button>
      <div className="flex gap-2">
        {showSkip && (
          <Button variant="ghost" onClick={onNext} className="text-muted-foreground">
            Skip
          </Button>
        )}
        <Button onClick={onNext}>
          {nextLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function EmptyState({
  message,
  onAdd,
  addLabel,
}: {
  message: string;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="mb-4 text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onAdd} className="gap-2">
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}

function ExperienceCard({
  experience,
  isEditing,
  onEdit,
  onSave,
  onUpdate,
  onDelete,
}: {
  experience: ParsedExperience;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onUpdate: (updates: Partial<ParsedExperience>) => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return (
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Company *</label>
              <Input
                placeholder="e.g. Google"
                value={experience.company}
                onChange={(e) => onUpdate({ company: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Role / Title *</label>
              <Input
                placeholder="e.g. Software Engineer"
                value={experience.role}
                onChange={(e) => onUpdate({ role: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Location</label>
            <Input
              placeholder="e.g. San Francisco, CA"
              value={experience.location || ''}
              onChange={(e) => onUpdate({ location: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Start Date</label>
              <Input
                type="month"
                value={experience.startDate || ''}
                onChange={(e) => onUpdate({ startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">End Date</label>
              <Input
                type="month"
                value={experience.isCurrent ? '' : experience.endDate || ''}
                onChange={(e) => onUpdate({ endDate: e.target.value, isCurrent: false })}
                disabled={experience.isCurrent}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`current-${experience.id}`}
              checked={experience.isCurrent || false}
              onChange={(e) =>
                onUpdate({
                  isCurrent: e.target.checked,
                  endDate: e.target.checked ? undefined : experience.endDate,
                })
              }
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor={`current-${experience.id}`} className="text-sm">
              I currently work here
            </label>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Highlights</label>
            <Textarea
              placeholder="Describe your responsibilities and achievements (one per line for bullet points)..."
              value={
                experience.bullets && experience.bullets.length > 0
                  ? experience.bullets.map((b) => stripHtmlTags(b)).join('\n')
                  : ''
              }
              onChange={(e) => {
                const text = e.target.value;
                const bullets = text
                  .split('\n')
                  .map((b) => b.trim())
                  .filter((b) => b.length > 0);
                onUpdate({ bullets });
              }}
              rows={4}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Use new lines to separate bullet points
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-1 h-4 w-4" />
              Delete
            </Button>
            <Button size="sm" onClick={onSave}>
              <Check className="mr-1 h-4 w-4" />
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group relative">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h4 className="font-medium">{experience.role || 'Untitled Role'}</h4>
            <p className="text-sm text-muted-foreground">
              {experience.company || 'Unknown Company'}
              {experience.location && ` · ${experience.location}`}
            </p>
            {(experience.startDate || experience.endDate) && (
              <p className="text-xs text-muted-foreground">
                {experience.startDate || '?'} — {experience.endDate || 'Present'}
              </p>
            )}
            {experience.bullets && experience.bullets.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {experience.bullets.map((bullet, idx) =>
                  containsHtmlFormatting(bullet) ? (
                    <li key={idx} dangerouslySetInnerHTML={{ __html: bullet }} />
                  ) : (
                    <li key={idx}>{bullet}</li>
                  )
                )}
              </ul>
            )}
          </div>
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EducationCard({
  education,
  isEditing,
  onEdit,
  onSave,
  onUpdate,
  onDelete,
}: {
  education: ParsedEducation;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onUpdate: (updates: Partial<ParsedEducation>) => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return (
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Institution *</label>
            <Input
              placeholder="e.g. Stanford University"
              value={education.institution}
              onChange={(e) => onUpdate({ institution: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Degree</label>
              <Input
                placeholder="e.g. Bachelor of Science"
                value={education.degree || ''}
                onChange={(e) => onUpdate({ degree: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Field of Study</label>
              <Input
                placeholder="e.g. Computer Science"
                value={education.fieldOfStudy || ''}
                onChange={(e) => onUpdate({ fieldOfStudy: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Start Date</label>
              <Input
                type="month"
                value={education.startDate || ''}
                onChange={(e) => onUpdate({ startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">End Date</label>
              <Input
                type="month"
                value={education.endDate || ''}
                onChange={(e) => onUpdate({ endDate: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">GPA</label>
              <Input
                placeholder="e.g. 3.8"
                value={education.gpa || ''}
                onChange={(e) => onUpdate({ gpa: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-1 h-4 w-4" />
              Delete
            </Button>
            <Button size="sm" onClick={onSave}>
              <Check className="mr-1 h-4 w-4" />
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="group relative">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="font-medium">{education.degree || 'Degree'}</h4>
            <p className="text-sm text-muted-foreground">
              {education.institution || 'Unknown Institution'}
              {education.fieldOfStudy && ` · ${education.fieldOfStudy}`}
            </p>
            {(education.startDate || education.endDate) && (
              <p className="text-xs text-muted-foreground">
                {education.startDate || '?'} — {education.endDate || 'Present'}
                {education.gpa && ` · GPA: ${education.gpa}`}
              </p>
            )}
          </div>
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkillsEditor({
  skills,
  onAdd,
  onDelete,
}: {
  skills: ParsedSkill[];
  onAdd: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [newSkill, setNewSkill] = useState('');

  const handleAdd = () => {
    if (newSkill.trim()) {
      onAdd(newSkill.trim());
      setNewSkill('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <Badge
            key={skill.id}
            variant="secondary"
            className="group cursor-pointer gap-1 py-1.5 pr-1 text-sm"
            onClick={() => onDelete(skill.id)}
          >
            {skill.name}
            <span className="ml-1 rounded-full p-0.5 opacity-50 transition-opacity group-hover:bg-destructive/20 group-hover:opacity-100">
              <Trash2 className="h-3 w-3" />
            </span>
          </Badge>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Add a skill..."
          value={newSkill}
          onChange={(e) => setNewSkill(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button onClick={handleAdd} disabled={!newSkill.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Click on a skill to remove it. Press Enter or click + to add.
      </p>
    </div>
  );
}

function LinkCard({
  link,
  onUpdate,
  onDelete,
  isUrlDuplicate,
}: {
  link: ParsedLink;
  onUpdate: (updates: Partial<ParsedLink>) => void;
  onDelete: () => void;
  isUrlDuplicate: (url: string) => boolean;
}) {
  const [inputValue, setInputValue] = useState(link.url);
  const isDuplicate = inputValue.trim() && isUrlDuplicate(inputValue);

  // Auto-detect type when URL changes
  const handleUrlChange = (newUrl: string) => {
    setInputValue(newUrl);
    // Only update if not a duplicate
    if (!isUrlDuplicate(newUrl)) {
      const detectedType = detectLinkType(newUrl, link.type);
      onUpdate({ url: newUrl, type: detectedType });
    }
  };

  return (
    <Card className={isDuplicate ? 'border-destructive' : ''}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <select
            value={link.type}
            onChange={(e) => onUpdate({ type: e.target.value })}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="GITHUB">GitHub</option>
            <option value="LINKEDIN">LinkedIn</option>
            <option value="TWITTER">Twitter/X</option>
            <option value="PORTFOLIO">Portfolio</option>
            <option value="BLOG">Blog</option>
            <option value="YOUTUBE">YouTube</option>
            <option value="DRIBBBLE">Dribbble</option>
            <option value="BEHANCE">Behance</option>
            <option value="OTHER">Other</option>
          </select>
          <Input
            placeholder="URL"
            value={inputValue}
            onChange={(e) => handleUrlChange(e.target.value)}
            className={`flex-1 ${isDuplicate ? 'border-destructive' : ''}`}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {isDuplicate && (
          <p className="mt-2 text-xs text-destructive">This URL already exists in your links</p>
        )}
      </CardContent>
    </Card>
  );
}

// Project card for GitHub repos and other projects
function ProjectCard({
  project,
  onToggleVisibility,
  onUpdate,
  onDelete,
}: {
  project: ParsedProject;
  onToggleVisibility: (
    field: 'isVisible' | 'showOnPortfolio' | 'showOnResume' | 'showStats' | 'showReadme'
  ) => void;
  onUpdate: (updates: Partial<ParsedProject>) => void;
  onDelete: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isGitHub = project.source === 'GITHUB' || project.repoUrl?.includes('github.com');

  return (
    <Card className={`transition-opacity ${!project.isVisible ? 'opacity-60' : ''}`}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate font-medium">{project.title}</h4>
              {isGitHub && (
                <Badge variant="secondary" className="shrink-0 gap-1">
                  <Github className="h-3 w-3" />
                  GitHub
                </Badge>
              )}
              {project.ghPinned && (
                <Badge variant="outline" className="shrink-0 gap-1 border-amber-300 text-amber-600">
                  <Pin className="h-3 w-3" />
                  Pinned
                </Badge>
              )}
            </div>

            {/* Stats row */}
            {isGitHub && (project.ghStars || project.ghForks || project.ghLanguage) && (
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                {project.ghStars !== undefined && project.ghStars > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {project.ghStars}
                  </span>
                )}
                {project.ghForks !== undefined && project.ghForks > 0 && (
                  <span className="flex items-center gap-1">
                    <FolderGit2 className="h-3 w-3" />
                    {project.ghForks} forks
                  </span>
                )}
                {project.ghLanguage && <span>{project.ghLanguage}</span>}
              </div>
            )}

            {/* Description */}
            {project.description && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>

          {/* Main visibility toggle */}
          <Button
            variant={project.isVisible ? 'default' : 'outline'}
            size="sm"
            className="shrink-0"
            onClick={() => onToggleVisibility('isVisible')}
          >
            {project.isVisible ? (
              <>
                <Eye className="mr-1 h-4 w-4" />
                Visible
              </>
            ) : (
              <>
                <EyeOff className="mr-1 h-4 w-4" />
                Hidden
              </>
            )}
          </Button>
        </div>

        {/* Expandable options */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {isExpanded ? 'Less options' : 'More options'}
          <ArrowRight className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </button>

        {isExpanded && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {/* Visibility checkboxes */}
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={project.showOnPortfolio}
                  onChange={() => onToggleVisibility('showOnPortfolio')}
                  className="rounded"
                />
                Show on Portfolio
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={project.showOnResume}
                  onChange={() => onToggleVisibility('showOnResume')}
                  className="rounded"
                />
                Show on Resume
              </label>
              {isGitHub && (
                <>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={project.showStats}
                      onChange={() => onToggleVisibility('showStats')}
                      className="rounded"
                    />
                    Show Stars/Forks
                  </label>
                  {project.ghReadme && (
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={project.showReadme}
                        onChange={() => onToggleVisibility('showReadme')}
                        className="rounded"
                      />
                      Show README
                    </label>
                  )}
                </>
              )}
            </div>

            {/* Custom description */}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Custom description (overrides default)
              </label>
              <Textarea
                placeholder="Write a custom description for this project..."
                value={project.customDescription || ''}
                onChange={(e) => onUpdate({ customDescription: e.target.value || undefined })}
                className="min-h-[60px] text-sm"
              />
            </div>

            {/* Topics/Technologies */}
            {project.ghTopics && project.ghTopics.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {project.ghTopics.map((topic) => (
                  <Badge key={topic} variant="secondary" className="text-xs">
                    {topic}
                  </Badge>
                ))}
              </div>
            )}

            {/* Delete button */}
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Remove Project
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}
