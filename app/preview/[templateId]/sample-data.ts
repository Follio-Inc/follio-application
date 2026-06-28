/**
 * Sample data for the template preview route.
 *
 * A realistic "visual / product designer" profile used to review templates
 * in isolation, without touching real user data. This is preview-only and
 * never shipped to end users.
 */

import type {
  TemplateAIEnrichment,
  TemplateCopy,
  TemplateProfileData,
  TemplateSectionConfig,
} from '@/lib/portfolio/templates/types';

export const sampleProfile: TemplateProfileData = {
  id: 'preview',
  handle: 'maya',
  firstName: 'Maya',
  middleName: null,
  lastName: 'Okonkwo',
  headline: 'Product & Visual Designer',
  summary:
    'I design calm, considered products and the brands around them. Currently leading design at a small studio, previously shipping interfaces used by millions.',
  avatarUrl: 'https://picsum.photos/seed/maya-portrait/720/900',
  location: 'Lisbon, Portugal',

  contactInfo: {
    email: 'hello@mayaokonkwo.com',
    phone: null,
    website: 'https://mayaokonkwo.com',
  },

  links: [
    { id: 'l1', type: 'INSTAGRAM', url: 'https://instagram.com', label: 'Instagram' },
    { id: 'l2', type: 'DRIBBBLE', url: 'https://dribbble.com', label: 'Dribbble' },
    { id: 'l3', type: 'LINKEDIN', url: 'https://linkedin.com', label: 'LinkedIn' },
    { id: 'l4', type: 'TWITTER', url: 'https://x.com', label: 'Twitter' },
  ],

  workExperiences: [
    {
      id: 'w1',
      company: 'Atelier Norð',
      companyLogoUrl: null,
      role: 'Design Lead',
      location: 'Lisbon',
      startDate: '2022-03',
      endDate: null,
      isCurrent: true,
      bullets: [
        'Lead a team of four across brand, product, and motion for early-stage clients in culture and climate.',
      ],
      isVisible: true,
    },
    {
      id: 'w2',
      company: 'Monzo',
      companyLogoUrl: null,
      role: 'Senior Product Designer',
      location: 'London',
      startDate: '2019-01',
      endDate: '2022-02',
      isCurrent: false,
      bullets: [
        'Owned the savings and goals experience used by 4M+ customers; shipped a redesign that lifted adoption 28%.',
      ],
      isVisible: true,
    },
    {
      id: 'w3',
      company: 'Freelance',
      companyLogoUrl: null,
      role: 'Designer',
      location: 'Remote',
      startDate: '2016-06',
      endDate: '2018-12',
      isCurrent: false,
      bullets: [
        'Partnered with founders to take ideas from first sketch to launched product and identity.',
      ],
      isVisible: true,
    },
  ],

  educations: [
    {
      id: 'e1',
      institution: 'Central Saint Martins',
      degree: 'BA',
      fieldOfStudy: 'Graphic Communication Design',
      startDate: '2012',
      endDate: '2015',
      isCurrent: false,
      gpa: null,
      isVisible: true,
    },
  ],

  skills: [],
  skillGroups: [
    {
      id: 'g1',
      name: 'Design',
      skills: [
        { id: 's1', name: 'Product Design', level: null },
        { id: 's2', name: 'Brand Identity', level: null },
        { id: 's3', name: 'Art Direction', level: null },
        { id: 's4', name: 'Typography', level: null },
        { id: 's5', name: 'Design Systems', level: null },
      ],
    },
    {
      id: 'g2',
      name: 'Tools',
      skills: [
        { id: 's6', name: 'Figma', level: null },
        { id: 's7', name: 'Spline', level: null },
        { id: 's8', name: 'After Effects', level: null },
        { id: 's9', name: 'Blender', level: null },
      ],
    },
  ],

  projects: [
    {
      id: 'p1',
      title: 'Tidal — Banking, reimagined',
      description:
        'A full product and brand system for a sustainable neobank, from first principles to a shipped iOS app.',
      url: 'https://example.com',
      repoUrl: null,
      imageUrl: 'https://picsum.photos/seed/folio-tidal/1600/1000',
      techStack: ['Product', 'Brand', 'iOS', 'Design System'],
      isVisible: true,
      showOnPortfolio: true,
      ghStars: null,
      ghForks: null,
      ghLanguage: null,
    },
    {
      id: 'p2',
      title: 'Field Notes',
      description: 'An editorial app for nature journaling, with a warm, tactile interface.',
      url: 'https://example.com',
      repoUrl: null,
      imageUrl: 'https://picsum.photos/seed/folio-field/1200/800',
      techStack: ['Product', 'Illustration'],
      isVisible: true,
      showOnPortfolio: true,
      ghStars: null,
      ghForks: null,
      ghLanguage: null,
    },
    {
      id: 'p3',
      title: 'Soma Studio Identity',
      description: 'Brand identity and motion language for a movement and wellness studio.',
      url: 'https://example.com',
      repoUrl: null,
      imageUrl: 'https://picsum.photos/seed/folio-soma/1200/800',
      techStack: ['Brand', 'Motion'],
      isVisible: true,
      showOnPortfolio: true,
      ghStars: null,
      ghForks: null,
      ghLanguage: null,
    },
    {
      id: 'p4',
      title: 'Halo Type Specimen',
      description: 'A specimen site and microsite for an independent type foundry release.',
      url: 'https://example.com',
      repoUrl: null,
      imageUrl: 'https://picsum.photos/seed/folio-halo/1200/800',
      techStack: ['Web', 'Typography'],
      isVisible: true,
      showOnPortfolio: true,
      ghStars: null,
      ghForks: null,
      ghLanguage: null,
    },
  ],

  certifications: [
    {
      id: 'c1',
      name: 'Interaction Design Foundation — UX Professional',
      issuer: 'IxDF',
      issueDate: '2020-05',
      credentialUrl: 'https://example.com',
      isVisible: true,
    },
  ],

  awards: [
    {
      id: 'a1',
      title: 'Awwwards — Site of the Day',
      issuer: 'Awwwards',
      date: '2023',
      description: 'Recognised for the Soma Studio launch microsite.',
      isVisible: true,
    },
    {
      id: 'a2',
      title: 'D&AD Wood Pencil',
      issuer: 'D&AD',
      date: '2021',
      description: 'Brand identity, Field Notes.',
      isVisible: true,
    },
  ],

  blogPosts: [],
  photos: [],
  github: null,
};

export const sampleCopy: TemplateCopy = {
  heroHeadline: 'I make calm, considered products people actually enjoy.',
  heroSubtext:
    'Designer working across product, brand, and motion — turning fuzzy ideas into things that feel inevitable.',
  aboutTitle: "I'm Maya — a designer who sweats the quiet details.",
  aboutText:
    'For the last decade I\u2019ve helped teams ship interfaces and brands that feel honest and unhurried. I care about typography, pacing, and the small moments that make a product feel considered. I work best with founders and teams who believe craft is a feature, not a finish.',
  contactTitle: "Let's make something good.",
  contactSubtext: 'Open to select projects',
  primaryCtaLabel: 'View my work \u2192',
  seoTitle: 'Maya Okonkwo — Product & Visual Designer',
  seoDescription:
    'Portfolio of Maya Okonkwo, a product and visual designer working across product, brand, and motion.',
  sectionIntros: {
    projects:
      'A few selected projects. Each one is a small obsession with getting the details right.',
    experience: 'Ten years across product teams, agencies, and my own studio.',
  },
  projectNarratives: {
    'Tidal — Banking, reimagined':
      'I led design end-to-end: the visual identity, the design system, and the core flows. The goal was a bank that felt calm instead of anxious — soft motion, generous space, and language that respects people.',
    'Field Notes':
      'A passion project that became a small business. I designed the interface, the illustration set, and the editorial voice that ties it all together.',
  },
  experienceNarrative:
    'I\u2019ve gone from freelance generalist to senior product designer at scale, and now lead a small multidisciplinary studio.',
  githubNarrative: null,
  writingNarrative: null,
  pullQuote: 'Good design gets out of the way. Great design makes you feel looked after.',
};

export const sampleEnrichment: TemplateAIEnrichment = {
  archetype: 'Multidisciplinary Designer',
  secondaryArchetypes: ['Brand Designer', 'Design Lead'],
  careerStage: 'senior',
  definingThemes: ['craft', 'calm interfaces', 'brand systems'],
  uniqueAngles: ['product + brand fluency', 'motion literacy'],
  domains: ['fintech', 'culture', 'wellness'],
  mustFeature: ['Tidal — Banking, reimagined'],
  weakItems: [],
  highlightFacts: ['10 years designing', '4M+ users reached', 'Awwwards SOTD', 'Led teams of 4+'],
  stats: [
    { label: 'Years designing', value: '10+' },
    { label: 'Users reached', value: '4M+' },
    { label: 'Selected projects', value: '40+' },
  ],
  dataRichness: 0.82,
  validationScore: 1,
  _meta: {
    pipelineVersion: 'preview',
    generatedAt: new Date().toISOString(),
    totalDurationMs: 0,
    totalTokensUsed: { input: 0, output: 0 },
    stagesRun: [],
  },
};

/**
 * Build a sections config from a template's defaults, enabling only those
 * that have sample data so the preview reflects a realistic page.
 */
export function buildPreviewSections(defaults: TemplateSectionConfig[]): TemplateSectionConfig[] {
  const hasData: Record<string, boolean> = {
    navigation: true,
    hero: true,
    about: true,
    contact: true,
    footer: true,
    projects: sampleProfile.projects.length > 0,
    experience: sampleProfile.workExperiences.length > 0,
    skills: sampleProfile.skillGroups.length > 0 || sampleProfile.skills.length > 0,
    education: sampleProfile.educations.length > 0,
    awards: sampleProfile.awards.length > 0,
    certifications: sampleProfile.certifications.length > 0,
    github: sampleProfile.github !== null,
    blog: sampleProfile.blogPosts.length > 0,
  };

  return defaults.map((section) => ({
    ...section,
    enabled: hasData[section.type] ?? section.enabled,
  }));
}
