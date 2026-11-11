/**
 * Synthetic portfolio fixtures.
 *
 * Every name, employer, school, URL and address below is invented. Nothing
 * here comes from a Follio user, a database, or any production system, and
 * this module performs no I/O — it is a frozen in-memory constant.
 *
 * Kept deliberately separate from the MCP handlers: when real portfolios
 * arrive, `repository.ts` changes and this file is deleted, while the tool
 * code and its response shape stay as they are.
 */

import type { Portfolio } from './types.js';

/**
 * Freeze a value and everything under it.
 *
 * The `Portfolio` type is `readonly` throughout, which stops accidental writes
 * at compile time. This stops them at runtime too, so a tool handler cannot
 * mutate the shared fixture between calls — in an ES module (always strict
 * mode) such a write throws rather than failing silently.
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

const rileyChen: Portfolio = {
  profile: {
    handle: 'riley-chen',
    fullName: 'Riley Chen',
    headline: 'Senior Backend Engineer — distributed systems and developer platforms',
    summary:
      'Backend engineer with eight years building payment and identity infrastructure. ' +
      'Works mostly in Go and TypeScript, with a bias toward boring, observable systems ' +
      'and small interfaces. Has led two platform migrations end to end and mentors ' +
      'engineers moving from product teams into infrastructure work.',
    totalExperience: '8 years',
    contact: {
      email: 'riley.chen@example.com',
      website: 'https://example.com/riley-chen',
      location: 'Portland, OR, USA',
    },
  },
  experience: [
    {
      id: 'exp-riley-1',
      company: 'Meridian Payments',
      role: 'Senior Backend Engineer',
      employmentType: 'FULL_TIME',
      location: 'Remote (US)',
      startDate: '2023-02-01',
      endDate: null,
      isCurrent: true,
      bullets: [
        'Led the migration of the settlement pipeline from a nightly batch job to an event-driven service, cutting end-to-end settlement time from 9 hours to 12 minutes.',
        'Designed the idempotency layer behind the public payments API, which removed a recurring class of duplicate-charge incidents.',
        'Introduced structured tracing across six services; median incident diagnosis dropped from roughly 40 minutes to under 10.',
        'Mentors three engineers and runs the backend guild’s design review rotation.',
      ],
    },
    {
      id: 'exp-riley-2',
      company: 'Northwind Logistics',
      role: 'Backend Engineer',
      employmentType: 'FULL_TIME',
      location: 'Portland, OR',
      startDate: '2020-06-15',
      endDate: '2023-01-20',
      isCurrent: false,
      bullets: [
        'Built the carrier-rating service that priced 40,000 shipments a day against eleven carrier APIs.',
        'Replaced a hand-rolled retry mechanism with a queue-backed worker pool, reducing failed shipment bookings by 60%.',
        'Owned the on-call rotation for the fulfilment domain and wrote the runbooks still in use.',
      ],
    },
    {
      id: 'exp-riley-3',
      company: 'Camellia Labs',
      role: 'Software Engineer',
      employmentType: 'FULL_TIME',
      location: 'Seattle, WA',
      startDate: '2018-08-06',
      endDate: '2020-06-05',
      isCurrent: false,
      bullets: [
        'Shipped the first version of an internal feature-flag service adopted by every product team.',
        'Wrote the data access layer for a multi-tenant analytics product serving 300 business customers.',
      ],
    },
  ],
  education: [
    {
      id: 'edu-riley-1',
      institution: 'Cascade State University',
      degree: 'B.S.',
      fieldOfStudy: 'Computer Science',
      location: 'Eugene, OR',
      startDate: '2014-09-01',
      endDate: '2018-06-15',
      gpa: '3.7',
      honors: ['Dean’s List (6 terms)', 'Undergraduate teaching assistant, Algorithms'],
    },
  ],
  projects: [
    {
      id: 'proj-riley-1',
      title: 'ledgerfmt',
      description:
        'A command-line formatter and linter for double-entry ledger files, with a plugin API for custom account rules.',
      url: 'https://example.com/ledgerfmt',
      repoUrl: 'https://example.com/riley-chen/ledgerfmt',
      techStack: ['Go', 'Cobra', 'GoReleaser'],
      highlights: [
        'Formats a 500,000-line ledger in under two seconds.',
        'Used as a pre-commit hook by several small accounting practices.',
      ],
    },
    {
      id: 'proj-riley-2',
      title: 'Tracebin',
      description:
        'A self-hosted collector that accepts OpenTelemetry spans and renders a shareable flamegraph from a single URL.',
      url: null,
      repoUrl: 'https://example.com/riley-chen/tracebin',
      techStack: ['TypeScript', 'Fastify', 'SQLite', 'D3'],
      highlights: [
        'Runs on a single container with no external dependencies.',
        'Written as a teaching aid for the backend guild’s tracing workshop.',
      ],
    },
  ],
  skills: [
    {
      name: 'Languages',
      skills: [
        { name: 'Go', level: 'EXPERT', yearsOfExp: 6 },
        { name: 'TypeScript', level: 'ADVANCED', yearsOfExp: 7 },
        { name: 'Python', level: 'INTERMEDIATE', yearsOfExp: 4 },
        { name: 'SQL', level: 'ADVANCED', yearsOfExp: 8 },
      ],
    },
    {
      name: 'Infrastructure',
      skills: [
        { name: 'PostgreSQL', level: 'ADVANCED', yearsOfExp: 7 },
        { name: 'Kafka', level: 'ADVANCED', yearsOfExp: 4 },
        { name: 'Kubernetes', level: 'INTERMEDIATE', yearsOfExp: 5 },
        { name: 'Terraform', level: 'INTERMEDIATE', yearsOfExp: 3 },
      ],
    },
    {
      name: 'Practices',
      skills: [
        { name: 'Distributed tracing', level: 'ADVANCED', yearsOfExp: 4 },
        { name: 'Incident response', level: 'ADVANCED', yearsOfExp: 5 },
        { name: 'Technical mentoring', level: 'INTERMEDIATE', yearsOfExp: 3 },
      ],
    },
  ],
  meta: {
    dataSource: 'synthetic-fixture',
    lastUpdated: '2026-11-01',
  },
};

const morganPatel: Portfolio = {
  profile: {
    handle: 'morgan-patel',
    fullName: 'Morgan Patel',
    headline: 'Product Designer turned Frontend Engineer',
    summary:
      'Designer-engineer who spent four years in product design before moving into ' +
      'frontend work. Most at home where design systems meet accessibility: typed ' +
      'component APIs, keyboard behaviour, and the unglamorous parts of a UI that ' +
      'decide whether it is actually usable.',
    totalExperience: '6 years',
    contact: {
      email: 'morgan.patel@example.com',
      website: null,
      location: 'Austin, TX, USA',
    },
  },
  experience: [
    {
      id: 'exp-morgan-1',
      company: 'Tessellate',
      role: 'Frontend Engineer',
      employmentType: 'FULL_TIME',
      location: 'Austin, TX',
      startDate: '2022-04-04',
      endDate: null,
      isCurrent: true,
      bullets: [
        'Rebuilt the component library on a typed design-token pipeline, removing 2,100 lines of ad-hoc CSS.',
        'Took the marketing site from a Lighthouse accessibility score of 71 to 100 and kept it there with a CI gate.',
        'Pairs weekly with the design team to keep Figma components and React props in sync.',
      ],
    },
    {
      id: 'exp-morgan-2',
      company: 'Harborlight Studio',
      role: 'Product Designer',
      employmentType: 'FULL_TIME',
      location: 'Austin, TX',
      startDate: '2019-09-02',
      endDate: '2022-03-25',
      isCurrent: false,
      bullets: [
        'Designed and shipped the onboarding flow for a scheduling product used by 12,000 small businesses.',
        'Ran the studio’s first accessibility audit and turned the findings into a standing checklist.',
      ],
    },
  ],
  education: [
    {
      id: 'edu-morgan-1',
      institution: 'Riverbend College of Art and Design',
      degree: 'B.F.A.',
      fieldOfStudy: 'Interaction Design',
      location: 'Providence, RI',
      startDate: '2015-09-01',
      endDate: '2019-05-20',
      gpa: null,
      honors: ['Senior thesis selected for the annual exhibition'],
    },
  ],
  projects: [
    {
      id: 'proj-morgan-1',
      title: 'Contrast Cue',
      description:
        'A browser extension that flags WCAG contrast failures in place and suggests the nearest passing colour from the page’s own palette.',
      url: 'https://example.com/contrast-cue',
      repoUrl: 'https://example.com/morgan-patel/contrast-cue',
      techStack: ['TypeScript', 'React', 'Vite', 'Chrome Extensions API'],
      highlights: [
        'Suggests replacements from the palette already in use rather than arbitrary colours.',
        'Around 4,000 weekly active users.',
      ],
    },
  ],
  skills: [
    {
      name: 'Frontend',
      skills: [
        { name: 'TypeScript', level: 'ADVANCED', yearsOfExp: 4 },
        { name: 'React', level: 'ADVANCED', yearsOfExp: 4 },
        { name: 'CSS architecture', level: 'EXPERT', yearsOfExp: 6 },
        { name: 'Testing Library', level: 'INTERMEDIATE', yearsOfExp: 3 },
      ],
    },
    {
      name: 'Design',
      skills: [
        { name: 'Design systems', level: 'EXPERT', yearsOfExp: 6 },
        { name: 'Figma', level: 'EXPERT', yearsOfExp: 6 },
        { name: 'Accessibility (WCAG 2.2)', level: 'ADVANCED', yearsOfExp: 5 },
        { name: 'User research', level: 'INTERMEDIATE', yearsOfExp: 4 },
      ],
    },
  ],
  meta: {
    dataSource: 'synthetic-fixture',
    lastUpdated: '2026-10-18',
  },
};

/** The handle returned when a caller does not name one. */
export const DEFAULT_PORTFOLIO_HANDLE = 'riley-chen';

/**
 * Frozen fixture set, keyed by handle.
 *
 * A plain frozen record rather than a `Map`: `Object.freeze` does not stop
 * `Map.prototype.set`, so a Map would only be read-only to the type checker.
 */
export const SYNTHETIC_PORTFOLIOS: Readonly<Record<string, Portfolio>> = deepFreeze({
  [rileyChen.profile.handle]: rileyChen,
  [morganPatel.profile.handle]: morganPatel,
});
