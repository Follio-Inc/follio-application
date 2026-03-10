/**
 * Portfolio Template System — Type Definitions
 *
 * Templates are complete, pre-built, pixel-perfect portfolio designs.
 * AI doesn't generate code — it selects a template, writes copy, and
 * configures which sections to show. The template handles all rendering.
 *
 * Data flow:
 *   Profile (DB) → Template Renderer → Pixel-perfect page
 *   AI only writes: headlines, about text, CTAs, SEO copy
 */

// ============================================================================
// TEMPLATE PORTFOLIO DATA (stored in GeneratedPortfolio.plan)
// ============================================================================

/**
 * The complete data contract for a template-based portfolio.
 * Stored as JSON in the GeneratedPortfolio.plan column.
 */
export interface TemplatePortfolio {
  /** Which template kit to render with */
  templateId: string;

  /** AI-generated copy — the only creative AI output */
  copy: TemplateCopy;

  /** Section visibility and ordering */
  sections: TemplateSectionConfig[];

  /** Style customization within the template's bounded options */
  style: TemplateStyleConfig;
}

/**
 * AI-generated copy for the portfolio.
 * This is the ONLY thing AI writes — everything else is data from the profile.
 */
export interface TemplateCopy {
  /** Hero headline — bold identity statement, e.g. "I'm John, a Web Developer" */
  heroHeadline: string;

  /** Short intro text below the headline */
  heroSubtext: string;

  /** About section title, e.g. "Nice to meet you, I'm John Carter" */
  aboutTitle: string;

  /** About section body text — 2-4 sentences, narrative voice */
  aboutText: string;

  /** Contact section title, e.g. "Let's work together" */
  contactTitle: string;

  /** Contact section subtitle, e.g. "Get in touch with me" */
  contactSubtext: string;

  /** Primary CTA label, e.g. "Browse Portfolio" */
  primaryCtaLabel: string;

  /** SEO page title */
  seoTitle: string;

  /** SEO meta description */
  seoDescription: string;
}

// ============================================================================
// SECTION CONFIGURATION
// ============================================================================

/** All section types a template can support */
export type TemplateSectionType =
  | 'navigation'
  | 'hero'
  | 'about'
  | 'experience'
  | 'projects'
  | 'skills'
  | 'education'
  | 'certifications'
  | 'awards'
  | 'github'
  | 'blog'
  | 'contact'
  | 'footer';

/** Configuration for a single section */
export interface TemplateSectionConfig {
  /** Unique section ID */
  id: string;

  /** Section type */
  type: TemplateSectionType;

  /** Whether this section is visible */
  enabled: boolean;

  /** Display order (lower = higher on page) */
  order: number;

  /** User-edited content overrides for this section */
  overrides?: Record<string, unknown>;
}

// ============================================================================
// STYLE CONFIGURATION
// ============================================================================

/** Style options within a template's bounded choices */
export interface TemplateStyleConfig {
  /** Accent color (hex) — from template's compatible list */
  accentColor: string;

  /** Font family identifier — from template's compatible list */
  fontFamily: string;
}

// ============================================================================
// TEMPLATE KIT METADATA
// ============================================================================

/** Metadata describing a template kit's capabilities and requirements */
export interface TemplateKitMeta {
  /** Unique template identifier, e.g. "developer-dark" */
  id: string;

  /** Human-readable name */
  name: string;

  /** Short description */
  description: string;

  /** Preview image URL (for template selection UI) */
  previewUrl: string | null;

  /** Tags for matching (e.g. "dark", "developer", "minimal") */
  tags: string[];

  /** Default section configuration for this template */
  defaultSections: TemplateSectionConfig[];

  /** Accent colors this template is designed to work with */
  compatibleAccentColors: Array<{ name: string; value: string }>;

  /** Font families this template supports */
  compatibleFonts: Array<{ id: string; name: string; css: string }>;

  /** Sections this template supports */
  supportedSections: TemplateSectionType[];
}

// ============================================================================
// TEMPLATE COMPONENT PROPS
// ============================================================================

/**
 * Props passed to every template section component.
 * The template receives the full profile and renders what it needs.
 */
export interface TemplateSectionProps {
  /** The complete profile with all relations */
  profile: TemplateProfileData;

  /** AI-generated copy */
  copy: TemplateCopy;

  /** Style configuration */
  style: TemplateStyleConfig;

  /** User overrides for this specific section */
  overrides?: Record<string, unknown>;
}

/**
 * Props for the top-level template renderer component.
 */
export interface TemplateRendererProps {
  /** Profile data to render */
  profile: TemplateProfileData;

  /** Template portfolio configuration (from GeneratedPortfolio.plan) */
  portfolio: TemplatePortfolio;
}

// ============================================================================
// PROFILE DATA (what templates receive)
// ============================================================================

/**
 * Normalized profile data passed to templates.
 * This is a serializable subset of FullProfile — no Prisma types,
 * no Date objects, all strings.
 */
export interface TemplateProfileData {
  id: string;
  handle: string;
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  summary: string | null;
  avatarUrl: string | null;
  location: string | null;

  contactInfo: {
    email: string | null;
    phone: string | null;
    website: string | null;
  } | null;

  links: Array<{
    id: string;
    type: string;
    url: string;
    label: string | null;
  }>;

  workExperiences: Array<{
    id: string;
    company: string;
    companyLogoUrl: string | null;
    role: string;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    bullets: string[];
    isVisible: boolean;
  }>;

  educations: Array<{
    id: string;
    institution: string;
    degree: string | null;
    fieldOfStudy: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    gpa: string | null;
    isVisible: boolean;
  }>;

  skills: Array<{
    id: string;
    name: string;
    level: string | null;
    groupId: string | null;
    isVisible: boolean;
  }>;

  skillGroups: Array<{
    id: string;
    name: string;
    skills: Array<{
      id: string;
      name: string;
      level: string | null;
    }>;
  }>;

  projects: Array<{
    id: string;
    title: string;
    description: string | null;
    url: string | null;
    repoUrl: string | null;
    imageUrl: string | null;
    techStack: string[];
    isVisible: boolean;
    showOnPortfolio: boolean;
    ghStars: number | null;
    ghForks: number | null;
    ghLanguage: string | null;
  }>;

  certifications: Array<{
    id: string;
    name: string;
    issuer: string;
    issueDate: string | null;
    credentialUrl: string | null;
    isVisible: boolean;
  }>;

  awards: Array<{
    id: string;
    title: string;
    issuer: string | null;
    date: string | null;
    description: string | null;
    isVisible: boolean;
  }>;

  blogPosts: Array<{
    id: string;
    title: string;
    url: string;
    excerpt: string | null;
    thumbnail: string | null;
    publishedAt: string | null;
    platform: string | null;
    isVisible: boolean;
  }>;

  photos: Array<{
    id: string;
    url: string;
    caption: string | null;
    category: string;
  }>;

  github: {
    username: string;
    avatarUrl: string | null;
    bio: string | null;
    publicRepos: number;
    followers: number;
    totalStars: number;
    primaryLanguages: string[];
  } | null;
}

// ============================================================================
// TEMPLATE KIT INTERFACE
// ============================================================================

/**
 * The interface every template kit must implement.
 * A kit provides metadata + a React component that renders the full portfolio.
 */
export interface TemplateKit {
  /** Template metadata */
  meta: TemplateKitMeta;

  /**
   * The React component that renders this template.
   * Receives profile data + portfolio config, outputs a complete page.
   */
  Component: React.ComponentType<TemplateRendererProps>;
}
