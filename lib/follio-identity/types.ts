/**
 * The Follio — a person's shareable page.
 *
 * The model is ordered the way a stranger reads it after scanning a QR code at a
 * career fair: who is this, how do I reach them, then what have they done.
 * Resume and work are doors off this page, not sibling products.
 */

export type FollioLinkKind =
  | 'github'
  | 'linkedin'
  | 'twitter'
  | 'medium'
  | 'substack'
  | 'hashnode'
  | 'devto'
  | 'dribbble'
  | 'behance'
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'threads'
  | 'stackoverflow'
  | 'gitlab'
  | 'website'
  | 'other';

export type FollioLink = {
  id: string;
  label: string;
  /** Handle or hostname shown beside the label, e.g. `@ada` or `ada.dev`. */
  detail: string | null;
  url: string;
  kind: FollioLinkKind;
};

export type FollioCurrentRole = {
  role: string;
  company: string;
  companyUrl: string | null;
};

export type FollioContact = {
  /** Cloaked token — unveil before display, copy, or `mailto:`. */
  email: string | null;
  /** Cloaked dial string for `tel:` after unveil. */
  phone: string | null;
  /** Cloaked readable number, unveiled only after the visitor asks. */
  phoneDisplay: string | null;
  website: string | null;
  websiteLabel: string | null;
  location: string | null;
};

/**
 * Where someone worked. The timeline shows role, employer, and dates; location,
 * type, and highlights stay behind a peek so the page stays glanceable.
 */
export type FollioExperienceItem = {
  id: string;
  role: string;
  company: string;
  /** Used to resolve the employer's official logo. */
  companyUrl: string | null;
  period: string | null;
  /** Human tenure derived from the dates, e.g. "2 yrs 1 mo". */
  duration: string | null;
  isCurrent: boolean;
  location: string | null;
  /** Human label, e.g. "Full-time" or "Remote". */
  arrangement: string | null;
  /** Two proof points for the role peek — complete lines, not cut with an ellipsis. */
  highlights: string[];
};

/** Where someone studied. Extra academic detail stays behind a peek. */
export type FollioEducationItem = {
  id: string;
  institution: string;
  institutionUrl: string | null;
  /** Degree and field combined, e.g. "BS, Computer Science". */
  credential: string | null;
  period: string | null;
  location: string | null;
  gpa: string | null;
  description: string | null;
  honors: string[];
  activities: string[];
};

/** Deeper views reachable from the Follio. */
export type FollioDoors = {
  resume: boolean;
  work: boolean;
};

export type FollioIdentity = {
  handle: string;
  fullName: string;
  /** Used in copy like "Reach Ada" — falls back to the full name. */
  shortName: string;
  initials: string;
  headline: string | null;
  avatarUrl: string | null;
  currentRole: FollioCurrentRole | null;
  contact: FollioContact;
  /** One or two sentences — who they are, not a résumé objective. */
  about: string | null;
  experience: FollioExperienceItem[];
  education: FollioEducationItem[];
  /** Top skills only, in the order the person ranked them. */
  skills: string[];
  links: FollioLink[];
  follioUrl: string;
  resumeHref: string;
  workHref: string;
  doors: FollioDoors;
};

export type FollioCompleteness = {
  hasName: boolean;
  hasPhoto: boolean;
  hasHeadline: boolean;
  hasPublicContact: boolean;
  isPublic: boolean;
  readyToShare: boolean;
  missing: string[];
};

export type FollioCompletenessInput = {
  firstName?: string | null;
  lastName?: string | null;
  headline?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
  emailPublic?: boolean | null;
  phone?: string | null;
  phonePublic?: boolean | null;
  status?: string | null;
};
