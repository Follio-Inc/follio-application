'use client';

import { useReverification, useUser } from '@clerk/nextjs';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  FolderGit2,
  GraduationCap,
  Link as LinkIcon,
  Mail,
  Pencil,
  Phone,
  Plus,
  Trash2,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { ResumeTemplateGallery } from '@/app/(dashboard)/builder/components/resume-template-gallery';
import { BrandIcon, type BrandIconId } from '@/components/onboarding/constellation/brand-icons';
import {
  ProjectImportSources,
  type ProjectImportResult,
} from '@/components/onboarding/project-import-sources';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  PhoneInput,
  extractDialCode,
  formatPhoneValue,
  formatStandardPhone as formatStandardPhoneFn,
  type PhoneValue,
} from '@/components/ui/phone-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { formatContactSourceLabel } from '@/lib/contact/source-label';
import { removeEmailFromList, removePhoneFromList } from '@/lib/hooks/use-contact-manager';
import {
  bulletsToHtml,
  htmlToBullets,
  isHtmlEmpty,
  sanitizeRichHtml,
  stripHtmlTags,
} from '@/lib/html-utils';
import {
  mergeImportedBlogPosts,
  mergeImportedProjects,
  normalizeReviewBlogPost,
  normalizeReviewProject,
} from '@/lib/onboarding/review-import';
import { ONBOARDING_TEMPLATE_KEY } from '@/lib/portfolio/templates/onboarding';
import {
  buildDefaultDesignForTemplate,
  buildOnboardingResumePreviewProfile,
  DEFAULT_RESUME_TEMPLATE_ID,
  getResumeTemplateId,
  getTemplateDefaultShowPhoto,
  TEMPLATE_PREVIEW_ON_CREATE,
} from '@/lib/resume/templates';
import {
  extractSkillNamesFromHtml,
  flattenSkillGroups,
  normalizeSkillGroups,
  skillGroupsFromFlatSkills,
  skillsToHtml,
} from '@/lib/skills/groups';
import { cn, toMonthInputFormat } from '@/lib/utils';
import type { ResumeDesign } from '@/types';

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
const compressImageForClerk = async (file: File): Promise<File> => {
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
  middleName?: string;
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
  bulletsHtml?: string;
  /** Same as builder — hidden entries stay saved but omit from resume */
  isVisible?: boolean;
}

interface ParsedEducation {
  id: string;
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
  description?: string;
  /** Same as builder — hidden entries stay saved but omit from resume */
  isVisible?: boolean;
}

interface ParsedSkillGroup {
  id: string;
  name: string;
  /** Rich-text HTML for the skills column */
  skillsHtml: string;
}

interface ParsedLink {
  id: string;
  type: string;
  url: string;
  label?: string;
  /** Same as builder — hidden links stay saved but omit from resume */
  isVisible?: boolean;
}

// Project from GitHub or resume
interface ParsedProject {
  id: string;
  title: string;
  description?: string;
  highlights?: string[];
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
  skillGroups: ParsedSkillGroup[];
  links: ParsedLink[];
  projects: ParsedProject[];
  /** Writing posts carried through from Medium/etc. — not edited on review UI yet */
  blogPosts?: Array<{
    title: string;
    url: string;
    slug?: string;
    excerpt?: string;
    content?: string;
    thumbnail?: string;
    author?: string;
    publishedAt?: string;
    tags?: string[];
    readTimeMin?: number;
    claps?: number;
    platform?: string;
    platformIcon?: string;
    source?: string;
  }>;
  /** Aggregate GitHub profile from import — persisted on complete for the portfolio agent */
  githubProfile?: {
    username: string;
    githubId?: number;
    avatarUrl?: string;
    htmlUrl?: string;
    bio?: string | null;
    company?: string | null;
    blog?: string | null;
    location?: string | null;
    hireable?: boolean | null;
    publicRepos?: number;
    publicGists?: number;
    followers?: number;
    following?: number;
    accountCreatedAt?: string | Date | null;
    totalStars?: number;
    totalForks?: number;
    primaryLanguages?: string[];
    languageStats?: Record<string, number>;
    organizations?: Array<{
      login: string;
      avatarUrl: string;
      url: string;
      description?: string;
    }>;
  };
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
  allNames?: Array<{ firstName?: string; middleName?: string; lastName?: string; source: string }>;
}

type ReviewStep =
  | 'profile'
  | 'contact'
  | 'links'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'summary'
  | 'complete';

const STEPS: ReviewStep[] = [
  'profile',
  'contact',
  'links',
  'experience',
  'education',
  'skills',
  'projects',
  'summary',
  'complete',
];

function parseBuildStep(value: string | null | undefined): ReviewStep | null {
  if (!value) return null;
  return STEPS.includes(value as ReviewStep) ? (value as ReviewStep) : null;
}

const STEP_INFO: Record<ReviewStep, { title: string; description: string; icon: typeof User }> = {
  profile: {
    title: 'Basic Info',
    description: 'Confirm your name, headline, and location',
    icon: User,
  },
  contact: {
    title: 'Contact Details',
    description: 'Add email, phone, and choose what to show',
    icon: Mail,
  },
  links: {
    title: 'Links',
    description: 'Add LinkedIn, GitHub, and your website — plus more platforms if you want',
    icon: LinkIcon,
  },
  experience: {
    title: 'Work Experience',
    description: 'Add your work history one role at a time',
    icon: Briefcase,
  },
  education: {
    title: 'Education',
    description: 'Add your schools and degrees',
    icon: GraduationCap,
  },
  skills: {
    title: 'Skills',
    description: 'Add categories with comma-separated skills',
    icon: Wrench,
  },
  projects: {
    title: 'Projects',
    description: 'Add projects you want to highlight',
    icon: FolderGit2,
  },
  summary: {
    title: 'Professional Summary',
    description: 'A short overview of who you are and what you bring',
    icon: FileText,
  },
  complete: {
    title: "You're all set",
    description: 'Review your summary, then choose a template',
    icon: Check,
  },
};

// Generate unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

/** Empty editor row — matches SkillGroup + Skill[] shape used in the DB. */
function emptySkillGroupRow(): ParsedSkillGroup {
  return { id: generateId(), name: '', skillsHtml: '' };
}

/**
 * Normalize any legacy/onboarding payload into editor skill-group rows.
 * Accepts:
 * - skillGroups: [{ name, skills[] }] or [{ name, skillsText }] or [{ name, skillsHtml }]
 * - flat skills: string[] | { name }[]
 * Returns [] when there is nothing to edit (same empty pattern as experience/education).
 */
function normalizeReviewSkillGroups(parsed: {
  skillGroups?: unknown;
  skills?: unknown;
}): ParsedSkillGroup[] {
  const rawGroups = Array.isArray(parsed.skillGroups) ? parsed.skillGroups : [];

  if (rawGroups.length > 0) {
    return rawGroups
      .map((group) => {
        const record = (group ?? {}) as {
          id?: string;
          name?: string;
          skills?: string[] | string;
          skillsText?: string;
          skillsHtml?: string;
        };
        const fromText =
          typeof record.skillsText === 'string'
            ? record.skillsText
            : typeof record.skills === 'string'
              ? record.skills
              : Array.isArray(record.skills)
                ? record.skills.join(', ')
                : '';
        const skillsHtml =
          typeof record.skillsHtml === 'string' && record.skillsHtml.trim()
            ? record.skillsHtml
            : skillsToHtml(
                fromText
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              );

        return {
          id: typeof record.id === 'string' && record.id ? record.id : generateId(),
          name: typeof record.name === 'string' ? record.name : '',
          skillsHtml,
        };
      })
      .filter((group) => group.name.trim().length > 0 || !isHtmlEmpty(group.skillsHtml));
  }

  const flatSkills = Array.isArray(parsed.skills) ? parsed.skills : [];
  const names = flatSkills
    .map((skill) => (typeof skill === 'string' ? skill : (skill as { name?: string })?.name))
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);

  const fromFlat = skillGroupsFromFlatSkills(names);
  if (fromFlat.length > 0) {
    return fromFlat.map((group) => ({
      id: generateId(),
      name: group.name === 'Skills' ? '' : group.name,
      skillsHtml: group.skillsHtml ?? skillsToHtml(group.skills),
    }));
  }

  return [];
}

function skillGroupTitle(name: string, index: number, total: number): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed;
  return total > 1 ? `Category ${index + 1}` : 'Skills';
}

function skillGroupPreview(html: string): string {
  if (isHtmlEmpty(html)) return 'No skills listed yet';
  const text = stripHtmlTags(html).replace(/\s+/g, ' ').trim();
  if (!text) return 'No skills listed yet';
  return text.length > 96 ? `${text.slice(0, 96)}…` : text;
}

function countSkillsInGroups(groups: ParsedSkillGroup[] | undefined | null): number {
  if (!groups?.length) return 0;
  return groups.reduce(
    (total, group) => total + extractSkillNamesFromHtml(group?.skillsHtml ?? '').length,
    0
  );
}

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
  | 'MEDIUM'
  | 'SUBSTACK'
  | 'HASHNODE'
  | 'DEVTO'
  | 'OTHER';

type LinkSlotDef = {
  key: string;
  type: LinkType;
  label: string;
  placeholder: string;
  brandId: BrandIconId;
  /** Accept bare username/handle as well as a full profile URL */
  acceptsUsername?: boolean;
};

const DEFAULT_LINK_SLOTS: LinkSlotDef[] = [
  {
    key: 'linkedin',
    type: 'LINKEDIN',
    label: 'LinkedIn',
    placeholder: 'username or linkedin.com/in/you',
    brandId: 'linkedin',
    acceptsUsername: true,
  },
  {
    key: 'github',
    type: 'GITHUB',
    label: 'GitHub',
    placeholder: 'username or github.com/you',
    brandId: 'github',
    acceptsUsername: true,
  },
  {
    key: 'website',
    type: 'PORTFOLIO',
    label: 'Personal website',
    placeholder: 'yourname.com',
    brandId: 'portfolio',
  },
];

const MORE_LINK_SLOTS: LinkSlotDef[] = [
  {
    key: 'medium',
    type: 'MEDIUM',
    label: 'Medium',
    placeholder: '@username or medium.com/@you',
    brandId: 'medium',
    acceptsUsername: true,
  },
  {
    key: 'flutter',
    type: 'OTHER',
    label: 'Flutter',
    placeholder: 'publisher or pub.dev/publishers/you',
    brandId: 'flutter',
    acceptsUsername: true,
  },
  {
    key: 'twitter',
    type: 'TWITTER',
    label: 'Twitter / X',
    placeholder: '@username or x.com/you',
    brandId: 'twitter',
    acceptsUsername: true,
  },
  {
    key: 'youtube',
    type: 'YOUTUBE',
    label: 'YouTube',
    placeholder: '@channel or youtube.com/@you',
    brandId: 'youtube',
    acceptsUsername: true,
  },
  {
    key: 'dribbble',
    type: 'DRIBBBLE',
    label: 'Dribbble',
    placeholder: 'username or dribbble.com/you',
    brandId: 'dribbble',
    acceptsUsername: true,
  },
  {
    key: 'behance',
    type: 'BEHANCE',
    label: 'Behance',
    placeholder: 'username or behance.net/you',
    brandId: 'behance',
    acceptsUsername: true,
  },
  {
    key: 'substack',
    type: 'SUBSTACK',
    label: 'Substack',
    placeholder: 'username or you.substack.com',
    brandId: 'substack',
    acceptsUsername: true,
  },
  {
    key: 'devto',
    type: 'DEVTO',
    label: 'Dev.to',
    placeholder: 'username or dev.to/you',
    brandId: 'devto',
    acceptsUsername: true,
  },
  {
    key: 'hashnode',
    type: 'HASHNODE',
    label: 'Hashnode',
    placeholder: '@username or hashnode.com/@you',
    brandId: 'hashnode',
    acceptsUsername: true,
  },
  {
    key: 'other',
    type: 'OTHER',
    label: 'Other',
    placeholder: 'https://…',
    brandId: 'other',
  },
];

function looksLikeUrlOrPath(input: string): boolean {
  return /^https?:\/\//i.test(input) || input.includes('.') || input.includes('/');
}

/** Turn a username or pasted profile URL into a canonical https URL. */
function resolveLinkSlotUrl(slot: LinkSlotDef, input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  if (looksLikeUrlOrPath(trimmed)) {
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  if (!slot.acceptsUsername) {
    return `https://${trimmed}`;
  }

  const handle = trimmed.replace(/^@/, '');
  switch (slot.key) {
    case 'linkedin':
      return `https://www.linkedin.com/in/${handle}`;
    case 'github':
      return `https://github.com/${handle}`;
    case 'medium':
      return `https://medium.com/@${handle}`;
    case 'twitter':
      return `https://x.com/${handle}`;
    case 'youtube':
      return `https://www.youtube.com/@${handle}`;
    case 'dribbble':
      return `https://dribbble.com/${handle}`;
    case 'behance':
      return `https://www.behance.net/${handle}`;
    case 'substack':
      return `https://${handle}.substack.com`;
    case 'devto':
      return `https://dev.to/${handle}`;
    case 'hashnode':
      return `https://hashnode.com/@${handle}`;
    case 'flutter':
      return `https://pub.dev/publishers/${handle}`;
    default:
      return `https://${handle}`;
  }
}

function matchesLinkSlot(link: ParsedLink, slot: LinkSlotDef): boolean {
  if (slot.type === 'OTHER') {
    return link.type === 'OTHER' && (link.label || 'Other') === slot.label;
  }
  return link.type === slot.type;
}

function withDefaultLinkSlots(links: ParsedLink[]): ParsedLink[] {
  const next = [...links];
  for (const slot of DEFAULT_LINK_SLOTS) {
    const existingIndex = next.findIndex((link) => matchesLinkSlot(link, slot));
    if (existingIndex === -1) {
      next.push({
        id: generateId(),
        type: slot.type,
        url: '',
        label: slot.label,
        isVisible: true,
      });
    } else if (!next[existingIndex].label) {
      next[existingIndex] = { ...next[existingIndex], label: slot.label };
    }
  }
  return next;
}

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
  if (lowerUrl.includes('medium.com')) {
    return 'MEDIUM';
  }
  if (lowerUrl.includes('substack.com')) {
    return 'SUBSTACK';
  }
  if (lowerUrl.includes('hashnode.')) {
    return 'HASHNODE';
  }
  if (lowerUrl.includes('dev.to')) {
    return 'DEVTO';
  }
  if (lowerUrl.includes('pub.dev') || lowerUrl.includes('flutter.dev')) {
    return 'OTHER';
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
      'MEDIUM',
      'SUBSTACK',
      'HASHNODE',
      'DEVTO',
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

function BuildPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();

  // Legacy auto-complete path (?auto=1): skip the guided steps and submit as-is.
  const isAutoMode = searchParams.get('auto') === '1';
  const autoSubmittedRef = useRef(false);
  const stepFromUrl = parseBuildStep(searchParams.get('step'));

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

  const [currentStep, setCurrentStepState] = useState<ReviewStep>(stepFromUrl ?? 'profile');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const defaultResumeDesign = useMemo(
    () => buildDefaultDesignForTemplate(DEFAULT_RESUME_TEMPLATE_ID),
    []
  );

  // Email operation states
  const [emailOperationLoading, setEmailOperationLoading] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Review data state
  const [data, setData] = useState<ReviewData>({
    profile: {},
    experiences: [],
    educations: [],
    skillGroups: [],
    links: withDefaultLinkSlots([]),
    projects: [],
  });

  // Migrate stale/HMR state that still has flat `skills` and no skillGroups
  useEffect(() => {
    setData((prev) => {
      if (Array.isArray(prev.skillGroups)) return prev;
      const legacy = prev as ReviewData & { skills?: unknown };
      return {
        ...prev,
        skillGroups: normalizeReviewSkillGroups({
          skillGroups: prev.skillGroups,
          skills: legacy.skills,
        }),
      };
    });
  }, []);

  // Editing states
  const [editingExperienceId, setEditingExperienceId] = useState<string | null>(null);
  const [editingEducationId, setEditingEducationId] = useState<string | null>(null);
  const [editingSkillGroupId, setEditingSkillGroupId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  /** Keys of optional platforms the user added from the More list */
  const [addedMoreKeys, setAddedMoreKeys] = useState<string[]>([]);
  const [morePickerOpen, setMorePickerOpen] = useState(false);
  /** Raw field drafts so username can be typed before blur-normalizing to a URL */
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});
  const [focusedMoreKey, setFocusedMoreKey] = useState<string | null>(null);

  // Manual contact input states
  const [newEmailInput, setNewEmailInput] = useState('');
  const [newPhoneInput, setNewPhoneInput] = useState<PhoneValue>({ countryCode: null, number: '' });
  const [showEmailInput, setShowEmailInput] = useState(false);

  // Phone editing state
  const [editingPhoneIndex, setEditingPhoneIndex] = useState<number | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState<PhoneValue>({
    countryCode: null,
    number: '',
  });

  // Verification code state (for emails pending verification)
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyingEmailId, setVerifyingEmailId] = useState<string | null>(null);

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
              company: (exp.company as string) || '',
              role: (exp.role as string) || '',
              location: exp.location as string | undefined,
              startDate: toMonthInputFormat(exp.startDate as string),
              endDate: toMonthInputFormat(exp.endDate as string),
              isCurrent: exp.isCurrent as boolean | undefined,
              bullets: exp.bullets as string[] | undefined,
              bulletsHtml: exp.bulletsHtml as string | undefined,
              isVisible: exp.isVisible !== false,
            })),
            educations: (parsed.educations || []).map((edu: Record<string, unknown>) => ({
              id: generateId(),
              institution: (edu.institution as string) || '',
              degree: edu.degree as string | undefined,
              fieldOfStudy: edu.fieldOfStudy as string | undefined,
              location: edu.location as string | undefined,
              startDate: toMonthInputFormat(edu.startDate as string),
              endDate: toMonthInputFormat(edu.endDate as string),
              gpa: edu.gpa as string | undefined,
              description: edu.description as string | undefined,
              isVisible: edu.isVisible !== false,
            })),
            skillGroups: normalizeReviewSkillGroups(parsed),
            links: withDefaultLinkSlots(
              (parsed.links || []).map((link: Record<string, unknown>) => ({
                id: generateId(),
                type: detectLinkType(link.url as string, link.type as string),
                url: (link.url as string) || '',
                label: link.label as string | undefined,
                isVisible: link.isVisible !== false,
              }))
            ),
            projects: (parsed.projects || []).map((proj: Record<string, unknown>) =>
              normalizeReviewProject(proj)
            ),
            blogPosts: (parsed.blogPosts || []).map((post: Record<string, unknown>) =>
              normalizeReviewBlogPost(post)
            ),
            githubProfile: parsed.githubProfile || undefined,
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
          const moreKeysWithContent = MORE_LINK_SLOTS.filter((slot) =>
            (transformedData.links || []).some(
              (link) => matchesLinkSlot(link, slot) && link.url.trim().length > 0
            )
          ).map((slot) => slot.key);
          if (moreKeysWithContent.length > 0) setAddedMoreKeys(moreKeysWithContent);
        } else {
          setData((prev) => ({ ...prev, links: withDefaultLinkSlots(prev.links) }));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading]);

  // URL is the source of truth for browser back/forward and refresh.
  // Local state stays optimistic during in-app next/back navigations.
  useEffect(() => {
    if (isAutoMode) return;
    if (stepFromUrl) {
      setCurrentStepState((prev) => (prev === stepFromUrl ? prev : stepFromUrl));
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('step', 'profile');
    router.replace(`/onboarding/build?${params.toString()}`, { scroll: false });
  }, [isAutoMode, router, searchParams, stepFromUrl]);

  const goToStep = (step: ReviewStep) => {
    setCurrentStepState(step);
    if (isAutoMode) return;
    const params = new URLSearchParams(searchParams.toString());
    if (params.get('step') === step) return;
    params.set('step', step);
    router.push(`/onboarding/build?${params.toString()}`, { scroll: false });
  };

  const currentStepIndex = STEPS.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const goToNextStep = () => {
    if (currentStep === 'links') {
      for (const slot of [
        ...DEFAULT_LINK_SLOTS,
        ...MORE_LINK_SLOTS.filter((item) => addedMoreKeys.includes(item.key)),
      ]) {
        commitLinkSlot(slot);
      }
    }
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      goToStep(STEPS[nextIndex]);
    }
  };

  const goToPreviousStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      goToStep(STEPS[prevIndex]);
    }
  };

  const handleSaveProfile = async (resumeDesign?: ResumeDesign) => {
    setIsSaving(true);
    setError(null);

    try {
      // Get handle from sessionStorage or generate one
      const storedHandle = sessionStorage.getItem('onboarding_handle');
      const firstName = data.profile.firstName || 'User';
      const middleName = data.profile.middleName || '';
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

      // Template the user picked during onboarding (falls back to server default)
      const selectedTemplateId = sessionStorage.getItem(ONBOARDING_TEMPLATE_KEY) || undefined;

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

      const selectedResumeDesign = resumeDesign ?? undefined;
      const selectedResumeShowPhoto = selectedResumeDesign
        ? getTemplateDefaultShowPhoto(getResumeTemplateId(selectedResumeDesign.templateId))
        : undefined;

      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          middleName: middleName || undefined,
          lastName,
          handle: storedHandle,
          resumeFileName: resumeFileName || undefined,
          galleryPhotos: resolvedGalleryPhotos.length > 0 ? resolvedGalleryPhotos : undefined,
          // Original full-resolution avatar for permanent storage (separate from Clerk)
          originalAvatarDataUrl: originalAvatarDataUrl || undefined,
          // When adding a new resume from builder, target the specific blank profile
          targetProfileId: sessionStorage.getItem('importTargetProfileId') || undefined,
          // Starting portfolio template chosen during onboarding
          templateId: selectedTemplateId,
          // Resume layout chosen in the shared template gallery
          resumeDesign: selectedResumeDesign,
          resumeShowPhoto: selectedResumeShowPhoto,
          reviewedData: {
            profile: profileForApi,
            experiences: data.experiences,
            educations: data.educations,
            skillGroups: normalizeSkillGroups(
              (data.skillGroups ?? []).map((group) => ({
                name: group.name,
                skills: extractSkillNamesFromHtml(group.skillsHtml),
                skillsHtml: group.skillsHtml,
              }))
            ),
            // Flat list kept for backward-compatible consumers; DB write prefers skillGroups
            skills: flattenSkillGroups(
              normalizeSkillGroups(
                (data.skillGroups ?? []).map((group) => ({
                  name: group.name,
                  skills: extractSkillNamesFromHtml(group.skillsHtml),
                  skillsHtml: group.skillsHtml,
                }))
              )
            ),
            links: [...DEFAULT_LINK_SLOTS, ...MORE_LINK_SLOTS]
              .filter(
                (slot) =>
                  DEFAULT_LINK_SLOTS.some((item) => item.key === slot.key) ||
                  addedMoreKeys.includes(slot.key)
              )
              .map((slot) => {
                const existing = data.links.find((link) => matchesLinkSlot(link, slot));
                const raw = linkDrafts[slot.key] ?? existing?.url ?? '';
                const url = resolveLinkSlotUrl(slot, raw);
                if (!url) return null;
                return {
                  type: slot.type,
                  url,
                  label: slot.label,
                  isVisible: existing?.isVisible !== false,
                };
              })
              .filter(
                (
                  link
                ): link is { type: LinkType; url: string; label: string; isVisible: boolean } =>
                  !!link
              ),
            contactInfo: data.contactInfo,
            // Include projects with visibility settings
            projects: data.projects.map((p) => ({
              title: p.title,
              description: p.description,
              highlights: p.highlights,
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
            blogPosts: data.blogPosts,
            githubProfile: data.githubProfile,
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
      sessionStorage.removeItem(ONBOARDING_TEMPLATE_KEY);
      await clearPhotosFromIndexedDB();

      // Check if there's a return URL (e.g., coming from builder's "New resume from upload")
      const returnUrl = sessionStorage.getItem('importReturnUrl');
      sessionStorage.removeItem('importReturnUrl');

      // Redirect to return URL or default to the builder
      router.refresh();
      router.push(returnUrl || '/builder');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-complete: when arriving with ?auto=1 ("Go to Dashboard"), submit the
  // imported data without manual review. We wait until the data has loaded and
  // Clerk emails have been merged into the contact list so the primary login
  // email is preserved, then submit exactly once. If submission fails, we fall
  // back to the manual review UI so the user can fix the issue and retry.
  useEffect(() => {
    if (!isAutoMode || autoSubmittedRef.current) return;
    if (isLoading || !user) return;

    const clerkPrimary = user.primaryEmailAddress?.emailAddress?.toLowerCase();
    const emailsReady =
      !clerkPrimary ||
      (data.contactInfo?.allEmails?.some((e) => e.email.toLowerCase() === clerkPrimary) ?? false);
    if (!emailsReady) return;

    autoSubmittedRef.current = true;
    void handleSaveProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoMode, isLoading, user, data]);

  // Profile update handlers
  const updateProfile = (field: keyof ParsedProfile, value: string) => {
    setData((prev) => ({
      ...prev,
      profile: { ...prev.profile, [field]: value },
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

      // Update local state by identity — index can be stale after reload/sync
      setData((prev) => {
        const removed = removeEmailFromList(
          prev.contactInfo?.allEmails || [],
          prev.contactInfo?.primaryEmailIndex ?? 0,
          emailEntry
        );

        return {
          ...prev,
          contactInfo: {
            ...prev.contactInfo,
            allEmails: removed.emails,
            primaryEmailIndex: removed.primaryEmailIndex,
            email: removed.email,
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

  // Delete phone from list (primary included; promotes another when present)
  const deletePhone = (index: number) => {
    setData((prev) => {
      const removed = removePhoneFromList(
        prev.contactInfo?.allPhones || [],
        prev.contactInfo?.primaryPhoneIndex ?? 0,
        index
      );

      return {
        ...prev,
        contactInfo: {
          ...prev.contactInfo,
          allPhones: removed.phones,
          primaryPhoneIndex: removed.primaryPhoneIndex,
          phone: removed.phone,
        },
      };
    });

    if (editingPhoneIndex === index) {
      setEditingPhoneIndex(null);
      setEditingPhoneValue({ countryCode: null, number: '' });
    } else if (editingPhoneIndex !== null && editingPhoneIndex > index) {
      setEditingPhoneIndex(editingPhoneIndex - 1);
    }
  };

  // Add phone manually (first number or an additional one)
  const addPhone = (phoneValue: PhoneValue) => {
    if (!phoneValue.number.trim()) return;

    const dialCode = extractDialCode(phoneValue.countryCode);
    const digitsOnly = phoneValue.number.replace(/\D/g, '');
    if (!digitsOnly) return;

    const formattedNumber = formatStandardPhoneFn(digitsOnly, dialCode);
    const normalizedValue: PhoneValue = {
      countryCode: phoneValue.countryCode,
      number: formattedNumber,
    };

    setData((prev) => {
      const allPhones = prev.contactInfo?.allPhones || [];

      // Check for duplicates
      const normalizePhone = (p: string) => p.replace(/\D/g, '');
      const newPhoneNormalized = normalizePhone(digitsOnly);
      const isDuplicate = allPhones.some((p) => {
        const existingNumber = p.number || p.phone || '';
        return normalizePhone(existingNumber) === newPhoneNormalized;
      });
      if (isDuplicate) return prev;

      const nextPhones = [
        ...allPhones,
        {
          countryCode: normalizedValue.countryCode,
          number: normalizedValue.number,
          phone: formatPhoneValue(normalizedValue), // Legacy field for backward compat
          source: 'MANUAL',
        },
      ];
      const primaryIndex =
        allPhones.length === 0 ? 0 : (prev.contactInfo?.primaryPhoneIndex ?? 0);

      return {
        ...prev,
        contactInfo: {
          ...prev.contactInfo,
          allPhones: nextPhones,
          primaryPhoneIndex: primaryIndex,
          phone: nextPhones[primaryIndex]?.phone,
        },
      };
    });

    setNewPhoneInput({ countryCode: null, number: '' });
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

    const dialCode = extractDialCode(editingPhoneValue.countryCode);
    const digitsOnly = editingPhoneValue.number.replace(/\D/g, '');
    const formattedNumber = digitsOnly
      ? formatStandardPhoneFn(digitsOnly, dialCode)
      : editingPhoneValue.number.trim();
    const normalizedValue: PhoneValue = {
      countryCode: editingPhoneValue.countryCode,
      number: formattedNumber,
    };

    setData((prev) => {
      const allPhones = [...(prev.contactInfo?.allPhones || [])];
      if (editingPhoneIndex >= 0 && editingPhoneIndex < allPhones.length) {
        allPhones[editingPhoneIndex] = {
          ...allPhones[editingPhoneIndex],
          countryCode: normalizedValue.countryCode,
          number: normalizedValue.number,
          phone: formatPhoneValue(normalizedValue), // Update legacy field
        };
      }
      return {
        ...prev,
        contactInfo: {
          ...prev.contactInfo,
          allPhones,
          phone: allPhones[prev.contactInfo?.primaryPhoneIndex ?? 0]?.phone,
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
    setEditingExperienceId((current) => (current === id ? null : current));
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
      isVisible: true,
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
    setEditingEducationId((current) => (current === id ? null : current));
    setData((prev) => ({
      ...prev,
      educations: prev.educations.filter((edu) => edu.id !== id),
    }));
  };

  const addEducation = () => {
    const newEdu: ParsedEducation = {
      id: generateId(),
      institution: '',
      isVisible: true,
    };
    setData((prev) => ({
      ...prev,
      educations: [...prev.educations, newEdu],
    }));
    setEditingEducationId(newEdu.id);
  };

  // Skill group handlers
  const updateSkillGroup = (id: string, updates: Partial<ParsedSkillGroup>) => {
    setData((prev) => ({
      ...prev,
      skillGroups: prev.skillGroups.map((group) =>
        group.id === id ? { ...group, ...updates } : group
      ),
    }));
  };

  const deleteSkillGroup = (id: string) => {
    setEditingSkillGroupId((current) => (current === id ? null : current));
    setData((prev) => ({
      ...prev,
      skillGroups: prev.skillGroups.filter((group) => group.id !== id),
    }));
  };

  const addSkillGroup = () => {
    const newGroup = emptySkillGroupRow();
    setData((prev) => ({
      ...prev,
      skillGroups: [...prev.skillGroups, newGroup],
    }));
    setEditingSkillGroupId(newGroup.id);
  };

  const skillGroups = Array.isArray(data.skillGroups) ? data.skillGroups : [];
  const skillCount = countSkillsInGroups(skillGroups);

  const templatePreviewProfile = useMemo(
    () =>
      buildOnboardingResumePreviewProfile({
        profile: data.profile,
        experiences: data.experiences,
        educations: data.educations,
        skillGroups: data.skillGroups,
        links: data.links,
        projects: data.projects,
        contactInfo: {
          email: data.contactInfo?.allEmails?.[0]?.email ?? null,
          phone:
            data.contactInfo?.allPhones?.[0]?.number ||
            data.contactInfo?.allPhones?.[0]?.phone ||
            null,
          website: null,
        },
      }),
    [data]
  );

  const handleOpenTemplateGallery = () => {
    setError(null);
    setTemplateGalleryOpen(true);
  };

  const handleResumeTemplateSelect = (design: ResumeDesign) => {
    setTemplateGalleryOpen(false);
    void handleSaveProfile(design);
  };

  // Link handlers
  const upsertLinkSlot = (slot: LinkSlotDef, url: string) => {
    setData((prev) => {
      const existing = prev.links.find((link) => matchesLinkSlot(link, slot));
      if (existing) {
        return {
          ...prev,
          links: prev.links.map((link) =>
            link.id === existing.id ? { ...link, url, type: slot.type, label: slot.label } : link
          ),
        };
      }
      return {
        ...prev,
        links: [
          ...prev.links,
          { id: generateId(), type: slot.type, url, label: slot.label, isVisible: true },
        ],
      };
    });
  };

  const toggleLinkVisibility = (slot: LinkSlotDef) => {
    setData((prev) => {
      const existing = prev.links.find((link) => matchesLinkSlot(link, slot));
      if (!existing) return prev;
      return {
        ...prev,
        links: prev.links.map((link) =>
          link.id === existing.id ? { ...link, isVisible: !(link.isVisible ?? true) } : link
        ),
      };
    });
  };

  const getLinkDraft = (slot: LinkSlotDef): string => {
    if (linkDrafts[slot.key] !== undefined) return linkDrafts[slot.key];
    const link = data.links.find((item) => matchesLinkSlot(item, slot));
    return link?.url || '';
  };

  const setLinkDraft = (slot: LinkSlotDef, value: string) => {
    setLinkDrafts((prev) => ({ ...prev, [slot.key]: value }));
  };

  const commitLinkSlot = (slot: LinkSlotDef) => {
    const raw = getLinkDraft(slot);
    const resolved = resolveLinkSlotUrl(slot, raw);
    setLinkDrafts((prev) => ({ ...prev, [slot.key]: resolved }));
    upsertLinkSlot(slot, resolved);
  };

  const addMoreLinkSlot = (slot: LinkSlotDef) => {
    setAddedMoreKeys((prev) => (prev.includes(slot.key) ? prev : [...prev, slot.key]));
    setFocusedMoreKey(slot.key);
    setMorePickerOpen(false);
    // Ensure an empty slot exists so the field is ready
    if (!data.links.some((link) => matchesLinkSlot(link, slot))) {
      upsertLinkSlot(slot, '');
    }
  };

  const removeMoreLinkSlot = (slot: LinkSlotDef) => {
    setAddedMoreKeys((prev) => prev.filter((key) => key !== slot.key));
    setLinkDrafts((prev) => {
      const next = { ...prev };
      delete next[slot.key];
      return next;
    });
    upsertLinkSlot(slot, '');
  };

  // Project handlers
  const updateProject = (id: string, updates: Partial<ParsedProject>) => {
    setData((prev) => ({
      ...prev,
      projects: prev.projects.map((proj) => (proj.id === id ? { ...proj, ...updates } : proj)),
    }));
  };

  const deleteProject = (id: string) => {
    setEditingProjectId((current) => (current === id ? null : current));
    setData((prev) => ({
      ...prev,
      projects: prev.projects.filter((proj) => proj.id !== id),
    }));
  };

  const addProject = () => {
    const newProject: ParsedProject = {
      id: generateId(),
      title: '',
      description: '',
      highlights: [],
      technologies: [],
      isVisible: true,
      showOnPortfolio: true,
      showOnResume: true,
      showStats: false,
      showReadme: false,
      source: 'RESUME',
    };
    setData((prev) => ({
      ...prev,
      projects: [...prev.projects, newProject],
    }));
    setEditingProjectId(newProject.id);
  };

  const handleProjectSourceImport = (result: ProjectImportResult) => {
    setEditingProjectId(null);
    setData((prev) => {
      let links = prev.links;
      if (result.link?.url) {
        const url = result.link.url.replace(/\/+$/, '');
        const already = links.some(
          (l) => l.url.trim().replace(/\/+$/, '').toLowerCase() === url.toLowerCase()
        );
        if (!already) {
          links = [
            ...links,
            {
              id: generateId(),
              type: detectLinkType(url, result.link.type),
              url,
              label: result.link.label,
              isVisible: true,
            },
          ];
        }
      }

      const nextProjects = result.projects?.length
        ? (mergeImportedProjects(prev.projects, result.projects) as ParsedProject[])
        : prev.projects;

      const nextPosts = result.blogPosts?.length
        ? (mergeImportedBlogPosts(
            prev.blogPosts || [],
            result.blogPosts
          ) as ReviewData['blogPosts'])
        : prev.blogPosts;

      return {
        ...prev,
        links,
        projects: nextProjects,
        blogPosts: nextPosts,
        githubProfile: result.githubProfile
          ? ({
              ...(prev.githubProfile || {}),
              ...result.githubProfile,
              username:
                (result.githubProfile.username as string) || prev.githubProfile?.username || '',
            } as ReviewData['githubProfile'])
          : prev.githubProfile,
      };
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Auto-complete mode: skip the editable steps and show a creating-profile
  // state while the imported data is submitted. On failure we drop back to the
  // normal review UI (error is surfaced inline there) so the user can recover.
  if (isAutoMode && !error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <Spinner size="lg" />
        <div className="space-y-1.5">
          <h2 className="text-display text-xl">Creating your profile</h2>
          <p className="text-sm text-muted-foreground">
            Setting everything up — this will only take a moment.
          </p>
        </div>
      </div>
    );
  }

  const editableSteps = STEPS.slice(0, -1);

  return (
    <>
      {/* Progress bar — sits just beneath the app header */}
      <div className="fixed left-0 right-0 top-16 z-40 h-0.5 bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-12 sm:px-6">
        {/* Step indicator — segmented track */}
        <div className="mb-10 flex items-center gap-1.5" aria-label="Setup steps">
          {editableSteps.map((step, index) => {
            const reachable = index <= currentStepIndex;
            return (
              <button
                key={step}
                type="button"
                aria-label={STEP_INFO[step].title}
                aria-current={index === currentStepIndex ? 'step' : undefined}
                disabled={!reachable}
                onClick={() => {
                  if (reachable) goToStep(step);
                }}
                className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                  index <= currentStepIndex ? 'bg-primary' : 'bg-muted'
                } ${reachable ? 'cursor-pointer' : 'cursor-default'}`}
              />
            );
          })}
        </div>

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
                    { firstName: string; middleName: string; lastName: string; sources: string[] }
                  >();

                  if (data.allNames) {
                    for (const nameEntry of data.allNames) {
                      const firstName = (nameEntry.firstName || '').trim();
                      const middleName = (nameEntry.middleName || '').trim();
                      const lastName = (nameEntry.lastName || '').trim();
                      const key = `${firstName.toLowerCase()}|${middleName.toLowerCase()}|${lastName.toLowerCase()}`;

                      if (key === '||') continue; // Skip empty names

                      if (uniqueNamesMap.has(key)) {
                        // Add source to existing entry
                        const existing = uniqueNamesMap.get(key)!;
                        if (!existing.sources.includes(nameEntry.source)) {
                          existing.sources.push(nameEntry.source);
                        }
                      } else {
                        uniqueNamesMap.set(key, {
                          firstName,
                          middleName,
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
                          const fullName = [
                            nameEntry.firstName,
                            nameEntry.middleName,
                            nameEntry.lastName,
                          ]
                            .filter(Boolean)
                            .join(' ');
                          const isSelected =
                            data.profile.firstName === nameEntry.firstName &&
                            data.profile.middleName === nameEntry.middleName &&
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
                                    middleName: nameEntry.middleName,
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

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">First Name</label>
                    <Input
                      value={data.profile.firstName || ''}
                      onChange={(e) => updateProfile('firstName', e.target.value)}
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Middle Name</label>
                    <Input
                      value={data.profile.middleName || ''}
                      onChange={(e) => updateProfile('middleName', e.target.value)}
                      placeholder="Taylor"
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

              <div className="space-y-10">
                {/* Emails Section */}
                <section>
                  <div className="mb-1.5 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <h3 className="text-section-title">Email addresses</h3>
                  </div>
                  <p className="mb-4 text-sm leading-6 text-muted-foreground">
                    Primary email is used for login and shown on your profile. Verify an address
                    before setting it as primary.
                  </p>

                  {emailError && (
                    <div className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      <span className="flex-1">{emailError}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => setEmailError(null)}
                        aria-label="Dismiss error"
                      >
                        <X className="h-3.5 w-3.5" />
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
                            className={cn(
                              'rounded-xl border border-border/70 bg-background p-3.5 transition-colors',
                              isPrimary && 'border-primary/30 bg-primary/5'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-3">
                                <Mail
                                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50"
                                  aria-hidden
                                />
                                <div className="min-w-0">
                                  <p
                                    className={cn(
                                      'truncate text-sm',
                                      isPrimary ? 'font-medium' : 'font-normal'
                                    )}
                                  >
                                    {item.email}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    <Badge
                                      variant="outline"
                                      className="h-5 border-border/70 px-1.5 text-[11px] font-medium text-muted-foreground"
                                    >
                                      {formatContactSourceLabel(item.source, {
                                        email: item.email,
                                        externalAccounts: user?.externalAccounts,
                                      })}
                                    </Badge>
                                    {item.verified ? (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                                        <Check className="h-3 w-3" aria-hidden />
                                        Verified
                                      </span>
                                    ) : (
                                      <span className="text-[11px] font-medium text-muted-foreground">
                                        {item.clerkEmailId ? 'Pending verification' : 'Not added'}
                                      </span>
                                    )}
                                    {isPrimary && (
                                      <span className="text-[11px] font-medium text-primary">
                                        Primary
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                {isLoading ? (
                                  <Spinner className="h-4 w-4" />
                                ) : (
                                  <>
                                    {item.clerkEmailId && !item.verified && !isVerifying && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setVerifyingEmailId(item.clerkEmailId!);
                                          setVerificationCode('');
                                        }}
                                        className="h-8"
                                      >
                                        Enter code
                                      </Button>
                                    )}

                                    {!item.clerkEmailId && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => addEmailToClerk(item.email)}
                                        className="h-8"
                                      >
                                        Add & verify
                                      </Button>
                                    )}

                                    {!isPrimary && item.verified && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPrimaryEmailClerk(idx)}
                                        className="h-8 text-muted-foreground"
                                      >
                                        Make primary
                                      </Button>
                                    )}

                                    {!isPrimary && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => deleteEmailFromClerk(idx)}
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        title="Delete email"
                                        aria-label="Delete email"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            {isVerifying && (
                              <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center">
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="6-digit code"
                                  value={verificationCode}
                                  onChange={(e) => setVerificationCode(e.target.value)}
                                  className="sm:w-36"
                                  maxLength={6}
                                  aria-label="Verification code"
                                />
                                <div className="flex items-center gap-1">
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
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      setVerifyingEmailId(null);
                                      setVerificationCode('');
                                    }}
                                    aria-label="Cancel verification"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 px-6 py-8 text-center text-sm text-muted-foreground">
                      No email addresses yet. Add one below.
                    </div>
                  )}

                  {showEmailInput ? (
                    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border/70 bg-background p-3 sm:flex-row sm:items-center">
                      <Input
                        type="email"
                        placeholder="name@example.com"
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
                        className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
                        autoFocus
                        disabled={!!emailOperationLoading}
                      />
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          onClick={() => addEmailToClerk(newEmailInput)}
                          disabled={!newEmailInput.trim() || !!emailOperationLoading}
                        >
                          {emailOperationLoading ? (
                            <Spinner className="h-4 w-4" />
                          ) : (
                            'Add & verify'
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => {
                            setShowEmailInput(false);
                            setNewEmailInput('');
                          }}
                          aria-label="Cancel adding email"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setShowEmailInput(true)}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add email
                    </Button>
                  )}
                </section>

                {/* Phones Section */}
                <section className="border-t border-border/60 pt-10">
                  {(() => {
                    const allPhones = data.contactInfo?.allPhones || [];
                    const hasSavedPhones = allPhones.some((item) =>
                      Boolean((item.number || item.phone || '').trim())
                    );

                    return (
                      <>
                        <div className="mb-1.5 flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
                          <h3 className="text-section-title">Phone numbers</h3>
                        </div>
                        <p className="mb-4 text-sm leading-6 text-muted-foreground">
                          {hasSavedPhones
                            ? 'Choose which number appears as primary on your profile.'
                            : 'Optional — add a number if you want it on your resume.'}
                        </p>

                        {hasSavedPhones && (
                          <div className="mb-3 space-y-2">
                            {allPhones.map((item, idx) => {
                              if (!(item.number || item.phone || '').trim()) return null;

                              const isPrimary = idx === (data.contactInfo?.primaryPhoneIndex ?? 0);
                              const isEditing = editingPhoneIndex === idx;
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

                              if (isEditing) {
                                return (
                                  <div
                                    key={idx}
                                    className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-3.5"
                                  >
                                    <PhoneInput
                                      value={editingPhoneValue}
                                      onChange={setEditingPhoneValue}
                                      placeholder="Phone number"
                                    />
                                    <div className="flex items-center justify-end gap-1 border-t border-border/60 pt-3">
                                      <Button variant="ghost" size="sm" onClick={cancelEditPhone}>
                                        Cancel
                                      </Button>
                                      <Button size="sm" onClick={saveEditPhone}>
                                        <Check className="mr-1.5 h-3.5 w-3.5" />
                                        Save
                                      </Button>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={idx}
                                  className={cn(
                                    'flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-background p-3.5 transition-colors',
                                    isPrimary
                                      ? 'border-primary/30 bg-primary/5'
                                      : 'hover:bg-muted/30'
                                  )}
                                >
                                  <div className="flex min-w-0 items-start gap-3">
                                    <Phone
                                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50"
                                      aria-hidden
                                    />
                                    <div className="min-w-0">
                                      <p
                                        className={cn(
                                          'text-sm',
                                          isPrimary ? 'font-medium' : 'font-normal'
                                        )}
                                      >
                                        {displayPhone}
                                      </p>
                                      {isPrimary && (
                                        <p className="mt-1 text-[11px] font-medium text-primary">
                                          Primary
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => startEditPhone(idx)}
                                      className="h-8 w-8 text-muted-foreground"
                                      title="Edit phone number"
                                      aria-label="Edit phone number"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    {!isPrimary && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPrimaryPhone(idx)}
                                        className="h-8 text-muted-foreground"
                                      >
                                        Make primary
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => deletePhone(idx)}
                                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                      title="Delete phone"
                                      aria-label="Delete phone"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <PhoneInput
                            value={newPhoneInput}
                            onChange={setNewPhoneInput}
                            placeholder="Phone number"
                            className="min-w-0 flex-1"
                          />
                          <Button
                            size="sm"
                            className="h-9 shrink-0"
                            onClick={() => addPhone(newPhoneInput)}
                            disabled={!newPhoneInput.number.trim()}
                          >
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Add
                          </Button>
                        </div>
                      </>
                    );
                  })()}
                </section>
              </div>

              <StepNavigation
                onBack={() => {
                  if (editingPhoneIndex !== null) saveEditPhone();
                  goToPreviousStep();
                }}
                onNext={() => {
                  if (editingPhoneIndex !== null) saveEditPhone();
                  goToNextStep();
                }}
              />
            </StepContainer>
          )}

          {/* Links Step */}
          {currentStep === 'links' && (
            <StepContainer key="links">
              <StepHeader
                icon={STEP_INFO.links.icon}
                title={STEP_INFO.links.title}
                description={STEP_INFO.links.description}
              />

              <div className="w-full space-y-4">
                {DEFAULT_LINK_SLOTS.map((slot) => {
                  const link = data.links.find((item) => matchesLinkSlot(item, slot));
                  const draftUrl = getLinkDraft(slot);
                  const hasUrl = Boolean(resolveLinkSlotUrl(slot, draftUrl));
                  const linkHidden = hasUrl && link?.isVisible === false;
                  return (
                    <div key={slot.key} className={cn(linkHidden && 'opacity-50')}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <BrandIcon id={slot.brandId} className="h-4 w-4 shrink-0" />
                          {slot.label}
                        </label>
                        {hasUrl ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleLinkVisibility(slot)}
                            title={linkHidden ? 'Show on resume' : 'Hide from resume'}
                            aria-label={linkHidden ? 'Show on resume' : 'Hide from resume'}
                          >
                            {linkHidden ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        ) : null}
                      </div>
                      <Input
                        value={draftUrl}
                        onChange={(e) => setLinkDraft(slot, e.target.value)}
                        onBlur={() => commitLinkSlot(slot)}
                        placeholder={slot.placeholder}
                      />
                      {slot.acceptsUsername && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Username or full profile URL both work
                        </p>
                      )}
                    </div>
                  );
                })}

                {addedMoreKeys.map((key) => {
                  const slot = MORE_LINK_SLOTS.find((item) => item.key === key);
                  if (!slot) return null;
                  const link = data.links.find((item) => matchesLinkSlot(item, slot));
                  const draftUrl = getLinkDraft(slot);
                  const hasUrl = Boolean(resolveLinkSlotUrl(slot, draftUrl));
                  const linkHidden = hasUrl && link?.isVisible === false;
                  return (
                    <div key={slot.key} className={cn(linkHidden && 'opacity-50')}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <BrandIcon id={slot.brandId} className="h-4 w-4 shrink-0" />
                          {slot.label}
                        </label>
                        <div className="flex items-center gap-1">
                          {hasUrl ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleLinkVisibility(slot)}
                              title={linkHidden ? 'Show on resume' : 'Hide from resume'}
                              aria-label={linkHidden ? 'Show on resume' : 'Hide from resume'}
                            >
                              {linkHidden ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-muted-foreground hover:text-destructive"
                            onClick={() => removeMoreLinkSlot(slot)}
                          >
                            <X className="mr-1 h-3.5 w-3.5" />
                            Remove
                          </Button>
                        </div>
                      </div>
                      <Input
                        value={draftUrl}
                        onChange={(e) => setLinkDraft(slot, e.target.value)}
                        onBlur={() => commitLinkSlot(slot)}
                        placeholder={slot.placeholder}
                        autoFocus={focusedMoreKey === slot.key}
                      />
                      {slot.acceptsUsername ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Username or full profile URL both work
                        </p>
                      ) : null}
                    </div>
                  );
                })}

                {(() => {
                  const remainingMoreSlots = MORE_LINK_SLOTS.filter(
                    (slot) => !addedMoreKeys.includes(slot.key)
                  );
                  if (remainingMoreSlots.length === 0) return null;

                  const previewSlots = remainingMoreSlots.slice(0, 4);
                  const overflowCount = remainingMoreSlots.length - previewSlots.length;
                  const previewLabels = remainingMoreSlots
                    .slice(0, 3)
                    .map((slot) => slot.label)
                    .join(', ');
                  const moreHint =
                    remainingMoreSlots.length > 3
                      ? `${previewLabels}, and more`
                      : previewLabels;

                  return (
                    <Popover open={morePickerOpen} onOpenChange={setMorePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-auto w-full justify-between gap-3 rounded-xl border-dashed border-border/70 px-3 py-2.5 text-left shadow-none hover:border-border hover:bg-muted/40"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="flex shrink-0 items-center -space-x-1.5" aria-hidden>
                              {previewSlots.map((slot) => (
                                <span
                                  key={slot.key}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-background"
                                >
                                  <BrandIcon id={slot.brandId} className="h-3.5 w-3.5" />
                                </span>
                              ))}
                              {overflowCount > 0 ? (
                                <span className="flex h-7 min-w-7 items-center justify-center rounded-full border border-border/70 bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                                  +{overflowCount}
                                </span>
                              ) : null}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground">
                                Add more platforms
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {moreHint}
                              </span>
                            </span>
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-80 p-2">
                        <div className="px-2 pb-2 pt-1">
                          <p className="text-sm font-medium">More platforms</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Pick one to add a field for it
                          </p>
                        </div>
                        <div className="max-h-64 space-y-0.5 overflow-y-auto">
                          {remainingMoreSlots.map((slot) => (
                            <button
                              key={slot.key}
                              type="button"
                              onClick={() => addMoreLinkSlot(slot)}
                              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background">
                                <BrandIcon id={slot.brandId} className="h-3.5 w-3.5" />
                              </span>
                              <span className="font-medium">{slot.label}</span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })()}
              </div>

              <StepNavigation onBack={goToPreviousStep} onNext={goToNextStep} />
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
                  message="No work experience yet — add your first role"
                  onAdd={addExperience}
                  addLabel="Add Experience"
                />
              ) : (
                <div className="w-full space-y-4">
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
                  message="No education yet — add a school or degree"
                  onAdd={addEducation}
                  addLabel="Add Education"
                />
              ) : (
                <div className="w-full space-y-4">
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
                count={skillCount}
              />

              {skillGroups.length === 0 ? (
                <EmptyState
                  message="No skills yet — add a category or list of skills"
                  onAdd={addSkillGroup}
                  addLabel="Add Skills"
                />
              ) : (
                <div className="w-full space-y-4">
                  {skillGroups.map((group, index) => (
                    <SkillGroupCard
                      key={group.id}
                      group={group}
                      title={skillGroupTitle(group.name, index, skillGroups.length)}
                      isEditing={editingSkillGroupId === group.id}
                      onEdit={() => setEditingSkillGroupId(group.id)}
                      onSave={() => setEditingSkillGroupId(null)}
                      onUpdate={(updates) => updateSkillGroup(group.id, updates)}
                      onDelete={() => deleteSkillGroup(group.id)}
                    />
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addSkillGroup}
                    className="w-full gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Another Category
                  </Button>
                </div>
              )}

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
                count={data.projects.length}
              />

              <ProjectImportSources
                existingProjects={data.projects}
                existingBlogPosts={data.blogPosts}
                existingLinks={data.links}
                githubProfileUsername={data.githubProfile?.username}
                onImported={handleProjectSourceImport}
                className="mb-5"
              />

              {data.projects.length === 0 ? (
                <EmptyState
                  message="No projects yet — import above or add one manually"
                  onAdd={addProject}
                  addLabel="Add Project"
                />
              ) : (
                <>
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
                          isEditing={editingProjectId === project.id}
                          onEdit={() => setEditingProjectId(project.id)}
                          onSave={() => setEditingProjectId(null)}
                          onUpdate={(updates) => updateProject(project.id, updates)}
                          onDelete={() => deleteProject(project.id)}
                        />
                      ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addProject}
                    className="mt-3 w-full gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Another Project
                  </Button>
                </>
              )}

              <StepNavigation onBack={goToPreviousStep} onNext={goToNextStep} />
            </StepContainer>
          )}

          {/* Professional Summary Step */}
          {currentStep === 'summary' && (
            <StepContainer key="summary">
              <StepHeader
                icon={STEP_INFO.summary.icon}
                title={STEP_INFO.summary.title}
                description={STEP_INFO.summary.description}
              />

              <div>
                <label className="mb-1.5 block text-sm font-medium">Professional Summary</label>
                <Textarea
                  value={data.profile.summary || ''}
                  onChange={(e) => updateProfile('summary', e.target.value)}
                  placeholder="e.g. Product engineer with 8 years building consumer apps used by millions. I turn ambiguous problems into clear roadmaps and ship measurable outcomes."
                  rows={8}
                  className="w-full resize-y"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Optional — a few sentences on your focus, strengths, and the impact you want to
                  make.
                </p>
              </div>

              <StepNavigation onBack={goToPreviousStep} onNext={goToNextStep} />
            </StepContainer>
          )}

          {/* Complete Step */}
          {currentStep === 'complete' && (
            <StepContainer key="complete">
              <div className="py-6">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"
                >
                  <Check className="h-6 w-6 text-primary" />
                </motion.div>

                <h2 className="text-display text-2xl sm:text-3xl">You&apos;re all set</h2>
                <p className="mt-3 text-base text-muted-foreground">
                  Here&apos;s a quick summary before we create your resume.
                </p>

                <div className="mb-8 mt-8 grid grid-cols-2 gap-3 text-left sm:grid-cols-3">
                  <SummaryCard
                    label="Profile"
                    value={
                      data.profile.firstName
                        ? [data.profile.firstName, data.profile.middleName, data.profile.lastName]
                            .filter(Boolean)
                            .join(' ')
                        : 'Not set'
                    }
                  />
                  <SummaryCard label="Experiences" value={`${data.experiences.length} entries`} />
                  <SummaryCard label="Education" value={`${data.educations.length} entries`} />
                  <SummaryCard label="Skills" value={`${skillCount} skills`} />
                  <SummaryCard
                    label="Projects"
                    value={`${data.projects.filter((p) => p.isVisible).length} visible`}
                  />
                </div>

                {error && (
                  <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-border/60 pt-6">
                  <Button variant="ghost" onClick={goToPreviousStep} disabled={isSaving}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={handleOpenTemplateGallery}
                    disabled={isSaving}
                    size="lg"
                    className="gap-2 px-8"
                  >
                    {isSaving ? (
                      <>
                        <Spinner size="sm" />
                        Creating resume…
                      </>
                    ) : (
                      <>
                        Choose template
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <ResumeTemplateGallery
                profile={templatePreviewProfile}
                currentDesign={defaultResumeDesign}
                currentTemplateId={DEFAULT_RESUME_TEMPLATE_ID}
                previewDataPolicy={TEMPLATE_PREVIEW_ON_CREATE}
                open={templateGalleryOpen}
                onOpenChange={setTemplateGalleryOpen}
                hideTrigger
                title="Choose your resume template"
                applyLabel="Create resume"
                onSelect={handleResumeTemplateSelect}
              />
            </StepContainer>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// Wrap with Suspense for useSearchParams
export default function OnboardingBuildPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <BuildPageContent />
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
  title,
  description,
  count,
}: {
  icon?: typeof User;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className="pb-2">
      <div className="flex items-center gap-2.5">
        <h2 className="text-display text-2xl">{title}</h2>
        {count !== undefined && (
          <Badge variant="secondary" className="font-medium">
            {count}
          </Badge>
        )}
      </div>
      <p className="mt-2 text-base text-muted-foreground">{description}</p>
    </div>
  );
}

function StepNavigation({
  onBack,
  onNext,
  backLabel = 'Back',
  nextLabel = 'Next',
}: {
  onBack: () => void;
  onNext: () => void;
  backLabel?: string;
  nextLabel?: string;
}) {
  return (
    <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-6">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {backLabel}
      </Button>
      <Button onClick={onNext}>
        {nextLabel}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
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
    <div className="w-full rounded-xl border border-dashed border-border/60 bg-muted/30 px-6 py-10 text-center">
      <p className="mb-4 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onAdd} className="gap-2">
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}

/** Full-width entry shell so experience/education/project forms match name & email. */
function EntryFormShell({
  children,
  onDelete,
  onSave,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  onSave?: () => void;
}) {
  return (
    <div className="w-full space-y-4 rounded-xl border border-border/70 bg-background p-5 sm:p-6">
      {children}
      <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive">
          <Trash2 className="mr-1 h-4 w-4" />
          Delete
        </Button>
        {onSave && (
          <Button size="sm" onClick={onSave}>
            <Check className="mr-1 h-4 w-4" />
            Done
          </Button>
        )}
      </div>
    </div>
  );
}

const EXPERIENCE_DESCRIPTION_PLACEHOLDER = [
  'Increased conversion 28% by redesigning checkout',
  'Owned roadmap for a 12-person product team',
  'Cut API latency from 800ms to 120ms',
  'Grew ARR $1.2M by launching self-serve billing',
  'Reduced onboarding time 40% with guided setup',
  'Shipped feature used by 50k weekly active users',
].join('\n');

const EDUCATION_DESCRIPTION_PLACEHOLDER =
  'Relevant coursework, honors, leadership, or academic achievements — quantify when you can.';

const PROJECT_DESCRIPTION_PLACEHOLDER =
  'Built a dashboard used by 5k weekly users\nReduced report generation from 10 min to 30 sec\nShipped mobile + web from one React codebase';

/** Keep the raw textarea value while typing; persist only non-empty lines as bullets. */
function linesToBullets(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function bulletsToText(bullets: string[] | undefined): string {
  if (!bullets || bullets.length === 0) return '';
  return bullets.map((b) => stripHtmlTags(b)).join('\n');
}

function experienceDescriptionHtml(experience: ParsedExperience): string {
  if (experience.bulletsHtml && !isHtmlEmpty(experience.bulletsHtml)) {
    return experience.bulletsHtml;
  }
  return bulletsToHtml(experience.bullets);
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
  // Local HTML draft — starts blank/plain when empty (no auto bullet list).
  const [descriptionHtml, setDescriptionHtml] = useState(() =>
    experienceDescriptionHtml(experience)
  );

  if (isEditing) {
    return (
      <EntryFormShell onDelete={onDelete} onSave={onSave}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor={`current-${experience.id}`} className="text-sm">
            I currently work here
          </label>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Description</label>
          <RichTextEditor
            value={descriptionHtml}
            onChange={(html) => {
              setDescriptionHtml(html);
              if (isHtmlEmpty(html)) {
                onUpdate({ bullets: [], bulletsHtml: undefined });
                return;
              }
              onUpdate({ bullets: htmlToBullets(html), bulletsHtml: html });
            }}
            placeholder={EXPERIENCE_DESCRIPTION_PLACEHOLDER}
            minHeight="140px"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Starts blank. Use the toolbar for bullets, bold, and alignment. Prefer action + impact
            with numbers. Leave blank if you prefer.
          </p>
        </div>
      </EntryFormShell>
    );
  }

  const hasRichDescription = experience.bulletsHtml && !isHtmlEmpty(experience.bulletsHtml);
  const hasBulletDescription = experience.bullets && experience.bullets.length > 0;
  const isHidden = experience.isVisible === false;

  return (
    <Card
      className={cn(
        'group relative w-full cursor-pointer transition-colors hover:bg-muted/30',
        isHidden && 'opacity-50'
      )}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
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
            {hasRichDescription ? (
              <div
                className="prose prose-sm dark:prose-invert mt-2 line-clamp-2 max-w-none text-muted-foreground"
                dangerouslySetInnerHTML={{
                  __html: sanitizeRichHtml(experience.bulletsHtml!),
                }}
              />
            ) : (
              hasBulletDescription && (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {experience.bullets!.map((b) => stripHtmlTags(b)).join(' · ')}
                </p>
              )
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                onUpdate({ isVisible: isHidden });
              }}
              title={isHidden ? 'Show on resume' : 'Hide from resume'}
              aria-label={isHidden ? 'Show on resume' : 'Hide from resume'}
            >
              {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              aria-label="Edit experience"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Delete experience"
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
      <EntryFormShell onDelete={onDelete} onSave={onSave}>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Institution *</label>
          <Input
            placeholder="e.g. Stanford University"
            value={education.institution}
            onChange={(e) => onUpdate({ institution: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div>
          <label className="mb-1.5 block text-sm font-medium">Location</label>
          <Input
            placeholder="e.g. Stanford, CA"
            value={education.location || ''}
            onChange={(e) => onUpdate({ location: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        <div>
          <label className="mb-1.5 block text-sm font-medium">Description</label>
          <Textarea
            placeholder={EDUCATION_DESCRIPTION_PLACEHOLDER}
            value={education.description || ''}
            onChange={(e) => onUpdate({ description: e.target.value })}
            rows={5}
            className="w-full resize-y"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Optional — add honors, activities, or results that strengthen this entry.
          </p>
        </div>
      </EntryFormShell>
    );
  }

  const isHidden = education.isVisible === false;

  return (
    <Card
      className={cn(
        'group relative w-full cursor-pointer transition-colors hover:bg-muted/30',
        isHidden && 'opacity-50'
      )}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium">{education.degree || 'Degree'}</h4>
            <p className="text-sm text-muted-foreground">
              {education.institution || 'Unknown Institution'}
              {education.fieldOfStudy && ` · ${education.fieldOfStudy}`}
              {education.location && ` · ${education.location}`}
            </p>
            {(education.startDate || education.endDate) && (
              <p className="text-xs text-muted-foreground">
                {education.startDate || '?'} — {education.endDate || 'Present'}
                {education.gpa && ` · GPA: ${education.gpa}`}
              </p>
            )}
            {education.description && (
              <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {stripHtmlTags(education.description)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                onUpdate({ isVisible: isHidden });
              }}
              title={isHidden ? 'Show on resume' : 'Hide from resume'}
              aria-label={isHidden ? 'Show on resume' : 'Hide from resume'}
            >
              {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              aria-label="Edit education"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Delete education"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkillGroupCard({
  group,
  title,
  isEditing,
  onEdit,
  onSave,
  onUpdate,
  onDelete,
}: {
  group: ParsedSkillGroup;
  title: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onUpdate: (updates: Partial<ParsedSkillGroup>) => void;
  onDelete: () => void;
}) {
  const [skillsHtml, setSkillsHtml] = useState(() => group.skillsHtml ?? '');

  useEffect(() => {
    if (isEditing) {
      setSkillsHtml(group.skillsHtml ?? '');
    }
  }, [isEditing, group.id, group.skillsHtml]);

  if (isEditing) {
    return (
      <EntryFormShell onDelete={onDelete} onSave={onSave}>
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Category <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            placeholder="e.g. Languages"
            value={group.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Skills</label>
          <RichTextEditor
            value={skillsHtml}
            onChange={(html) => {
              setSkillsHtml(html);
              onUpdate({ skillsHtml: html });
            }}
            placeholder="e.g. Python, Java, TypeScript — or use bullets, bold, etc."
            minHeight="120px"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Category is optional. Use the toolbar for bullets, bold, and alignment.
          </p>
        </div>
      </EntryFormShell>
    );
  }

  const preview = skillGroupPreview(group.skillsHtml);
  const hasSkills = !isHtmlEmpty(group.skillsHtml);

  return (
    <Card
      className="group relative w-full cursor-pointer transition-colors hover:bg-muted/30"
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium">{title}</h4>
            {hasSkills ? (
              <div
                className="prose prose-sm dark:prose-invert mt-2 line-clamp-2 max-w-none text-muted-foreground"
                dangerouslySetInnerHTML={{
                  __html: sanitizeRichHtml(group.skillsHtml),
                }}
              />
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{preview}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              aria-label="Edit skills"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Delete skills category"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Same editable form for resume, GitHub, and manually added projects — one open at a time
function ProjectCard({
  project,
  isEditing,
  onEdit,
  onSave,
  onUpdate,
  onDelete,
}: {
  project: ParsedProject;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onUpdate: (updates: Partial<ParsedProject>) => void;
  onDelete: () => void;
}) {
  const [descriptionText, setDescriptionText] = useState(
    () => bulletsToText(project.highlights) || project.description || ''
  );

  useEffect(() => {
    if (isEditing) {
      setDescriptionText(bulletsToText(project.highlights) || project.description || '');
    }
  }, [isEditing, project.id, project.highlights, project.description]);

  if (isEditing) {
    return (
      <EntryFormShell onDelete={onDelete} onSave={onSave}>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Project title *</label>
          <Input
            placeholder="e.g. Real-time analytics dashboard"
            value={project.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Description</label>
          <Textarea
            value={descriptionText}
            onChange={(e) => {
              const text = e.target.value;
              setDescriptionText(text);
              const highlights = linesToBullets(text);
              onUpdate({
                highlights,
                description: highlights.join('\n') || undefined,
              });
            }}
            placeholder={PROJECT_DESCRIPTION_PLACEHOLDER}
            rows={5}
            className="w-full resize-y"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            One line per bullet. Describe impact with numbers when you can. Leave blank if you
            prefer.
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Technologies</label>
          <Input
            placeholder="e.g. React, TypeScript, PostgreSQL"
            value={(project.technologies || []).join(', ')}
            onChange={(e) =>
              onUpdate({
                technologies: e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Repo URL</label>
            <Input
              placeholder="https://github.com/…"
              value={project.repoUrl || ''}
              onChange={(e) => onUpdate({ repoUrl: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Live URL</label>
            <Input
              placeholder="https://…"
              value={project.liveUrl || ''}
              onChange={(e) => onUpdate({ liveUrl: e.target.value || undefined })}
            />
          </div>
        </div>
      </EntryFormShell>
    );
  }

  const summary =
    bulletsToText(project.highlights) ||
    project.description ||
    (project.technologies || []).join(', ');
  const isHidden = project.isVisible === false;

  return (
    <Card
      className={cn(
        'group relative w-full cursor-pointer transition-colors hover:bg-muted/30',
        isHidden && 'opacity-50'
      )}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium">{project.title || 'Untitled Project'}</h4>
            {(project.technologies || []).length > 0 && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {(project.technologies || []).join(' · ')}
              </p>
            )}
            {summary && summary !== (project.technologies || []).join(', ') ? (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{summary}</p>
            ) : null}
            {project.repoUrl || project.liveUrl ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {project.repoUrl || project.liveUrl}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                onUpdate({ isVisible: isHidden });
              }}
              title={isHidden ? 'Show on resume' : 'Hide from resume'}
              aria-label={isHidden ? 'Show on resume' : 'Hide from resume'}
            >
              {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              aria-label="Edit project"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Delete project"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <p className="text-eyebrow">{label}</p>
      <p className="mt-1.5 font-medium text-foreground">{value}</p>
    </div>
  );
}
