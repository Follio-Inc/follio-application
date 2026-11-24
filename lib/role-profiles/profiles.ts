/**
 * Application-defined target-role profiles.
 *
 * PROVENANCE, stated once here and carried on every profile so it reaches the
 * user: these are written by the Follio team from language that recurs across
 * public job postings for each family. They are NOT sourced from a specific
 * employer, a specific posting, a competency framework, or any standards body.
 * They are a reading aid, not an authority on what a role requires.
 *
 * Keep this module free of database and server-only imports: the dashboard
 * dialog imports the role list to populate its picker.
 */

import type { RoleProfile, RoleProfileId } from './types';

const PROVENANCE =
  'Follio application-defined role profile. Written by the Follio team from language that ' +
  'commonly recurs in public job postings for this role family. Not taken from any specific ' +
  'employer, posting, or competency standard, and not a statement of what any given team requires.';

export const ROLE_PROFILES: Record<RoleProfileId, RoleProfile> = {
  'technical-program-manager': {
    id: 'technical-program-manager',
    label: 'Technical Program Manager',
    aliases: ['tpm', 'technical program manager', 'program manager', 'technical programme manager'],
    summary:
      'Drives cross-functional technical programs: scope, dependencies, risk and delivery across ' +
      'several engineering teams.',
    signalTitles: [
      'technical program manager',
      'program manager',
      'tpm',
      'project manager',
      'delivery manager',
      'engineering program manager',
    ],
    provenance: PROVENANCE,
    competencies: [
      {
        id: 'program-delivery',
        label: 'Cross-functional program delivery',
        description:
          'Running multi-team programs end to end: scope, milestones, launch and post-launch review.',
        signals: [
          'program',
          'cross functional',
          'cross-functional',
          'roadmap',
          'milestone',
          'launch',
          'delivery',
          'initiative',
        ],
      },
      {
        id: 'risk-dependency',
        label: 'Risk and dependency management',
        description:
          'Identifying blockers and inter-team dependencies early and driving them to resolution.',
        signals: [
          'risk',
          'dependency',
          'dependencies',
          'blocker',
          'mitigation',
          'critical path',
          'unblock',
          'escalation',
        ],
      },
      {
        id: 'technical-depth',
        label: 'Technical depth',
        description:
          'Enough engineering fluency to reason about architecture, trade-offs and technical review.',
        signals: [
          'architecture',
          'api',
          'infrastructure',
          'platform',
          'migration',
          'technical design',
          'system',
          'engineering',
        ],
      },
      {
        id: 'stakeholder-communication',
        label: 'Stakeholder communication',
        description:
          'Status reporting, executive updates and alignment across engineering, product and leadership.',
        signals: [
          'stakeholder',
          'executive',
          'alignment',
          'communication',
          'reporting',
          'status',
          'leadership',
          'presented',
        ],
      },
      {
        id: 'process-rigor',
        label: 'Process and operational rigor',
        description:
          'Improving how teams work: planning cadence, agile ceremonies, operational reviews.',
        signals: [
          'agile',
          'scrum',
          'kanban',
          'sprint',
          'planning',
          'process',
          'cadence',
          'operational',
          'jira',
        ],
      },
      {
        id: 'data-driven',
        label: 'Data-driven decision making',
        description: 'Using metrics and measured outcomes to steer a program rather than opinion.',
        signals: [
          'metric',
          'metrics',
          'kpi',
          'okr',
          'dashboard',
          'measured',
          'reduced',
          'improved',
          'increased',
        ],
      },
    ],
  },

  'software-engineer': {
    id: 'software-engineer',
    label: 'Software Engineer',
    aliases: [
      'swe',
      'software engineer',
      'software developer',
      'developer',
      'backend engineer',
      'frontend engineer',
      'full stack engineer',
    ],
    summary:
      'Designs, builds, tests and operates software systems, usually within a product engineering team.',
    signalTitles: [
      'software engineer',
      'software developer',
      'engineer',
      'developer',
      'backend engineer',
      'frontend engineer',
      'full stack engineer',
    ],
    provenance: PROVENANCE,
    competencies: [
      {
        id: 'implementation',
        label: 'Software design and implementation',
        description: 'Building and shipping features in a general-purpose programming language.',
        signals: [
          'built',
          'developed',
          'implemented',
          'designed',
          'shipped',
          'feature',
          'service',
          'application',
          'refactor',
        ],
      },
      {
        id: 'languages-tooling',
        label: 'Languages and tooling',
        description: 'Working knowledge of at least one mainstream language and its ecosystem.',
        signals: [
          'typescript',
          'javascript',
          'python',
          'java',
          'golang',
          'rust',
          'ruby',
          'kotlin',
          'swift',
          'react',
          'node',
        ],
      },
      {
        id: 'testing-quality',
        label: 'Testing and code quality',
        description: 'Automated tests, code review and practices that keep a codebase healthy.',
        signals: [
          'test',
          'testing',
          'unit test',
          'integration test',
          'code review',
          'coverage',
          'continuous integration',
          'quality',
        ],
      },
      {
        id: 'systems-scale',
        label: 'Systems and scalability',
        description: 'Designing for load, latency and reliability beyond a single machine.',
        signals: [
          'scale',
          'scalability',
          'performance',
          'latency',
          'distributed',
          'database',
          'cache',
          'queue',
          'throughput',
          'reliability',
        ],
      },
      {
        id: 'operations',
        label: 'Deployment and operations',
        description:
          'Getting code to production and keeping it running: CI/CD, monitoring, on-call.',
        signals: [
          'deploy',
          'deployment',
          'docker',
          'kubernetes',
          'aws',
          'gcp',
          'azure',
          'monitoring',
          'observability',
          'incident',
          'terraform',
        ],
      },
      {
        id: 'collaboration',
        label: 'Collaboration',
        description: 'Working inside a team: code review, mentoring, cross-functional partnership.',
        signals: [
          'collaborated',
          'partnered',
          'mentored',
          'cross functional',
          'cross-functional',
          'reviewed',
        ],
      },
    ],
  },

  'data-scientist': {
    id: 'data-scientist',
    label: 'Data Scientist',
    aliases: [
      'data scientist',
      'machine learning engineer',
      'ml engineer',
      'applied scientist',
      'data analyst',
    ],
    summary:
      'Turns data into decisions and models: analysis, experimentation, statistical and ML methods.',
    signalTitles: [
      'data scientist',
      'machine learning engineer',
      'ml engineer',
      'applied scientist',
      'data analyst',
      'research scientist',
    ],
    provenance: PROVENANCE,
    competencies: [
      {
        id: 'statistics-experimentation',
        label: 'Statistics and experimentation',
        description: 'Hypothesis testing, A/B tests and reasoning about significance and bias.',
        signals: [
          'statistic',
          'statistical',
          'ab test',
          'experiment',
          'hypothesis',
          'significance',
          'regression',
          'causal',
          'inference',
        ],
      },
      {
        id: 'modeling',
        label: 'Machine learning and modeling',
        description: 'Building, evaluating and tuning predictive or generative models.',
        signals: [
          'machine learning',
          'model',
          'classification',
          'clustering',
          'neural',
          'deep learning',
          'nlp',
          'forecasting',
          'scikit',
          'pytorch',
          'tensorflow',
        ],
      },
      {
        id: 'data-engineering',
        label: 'Data engineering and SQL',
        description: 'Getting to trustworthy data: querying, pipelines, warehouses and cleaning.',
        signals: [
          'sql',
          'pipeline',
          'etl',
          'warehouse',
          'spark',
          'airflow',
          'bigquery',
          'snowflake',
          'data cleaning',
        ],
      },
      {
        id: 'programming',
        label: 'Programming and tooling',
        description: 'Analysis code in a scripting language plus the standard numeric stack.',
        signals: ['python', 'pandas', 'numpy', 'jupyter', 'notebook', 'scipy', 'matplotlib'],
      },
      {
        id: 'communication',
        label: 'Communication and visualization',
        description:
          'Explaining findings to non-technical partners; dashboards and written analysis.',
        signals: [
          'dashboard',
          'visualization',
          'tableau',
          'looker',
          'presented',
          'communicated',
          'stakeholder',
          'insight',
        ],
      },
      {
        id: 'business-impact',
        label: 'Business impact',
        description: 'Connecting analysis to a measurable outcome the business cared about.',
        signals: [
          'revenue',
          'retention',
          'conversion',
          'churn',
          'growth',
          'roi',
          'impact',
          'kpi',
          'metric',
        ],
      },
    ],
  },

  'product-manager': {
    id: 'product-manager',
    label: 'Product Manager',
    aliases: ['pm', 'product manager', 'product owner', 'associate product manager', 'apm'],
    summary:
      'Owns what gets built and why: discovery, prioritization, launch and the metrics that follow.',
    signalTitles: [
      'product manager',
      'product owner',
      'associate product manager',
      'group product manager',
      'product lead',
    ],
    provenance: PROVENANCE,
    competencies: [
      {
        id: 'discovery',
        label: 'Product discovery and user research',
        description: 'Learning what users need through interviews, research and problem framing.',
        signals: [
          'user research',
          'customer interview',
          'discovery',
          'user need',
          'persona',
          'usability',
          'feedback',
          'survey',
        ],
      },
      {
        id: 'prioritization',
        label: 'Roadmap and prioritization',
        description: 'Deciding what to build next and defending the trade-off.',
        signals: [
          'roadmap',
          'prioriti',
          'backlog',
          'scope',
          'trade off',
          'trade-off',
          'requirement',
          'spec',
        ],
      },
      {
        id: 'cross-functional-leadership',
        label: 'Cross-functional leadership',
        description: 'Leading engineering, design and go-to-market partners without authority.',
        signals: [
          'cross functional',
          'cross-functional',
          'engineering',
          'design',
          'partnered',
          'aligned',
          'stakeholder',
        ],
      },
      {
        id: 'metrics',
        label: 'Metrics and analytics',
        description: 'Defining success measures and reading the result honestly.',
        signals: [
          'metric',
          'kpi',
          'okr',
          'experiment',
          'analytics',
          'funnel',
          'conversion',
          'retention',
          'dashboard',
        ],
      },
      {
        id: 'launch',
        label: 'Launch and go-to-market',
        description: 'Taking a product from ready to launched, with the partners that requires.',
        signals: [
          'launch',
          'go to market',
          'go-to-market',
          'release',
          'rollout',
          'beta',
          'adoption',
        ],
      },
      {
        id: 'communication',
        label: 'Written and executive communication',
        description: 'Documents and updates that let other people make decisions.',
        signals: [
          'wrote',
          'authored',
          'presented',
          'communicated',
          'executive',
          'documentation',
          'proposal',
        ],
      },
    ],
  },
};

/** Every profile, in display order. */
export const ROLE_PROFILE_LIST: RoleProfile[] = Object.values(ROLE_PROFILES);

/** Lightweight options for a picker. Safe to import into a client component. */
export const ROLE_PROFILE_OPTIONS: Array<{ id: RoleProfileId; label: string; summary: string }> =
  ROLE_PROFILE_LIST.map((role) => ({ id: role.id, label: role.label, summary: role.summary }));

export const SUPPORTED_ROLE_IDS: RoleProfileId[] = ROLE_PROFILE_LIST.map((role) => role.id);

function normalizeRoleKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Resolve free text or an id to a supported role profile.
 *
 * Returns null rather than guessing: an unrecognized role must surface to the
 * user as "not supported", never as a silently substituted different role.
 */
export function resolveRoleProfile(raw: string | null | undefined): RoleProfile | null {
  if (!raw) return null;
  const key = normalizeRoleKey(raw);
  if (!key) return null;

  for (const role of ROLE_PROFILE_LIST) {
    if (normalizeRoleKey(role.id) === key) return role;
    if (normalizeRoleKey(role.label) === key) return role;
    if (role.aliases.some((alias) => normalizeRoleKey(alias) === key)) return role;
  }

  return null;
}

export function isSupportedRole(raw: string | null | undefined): boolean {
  return resolveRoleProfile(raw) !== null;
}
