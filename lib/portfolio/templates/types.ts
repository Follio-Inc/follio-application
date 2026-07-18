/**
 * Portfolio Template System — Type Definitions
 *
 * Templates are complete, pre-built, pixel-perfect portfolio designs.
 * The AI pipeline analyzes the user's data and writes narrative copy,
 * then templates render with that enriched data.
 *
 * Data flow:
 *   Resume / parsed source → AI Pipeline (copy + portfolio-style content)
 *     → TemplatePortfolio (owned content + copy) → Template Renderer
 *
 * AI writes: headlines, about text, section intros, CTAs, SEO copy, and
 * portfolio-style structural content (summaries, not resume bullet lists).
 * Templates render: portfolio-owned content + AI copy → polished page.
 * Resume edits never mutate portfolio content after generation.
 */

// ============================================================================
// SHARED CONSTANTS
// ============================================================================

/**
 * HTML data-attribute placed on the element that templates consider the most
 * visually prominent for thumbnail / link-preview rendering.
 *
 * Template renderers add this attribute to a specific content element
 * (e.g. the hero text block), and the dashboard thumbnail component
 * centres the preview on that element.
 *
 * Usage in templates:  `<div data-portfolio-thumbnail-focus> … </div>`
 * Query in consumers:  `doc.querySelector('[data-portfolio-thumbnail-focus]')`
 */
export const PORTFOLIO_THUMBNAIL_FOCUS_ATTR = 'data-portfolio-thumbnail-focus';

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

  /** AI-generated copy — narrative text for the portfolio */
  copy: TemplateCopy;

  /**
   * Portfolio-owned structural content (experience, projects, skills, etc.).
   *
   * Snapshotted from a resume/parsed source at generation time and transformed
   * into portfolio style (summaries, fewer bullets). Edited only in the
   * portfolio editor — never live-linked to the resume builder.
   *
   * Optional for legacy plans; renderers fall back to the live profile until
   * the portfolio is regenerated or saved from the editor.
   */
  content?: TemplateProfileData;

  /** Section visibility and ordering */
  sections: TemplateSectionConfig[];

  /** Style customization within the template's bounded options */
  style: TemplateStyleConfig;

  /**
   * AI enrichment data — deep insights from the AI pipeline.
   * Templates can progressively adopt these fields for richer rendering.
   * Optional: portfolios generated without AI will have this as null.
   */
  enrichment: TemplateAIEnrichment | null;

  /**
   * User-controlled overrides for media that would otherwise come from the
   * portfolio content (avatar, project images). Stored inside the plan so the
   * entire portfolio presentation — including images — can be drafted and
   * published atomically without mutating the underlying resume data.
   *
   * Optional: portfolios that have never been edited will have this absent.
   */
  overrides?: TemplatePortfolioOverrides | null;
}

/**
 * Media + presentation overrides applied on top of the normalized profile data
 * at render time. These let a user tailor the portfolio's imagery without
 * touching the canonical profile (which also powers their resume).
 */
export interface TemplatePortfolioOverrides {
  /**
   * Portfolio avatar override.
   * - `string` → use this image URL for the portrait
   * - `null` → explicitly hide the portrait
   * - absent (key omitted) → fall back to the profile's avatar
   */
  avatarUrl?: string | null;

  /**
   * Per-project image overrides, keyed by project id.
   * - `string` → use this image URL for the project card
   * - `null` → explicitly show no image (clean text-forward card)
   * - absent (key omitted) → fall back to the project's own imageUrl
   */
  projectImages?: Record<string, string | null>;

  /**
   * Hero portrait preset (Minimal Studio). Each style is a full composition —
   * size, shape, and placement — not separate toggles.
   */
  portraitStyle?: PortraitStyle;

  /** @deprecated Use `portraitStyle`. Kept for draft migration only. */
  portraitLayout?: PortraitLayout;

  /**
   * Projects/work layout preset (Minimal Studio). Each option is a complete
   * grid composition — see `WORK_STYLES` for the available layouts.
   */
  workStyle?: WorkStyle;

  /**
   * About section layout preset (Minimal Studio). See `ABOUT_STYLES`.
   */
  aboutStyle?: AboutStyle;

  /**
   * Skills section layout preset (Minimal Studio). See `SKILLS_STYLES`.
   */
  skillsStyle?: SkillsStyle;
}

/** Editorial portrait preset for the Minimal Studio hero. */
export type PortraitStyle = 'style-1' | 'style-2' | 'style-3' | 'style-4' | 'style-5';

/** Projects/work layout preset for the Minimal Studio template. */
export type WorkStyle = 'editorial' | 'grid' | 'gallery';

/** About layout preset for the Minimal Studio template. */
export type AboutStyle = 'sidebar' | 'centered' | 'statement';

/** Skills layout preset for the Minimal Studio template. */
export type SkillsStyle = 'rows' | 'inline' | 'columns';

/** @deprecated Replaced by `PortraitStyle` presets. */
export type PortraitSize = 'small' | 'medium' | 'large';

/** @deprecated Replaced by `PortraitStyle` presets. */
export type PortraitAlign = 'left' | 'right';

/** @deprecated Replaced by `PortraitStyle` presets. */
export interface PortraitLayout {
  size: PortraitSize;
  align: PortraitAlign;
}

/**
 * AI-generated copy for the portfolio.
 * Core fields are always present (via default fallbacks).
 * Extended fields are populated when the AI pipeline runs.
 *
 * Editor vocabulary (keep UI labels consistent across sections):
 *   Label   → small line above the heading (eyebrow / contactSubtext)
 *   Heading → main title (heroHeadline / aboutTitle / contactTitle / sectionHeadings.title)
 *   Subtext → supporting rich text (heroSubtext / aboutText / sectionIntros / narratives)
 *             Medium-style: Body · Heading · Quote + alignment + emphasis
 */
export interface TemplateCopy {
  // ── Core Copy (always present) ──────────────────────────────────────

  /** Hero headline — bold identity statement, e.g. "I build systems that scale." */
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

  /** Primary CTA label, e.g. "Browse Portfolio →" */
  primaryCtaLabel: string;

  /** SEO page title */
  seoTitle: string;

  /** SEO meta description */
  seoDescription: string;

  // ── Extended Copy (from AI pipeline, optional) ──────────────────────

  /**
   * Section-specific intro text. Templates can render these above section content.
   * Key is the TemplateSectionType, value is 1-2 sentences.
   */
  sectionIntros?: Partial<Record<TemplateSectionType, string>>;

  /**
   * Per-project narrative descriptions — explains WHY the project matters.
   * Key is the project title (exact match), value is 2-3 sentences.
   */
  projectNarratives?: Record<string, string>;

  /**
   * Career journey narrative — not a re-listing, but a story arc.
   * 2-3 sentences about the trajectory of their career.
   */
  experienceNarrative?: string | null;

  /**
   * What their open source presence says about them.
   * Only populated when GitHub data exists.
   */
  githubNarrative?: string | null;

  /**
   * What their writing/blog presence reveals about them.
   * Only populated when blog data exists.
   */
  writingNarrative?: string | null;

  /** A memorable pull-quote or personal motto, if inferrable from data */
  pullQuote?: string | null;

  /**
   * Per-section heading overrides — the small eyebrow label and the large
   * section title (e.g. "Selected Work" / "Things I've made"). Lets the user
   * rewrite section headings the template would otherwise hardcode.
   *
   * Keyed by section type. Either field may be omitted or blank, in which case
   * the template's default heading for that section is used. The `about` and
   * `contact` sections keep their dedicated copy fields and only use the
   * `eyebrow` here.
   */
  sectionHeadings?: Partial<Record<TemplateSectionType, { eyebrow?: string; title?: string }>>;
}

/**
 * The keys of TemplateCopy that are always required (non-optional string fields).
 * Useful for validation loops where indexed assignment must stay type-safe.
 */
export type RequiredTemplateCopyField = {
  [K in keyof TemplateCopy]-?: TemplateCopy[K] extends string ? K : never;
}[keyof TemplateCopy];

// ============================================================================
// AI ENRICHMENT (optional deep insights for templates)
// ============================================================================

/**
 * Deep AI-derived insights that tell templates MORE about the person.
 * Templates use these to make smarter rendering decisions without
 * the template having to analyze raw data itself.
 *
 * This is the bridge between the AI pipeline and template rendering.
 * All fields are optional — templates degrade gracefully without them.
 */
export interface TemplateAIEnrichment {
  /** What kind of professional they are */
  archetype: string;
  /** Secondary archetypes for hybrid identities */
  secondaryArchetypes: string[];
  /** Career stage: student, early-career, mid-career, senior, executive, independent */
  careerStage: string;
  /** Key themes that define them (e.g., "distributed systems", "design thinking") */
  definingThemes: string[];
  /** What makes them genuinely unique */
  uniqueAngles: string[];
  /** Industries/domains they work in */
  domains: string[];

  /** Items that should be prominently featured (exact titles/names from data) */
  mustFeature: string[];
  /** Items that should be de-emphasized (exact titles/names) */
  weakItems: string[];

  /** Highlight facts for badges/pills (e.g., "8+ years experience", "15 GitHub stars") */
  highlightFacts: string[];

  /** Computed stats for optional display */
  stats: Array<{ label: string; value: string }>;

  /** Overall data richness 0-1 — helps templates decide density */
  dataRichness: number;

  /** Validation score 0-1 — confidence that all AI copy is factually grounded */
  validationScore: number;

  /** Pipeline metadata for debugging */
  _meta: {
    pipelineVersion: string;
    generatedAt: string;
    totalDurationMs: number;
    totalTokensUsed: { input: number; output: number };
    stagesRun: string[];
  };
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

/**
 * Portfolio appearance — light / dark / system for the published template.
 * Independent of the Follio app theme. Each template kit ships with both
 * light and dark palettes; this setting picks which one visitors see.
 */
export type PortfolioAppearance = 'light' | 'dark' | 'system';

/** Style options within a template's bounded choices */
export interface TemplateStyleConfig {
  /** Accent color (hex) — from template's compatible list */
  accentColor: string;

  /** Font family identifier — from template's compatible list */
  fontFamily: string;

  /**
   * Light / dark / system appearance for the portfolio document.
   * When omitted, falls back to the template kit's `defaultAppearance`.
   */
  appearance?: PortfolioAppearance;
}

/** Default style values applied when fields are missing from saved plans */
export const TEMPLATE_STYLE_DEFAULTS = {
  appearance: 'system' satisfies PortfolioAppearance,
} as const;

// ============================================================================
// TEMPLATE KIT METADATA
// ============================================================================

/**
 * Navbar theming for seamless integration with the Follio ProfileNavbar.
 * Templates declare a color mode so the top bar blends with the portfolio.
 * The ProfileNavbar applies these via scoped CSS variable overrides.
 */
export interface TemplateNavbarTheme {
  /** Base color mode — forces the navbar into dark or light regardless of system preference */
  mode: 'dark' | 'light';

  /**
   * Optional CSS variable overrides for fine-tuning (key: variable name without `--`, value: HSL triple).
   * Example: `{ background: '223 39% 7%' }` overrides `--background` to match a specific dark navy.
   */
  overrides?: Record<string, string>;
}

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

  /**
   * Default headings (eyebrow + title) for the template's content sections.
   * Used as render-time fallbacks and as placeholders in the editor's
   * "heading" fields. Only sections listed here expose editable headings.
   */
  defaultSectionHeadings?: Partial<Record<TemplateSectionType, { eyebrow: string; title: string }>>;

  /**
   * Default appearance when the user has not chosen one yet.
   * Typically matches the template's primary design direction.
   */
  defaultAppearance?: PortfolioAppearance;

  /**
   * Navbar theme — tells the Follio top bar how to blend with this template.
   * When omitted, the navbar uses the default system dark/light theme.
   */
  navbarTheme?: TemplateNavbarTheme;

  /**
   * The section type whose content is most visually prominent for
   * thumbnail / preview rendering. The dashboard thumbnail component
   * scrolls to the element marked with `PORTFOLIO_THUMBNAIL_FOCUS_ATTR`
   * inside this section. Also used by future link-preview APIs.
   *
   * Defaults to `'hero'` when omitted.
   */
  thumbnailFocusSection?: TemplateSectionType;
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
  middleName: string | null;
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
