/**
 * Portfolio Generation Type System
 *
 * This file defines every type used across the portfolio generation pipeline.
 * The system has 3 clear layers:
 *   1. Collected Data  — raw normalized data from all sources
 *   2. AI Pipeline      — staged AI analysis outputs
 *   3. Portfolio Plan   — the final renderable contract
 *
 * The AI never outputs code. It outputs structured decisions.
 * Pre-built, tested components render those decisions.
 */

// ============================================================================
// LAYER 1: COLLECTED PROFILE DATA (Input to AI Pipeline)
// ============================================================================

/**
 * Canonical representation of a user's professional identity,
 * collected and normalized from all connected sources.
 * This is the single input to the AI pipeline.
 */
export interface CollectedProfileData {
  /** Basic identity */
  basics: {
    firstName: string | null;
    lastName: string | null;
    headline: string | null;
    summary: string | null;
    location: string | null;
    avatarUrl: string | null;
  };

  /** Contact information (only public-facing) */
  contact: {
    email: string | null;
    phone: string | null;
    website: string | null;
  };

  /** Social and professional links */
  links: CollectedLink[];

  /** Work experience entries */
  workExperiences: CollectedWorkExperience[];

  /** Education entries */
  education: CollectedEducation[];

  /** Skills with optional grouping */
  skills: CollectedSkill[];
  skillGroups: CollectedSkillGroup[];

  /** Projects (manual + GitHub) */
  projects: CollectedProject[];

  /** Blog posts / writing samples */
  blogPosts: CollectedBlogPost[];

  /** YouTube videos */
  youtubeVideos: CollectedYouTubeVideo[];

  /** Awards and recognitions */
  awards: CollectedAward[];

  /** Certifications */
  certifications: CollectedCertification[];

  /** GitHub-specific profile data */
  github: CollectedGitHubProfile | null;

  /** Photos available for portfolio use */
  photos: CollectedPhoto[];

  /** Connected data sources with their status */
  connectedSources: ConnectedSource[];

  /** Metadata about the collection */
  meta: {
    collectedAt: string;
    profileId: string;
    handle: string;
    /** Sources that contributed data */
    activeSources: string[];
    /** Data completeness score 0-1 */
    completeness: number;
  };
}

export interface CollectedLink {
  type: string;
  url: string;
  label: string | null;
  source: string;
}

export interface CollectedWorkExperience {
  company: string;
  companyUrl: string | null;
  companyLogo: string | null;
  role: string;
  location: string | null;
  locationType: string | null;
  employmentType: string | null;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  bullets: string[];
  tags: string[];
  source: string;
}

export interface CollectedEducation {
  institution: string;
  institutionUrl: string | null;
  institutionLogo: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  gpa: string | null;
  description: string | null;
  activities: string[];
  honors: string[];
  source: string;
}

export interface CollectedSkill {
  name: string;
  level: string | null;
  yearsOfExp: number | null;
  groupName: string | null;
  source: string;
}

export interface CollectedSkillGroup {
  name: string;
  skills: string[];
}

export interface CollectedProject {
  title: string;
  description: string | null;
  shortDesc: string | null;
  url: string | null;
  repoUrl: string | null;
  imageUrl: string | null;
  images: string[];
  techStack: string[];
  highlights: string[];
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  featured: boolean;
  source: string;
  /** GitHub-specific enrichment */
  github?: {
    stars: number;
    forks: number;
    language: string | null;
    topics: string[];
    owner: string | null;
    repo: string | null;
    readme: string | null;
    isPinned: boolean;
    lastPush: string | null;
    license: string | null;
    watchers: number;
  };
}

export interface CollectedBlogPost {
  title: string;
  url: string;
  excerpt: string | null;
  content: string | null;
  thumbnail: string | null;
  author: string | null;
  publishedAt: string | null;
  tags: string[];
  readTimeMin: number | null;
  claps: number | null;
  platform: string | null;
  platformIcon: string | null;
  isFeatured: boolean;
  source: string;
}

export interface CollectedYouTubeVideo {
  videoId: string;
  title: string;
  description: string | null;
  url: string;
  thumbnail: string | null;
  publishedAt: string | null;
  duration: string | null;
  viewCount: number | null;
  likeCount: number | null;
  tags: string[];
  isFeatured: boolean;
}

export interface CollectedAward {
  title: string;
  issuer: string | null;
  date: string | null;
  description: string | null;
  url: string | null;
}

export interface CollectedCertification {
  name: string;
  issuer: string;
  issuerLogo: string | null;
  credentialId: string | null;
  credentialUrl: string | null;
  issueDate: string | null;
  expirationDate: string | null;
}

export interface CollectedGitHubProfile {
  username: string;
  avatarUrl: string | null;
  htmlUrl: string | null;
  bio: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  publicRepos: number;
  followers: number;
  following: number;
  totalStars: number;
  totalForks: number;
  primaryLanguages: string[];
  languageStats: Record<string, number> | null;
  contributionStats: Record<string, unknown> | null;
  organizations: Array<{ login: string; avatarUrl: string; url: string }>;
}

export interface CollectedPhoto {
  url: string;
  caption: string | null;
  category: string;
}

export interface ConnectedSource {
  source: string;
  status: string;
  lastImportedAt: string | null;
  itemsImported: number;
}

// ============================================================================
// LAYER 2: AI PIPELINE OUTPUTS (Staged Analysis)
// ============================================================================

/**
 * Stage A: Profile Understanding
 * Who is this person? What defines them?
 */
export interface ProfileUnderstanding {
  /** Primary professional archetype */
  primaryArchetype: ProfessionalArchetype;
  /** Secondary archetypes (for hybrids) */
  secondaryArchetypes: ProfessionalArchetype[];
  /** One-sentence identity summary (internal, not displayed) */
  identitySummary: string;
  /** Key themes that define this person (e.g., "distributed systems", "design thinking") */
  definingThemes: string[];
  /** Career stage assessment */
  careerStage: CareerStage;
  /** What makes them interesting/unique */
  uniqueAngles: string[];
  /** Industries/domains they operate in */
  domains: string[];
  /** Overall data richness assessment */
  dataRichness: DataRichness;

  _meta: PipelineStageMeta;
}

export type ProfessionalArchetype =
  | 'engineer'
  | 'designer'
  | 'writer'
  | 'researcher'
  | 'founder'
  | 'product-manager'
  | 'data-scientist'
  | 'devops-engineer'
  | 'marketer'
  | 'educator'
  | 'consultant'
  | 'creative'
  | 'analyst'
  | 'operator'
  | 'student'
  | 'career-changer';

export type CareerStage =
  | 'student'
  | 'early-career' // 0-2 years
  | 'mid-career' // 3-7 years
  | 'senior' // 8-14 years
  | 'executive' // 15+ or leadership title
  | 'independent'; // freelance, founder, consultant

export interface DataRichness {
  /** Overall richness score 0-1 */
  overall: number;
  /** Per-section richness */
  sections: {
    basics: number;
    experience: number;
    education: number;
    skills: number;
    projects: number;
    writing: number;
    github: number;
    awards: number;
    certifications: number;
  };
}

/**
 * Stage B: Evidence Extraction
 * What are the strongest proof points?
 */
export interface EvidenceExtraction {
  /** Ranked list of strongest proof points */
  topEvidence: EvidenceItem[];
  /** Measurable outcomes found in data */
  measurableOutcomes: string[];
  /** Technical credibility signals */
  technicalCredibility: CredibilitySignal[];
  /** Leadership/impact signals */
  leadershipSignals: string[];
  /** Writing quality assessment (if blog posts exist) */
  writingAssessment: WritingAssessment | null;
  /** Open source credibility */
  openSourceCredibility: OpenSourceAssessment | null;
  /** Items that should definitely be featured */
  mustFeature: string[];
  /** Items that are weak and should be de-emphasized or omitted */
  weakItems: string[];

  _meta: PipelineStageMeta;
}

export interface EvidenceItem {
  /** What the evidence is */
  claim: string;
  /** Which source data supports it */
  sourceRef: string;
  /** How strong this evidence is (0-1) */
  strength: number;
  /** Category of evidence */
  category: 'impact' | 'technical' | 'leadership' | 'creative' | 'academic' | 'community';
}

export interface CredibilitySignal {
  type: 'tech-depth' | 'breadth' | 'open-source' | 'scale' | 'recognition';
  description: string;
  strength: number;
}

export interface WritingAssessment {
  hasWriting: boolean;
  quality: 'exceptional' | 'strong' | 'adequate' | 'limited';
  topTopics: string[];
  bestPieces: string[];
}

export interface OpenSourceAssessment {
  hasOpenSource: boolean;
  strength: 'exceptional' | 'strong' | 'moderate' | 'minimal';
  topRepos: string[];
  totalStars: number;
  contributionLevel: string;
}

/**
 * Stage C: Portfolio Strategy
 * What kind of portfolio should this person have?
 */
export interface PortfolioStrategy {
  /** How many pages this portfolio should have */
  pageCount: number;
  /** Page definitions */
  pages: PageStrategy[];
  /** Overall content density preference */
  contentDensity: 'minimal' | 'moderate' | 'rich';
  /** Should the portfolio lead with narrative or evidence? */
  leadWith: 'narrative' | 'evidence' | 'projects' | 'experience';
  /** Tone of the portfolio */
  tone: PortfolioTone;
  /** What text to prioritize as the main hook */
  hookStrategy: string;

  _meta: PipelineStageMeta;
}

export interface PageStrategy {
  /** URL slug (e.g., "home", "projects", "writing") */
  slug: string;
  /** Display label for navigation */
  label: string;
  /** Purpose of this page */
  purpose: string;
  /** Ordered list of section types for this page */
  sectionTypes: PortfolioSectionType[];
  /** Is this the primary/home page? */
  isPrimary: boolean;
  /** Minimum items needed to justify this page existing */
  minimumItemsRequired: number;
}

export type PortfolioTone =
  | 'professional'
  | 'bold'
  | 'warm'
  | 'technical'
  | 'creative'
  | 'academic'
  | 'minimal';

export type PortfolioSectionType =
  | 'hero'
  | 'about'
  | 'experience-timeline'
  | 'experience-highlights'
  | 'featured-projects'
  | 'all-projects'
  | 'skills-overview'
  | 'skills-detailed'
  | 'education'
  | 'certifications'
  | 'awards'
  | 'github-showcase'
  | 'blog-showcase'
  | 'youtube-showcase'
  | 'publications'
  | 'contact'
  | 'links'
  | 'stats-bar'
  | 'testimonial-quote'
  | 'featured-writing';

/**
 * Stage D: Narrative Generation
 * Portfolio-level copy that speaks for the person.
 */
export interface NarrativeContent {
  /** Hero headline (bold, identity-defining) */
  headline: string;
  /** Sub-headline (context, role, or positioning) */
  subheadline: string;
  /** About/intro paragraph (2-4 sentences, narrative voice) */
  introParagraph: string;
  /** Short bio for meta/OG (1 sentence) */
  metaBio: string;
  /** Section introductions keyed by section type */
  sectionIntros: Partial<Record<PortfolioSectionType, string>>;
  /** Featured project framings (project title → narrative description) */
  projectFramings: Record<string, string>;
  /** Experience summary — not a re-listing, but a narrative of the journey */
  experienceNarrative: string | null;
  /** GitHub summary — what their open source presence says about them */
  githubNarrative: string | null;
  /** Writing summary — what their writing reveals */
  writingNarrative: string | null;
  /** A pull-quote or personal motto (if inferrable) */
  pullQuote: string | null;
  /** Call to action text */
  ctaText: string;

  _meta: PipelineStageMeta;
}

/**
 * Stage E: Design Brief
 * Structured visual direction for the renderer.
 */
export interface DesignBrief {
  /** Color theme selection from bounded palette */
  colorTheme: ColorTheme;
  /** Typography scale */
  typeScale: TypeScale;
  /** Animation level */
  animationLevel: AnimationLevel;
  /** Content density */
  density: ContentDensity;
  /** Layout preference */
  layoutPreference: LayoutPreference;
  /** Visual emphasis areas */
  emphasis: VisualEmphasis;
  /** Section-specific variant selections */
  sectionVariants: SectionVariantMap;

  _meta: PipelineStageMeta;
}

/**
 * Stage F: Validation Report
 * Grounding check — every claim traced to source.
 */
export interface ValidationReport {
  /** Overall validation score (0-1) */
  overallScore: number;
  /** Per-claim validation */
  claimValidations: ClaimValidation[];
  /** Warnings about potential issues */
  warnings: ValidationWarning[];
  /** Content that was modified during validation */
  modifications: ContentModification[];
  /** Whether the portfolio passed validation */
  passed: boolean;

  _meta: PipelineStageMeta;
}

export interface ClaimValidation {
  claim: string;
  location: string;
  isGrounded: boolean;
  sourceRef: string | null;
  confidence: number;
}

export interface ValidationWarning {
  severity: 'low' | 'medium' | 'high';
  message: string;
  location: string;
  suggestion: string | null;
}

export interface ContentModification {
  original: string;
  modified: string;
  reason: string;
  location: string;
}

/** Metadata for every pipeline stage */
export interface PipelineStageMeta {
  stage: string;
  model: string;
  tokensUsed: { input: number; output: number };
  durationMs: number;
  timestamp: string;
}

// ============================================================================
// LAYER 3: PORTFOLIO PLAN (Renderer Contract)
// ============================================================================

/**
 * The complete portfolio plan — the contract between AI pipeline and renderer.
 * The renderer takes this object and produces a polished page. No AI involved
 * at render time. Every value maps to a pre-built, tested component.
 */
export interface PortfolioPlan {
  /** Unique ID for this generation */
  id: string;
  /** Profile this portfolio belongs to */
  profileId: string;
  /** User handle for URL routing */
  handle: string;
  /** Version number for regeneration tracking */
  version: number;

  /** Global style configuration */
  style: PortfolioStyle;
  /** Page definitions */
  pages: PortfolioPage[];
  /** Navigation configuration */
  navigation: NavigationConfig;
  /** Footer configuration */
  footer: FooterConfig;
  /** SEO metadata */
  seo: SEOConfig;

  /** Pipeline outputs for debugging/observability */
  _pipeline: PipelineDebugInfo;
  /** Generation metadata */
  _generation: GenerationMeta;
}

// ─── Style System ───

export interface PortfolioStyle {
  colorTheme: ColorTheme;
  typeScale: TypeScale;
  animationLevel: AnimationLevel;
  density: ContentDensity;
}

export type ColorTheme =
  | 'slate-professional'
  | 'warm-earth'
  | 'cool-ocean'
  | 'deep-night'
  | 'clean-minimal'
  | 'bold-contrast'
  | 'soft-sage'
  | 'rich-plum'
  | 'sunset-warm'
  | 'arctic-frost'
  | 'forest-green'
  | 'coral-energy'
  | 'indigo-depth'
  | 'sand-neutral'
  | 'rose-elegant';

export type TypeScale = 'editorial' | 'technical' | 'compact' | 'spacious';
export type AnimationLevel = 'none' | 'subtle' | 'moderate';
export type ContentDensity = 'airy' | 'balanced' | 'dense';
export type LayoutPreference = 'single-column' | 'split' | 'magazine' | 'asymmetric';

export interface VisualEmphasis {
  /** Sections that get extra visual weight */
  highlightedSections: PortfolioSectionType[];
  /** Whether to use hero images/large visuals */
  useHeroVisual: boolean;
  /** Whether stats/metrics should be prominently displayed */
  showMetrics: boolean;
  /** Whether to use pull quotes */
  usePullQuotes: boolean;
}

export type SectionVariantMap = Partial<Record<PortfolioSectionType, string>>;

// ─── Page Structure ───

export interface PortfolioPage {
  /** URL slug */
  slug: string;
  /** Display label */
  label: string;
  /** Is this the home/primary page? */
  isPrimary: boolean;
  /** Page-level layout */
  layout: PageLayout;
  /** Ordered sections on this page */
  sections: PortfolioSection[];
}

export type PageLayout =
  | 'single-column-flow'
  | 'two-column-split'
  | 'magazine-grid'
  | 'alternating-blocks'
  | 'hero-fullscreen-scroll';

// ─── Section Definitions ───

/**
 * A single section in the portfolio. Each section maps to a
 * pre-built component + variant, populated with content.
 */
export interface PortfolioSection {
  /** Unique section ID */
  id: string;
  /** Component type to render */
  component: PortfolioComponentType;
  /** Variant of the component */
  variant: string;
  /** Content payload — shape depends on component type */
  content: PortfolioSectionContent;
  /** Display priority (1 = highest) */
  priority: number;
  /** Whether this section is visible */
  visible: boolean;
  /** Optional section heading override */
  heading?: string;
  /** Optional intro text for this section */
  intro?: string;
}

export type PortfolioComponentType =
  | 'hero'
  | 'about'
  | 'stats-bar'
  | 'experience-timeline'
  | 'experience-highlights'
  | 'project-showcase'
  | 'project-grid'
  | 'skills-display'
  | 'education-list'
  | 'certification-list'
  | 'award-list'
  | 'github-showcase'
  | 'blog-showcase'
  | 'youtube-showcase'
  | 'contact-section'
  | 'links-section'
  | 'pull-quote'
  | 'navigation'
  | 'footer';

// ─── Section Content Types ───

/** Content union — discriminated by component type */
export type PortfolioSectionContent =
  | HeroContent
  | AboutContent
  | StatsBarContent
  | ExperienceTimelineContent
  | ExperienceHighlightsContent
  | ProjectShowcaseContent
  | ProjectGridContent
  | SkillsDisplayContent
  | EducationListContent
  | CertificationListContent
  | AwardListContent
  | GitHubShowcaseContent
  | BlogShowcaseContent
  | YouTubeShowcaseContent
  | ContactSectionContent
  | LinksSectionContent
  | PullQuoteContent;

export interface HeroContent {
  type: 'hero';
  headline: string;
  subheadline: string;
  avatarUrl: string | null;
  showAvatar: boolean;
  ctaLabel: string;
  ctaTarget: string;
  /** e.g., link to resume, projects */
  secondaryCta?: { label: string; target: string };
}

export interface AboutContent {
  type: 'about';
  text: string;
  /** Optional highlight facts shown as badges/pills */
  highlightFacts?: string[];
}

export interface StatsBarContent {
  type: 'stats-bar';
  stats: Array<{
    label: string;
    value: string;
    icon?: string;
  }>;
}

export interface ExperienceTimelineContent {
  type: 'experience-timeline';
  experiences: Array<{
    company: string;
    companyLogo: string | null;
    role: string;
    location: string | null;
    startDate: string;
    endDate: string | null;
    isCurrent: boolean;
    bullets: string[];
    narrative: string | null;
  }>;
}

export interface ExperienceHighlightsContent {
  type: 'experience-highlights';
  narrative: string;
  highlights: Array<{
    company: string;
    role: string;
    highlight: string;
  }>;
}

export interface ProjectShowcaseContent {
  type: 'project-showcase';
  projects: Array<{
    title: string;
    description: string;
    narrative: string | null;
    url: string | null;
    repoUrl: string | null;
    imageUrl: string | null;
    techStack: string[];
    highlights: string[];
    github?: {
      stars: number;
      forks: number;
      language: string | null;
    };
    isFeatured: boolean;
  }>;
}

export interface ProjectGridContent {
  type: 'project-grid';
  projects: Array<{
    title: string;
    shortDesc: string;
    url: string | null;
    techStack: string[];
    github?: { stars: number; language: string | null };
  }>;
}

export interface SkillsDisplayContent {
  type: 'skills-display';
  groups: Array<{
    name: string;
    skills: Array<{
      name: string;
      level: string | null;
    }>;
  }>;
  /** Standalone skills not in any group */
  ungrouped: Array<{
    name: string;
    level: string | null;
  }>;
}

export interface EducationListContent {
  type: 'education-list';
  entries: Array<{
    institution: string;
    institutionLogo: string | null;
    degree: string | null;
    fieldOfStudy: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    gpa: string | null;
    honors: string[];
    activities: string[];
  }>;
}

export interface CertificationListContent {
  type: 'certification-list';
  entries: Array<{
    name: string;
    issuer: string;
    issuerLogo: string | null;
    credentialUrl: string | null;
    issueDate: string | null;
  }>;
}

export interface AwardListContent {
  type: 'award-list';
  entries: Array<{
    title: string;
    issuer: string | null;
    date: string | null;
    description: string | null;
  }>;
}

export interface GitHubShowcaseContent {
  type: 'github-showcase';
  username: string;
  profileUrl: string;
  avatarUrl: string | null;
  bio: string | null;
  narrative: string | null;
  stats: {
    publicRepos: number;
    totalStars: number;
    followers: number;
  };
  languages: Array<{ name: string; percentage: number }>;
  featuredRepos: Array<{
    name: string;
    description: string | null;
    url: string;
    stars: number;
    forks: number;
    language: string | null;
    isPinned: boolean;
  }>;
  organizations: Array<{ login: string; avatarUrl: string; url: string }>;
}

export interface BlogShowcaseContent {
  type: 'blog-showcase';
  narrative: string | null;
  platform: string | null;
  posts: Array<{
    title: string;
    url: string;
    excerpt: string | null;
    thumbnail: string | null;
    publishedAt: string | null;
    readTimeMin: number | null;
    tags: string[];
    isFeatured: boolean;
  }>;
}

export interface YouTubeShowcaseContent {
  type: 'youtube-showcase';
  channelTitle: string | null;
  videos: Array<{
    videoId: string;
    title: string;
    url: string;
    thumbnail: string | null;
    publishedAt: string | null;
    viewCount: number | null;
    duration: string | null;
  }>;
}

export interface ContactSectionContent {
  type: 'contact';
  email: string | null;
  phone: string | null;
  website: string | null;
  ctaText: string;
  location: string | null;
}

export interface LinksSectionContent {
  type: 'links';
  links: Array<{
    type: string;
    url: string;
    label: string;
  }>;
}

export interface PullQuoteContent {
  type: 'pull-quote';
  quote: string;
  attribution: string | null;
}

// ─── Navigation & Footer ───

export interface NavigationConfig {
  variant: 'minimal-top' | 'full-top' | 'sidebar' | 'none';
  items: Array<{ label: string; slug: string }>;
  showLogo: boolean;
  userName: string;
}

export interface FooterConfig {
  variant: 'simple' | 'detailed' | 'minimal';
  showBranding: boolean;
  showLinks: boolean;
}

// ─── SEO ───

export interface SEOConfig {
  title: string;
  description: string;
  ogImage: string | null;
  keywords: string[];
  structuredData: Record<string, unknown>;
}

// ─── Debug / Observability ───

export interface PipelineDebugInfo {
  profileUnderstanding: ProfileUnderstanding;
  evidenceExtraction: EvidenceExtraction;
  portfolioStrategy: PortfolioStrategy;
  narrativeContent: NarrativeContent;
  designBrief: DesignBrief;
  validationReport: ValidationReport;
}

export interface GenerationMeta {
  generatedAt: string;
  totalDurationMs: number;
  totalTokensUsed: { input: number; output: number };
  pipelineVersion: string;
  /** Per-stage timings for debugging */
  stageDurations: Record<string, number>;
  /** Model used for each stage */
  stageModels: Record<string, string>;
}

// ============================================================================
// PORTFOLIO GENERATION STATUS
// ============================================================================

export type PortfolioGenerationStatus =
  | 'idle'
  | 'collecting-data'
  | 'understanding-profile'
  | 'extracting-evidence'
  | 'planning-strategy'
  | 'generating-narrative'
  | 'creating-design'
  | 'validating'
  | 'composing'
  | 'complete'
  | 'failed';

export interface PortfolioGenerationProgress {
  status: PortfolioGenerationStatus;
  currentStage: string;
  stagesCompleted: number;
  totalStages: number;
  message: string;
  error: string | null;
}

// ============================================================================
// PORTFOLIO PERSISTENCE (what gets stored in DB)
// ============================================================================

export interface StoredPortfolio {
  id: string;
  profileId: string;
  version: number;
  plan: PortfolioPlan;
  status: 'draft' | 'published';
  /** User overrides on top of AI generation */
  userOverrides: PortfolioUserOverrides | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface PortfolioUserOverrides {
  /** Per-section visibility toggles */
  sectionVisibility: Record<string, boolean>;
  /** Per-section heading overrides */
  sectionHeadings: Record<string, string>;
  /** Narrative text overrides */
  textOverrides: Record<string, string>;
  /** Style overrides */
  styleOverrides: Partial<PortfolioStyle>;
  /** Section order override (array of section IDs) */
  sectionOrder: string[] | null;
  /** Page order override */
  pageOrder: string[] | null;
}
