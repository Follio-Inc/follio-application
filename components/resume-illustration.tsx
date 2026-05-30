const sansFont = {
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"',
  WebkitFontSmoothing: 'antialiased' as const,
} as const;

const RESUME_SKILLS = [
  'TypeScript',
  'React / Next.js',
  'Node.js',
  'Go',
  'Python',
  'GraphQL',
  'AWS / GCP',
  'Kubernetes',
  'PostgreSQL',
  'Redis',
  'Kafka',
  'Docker',
  'Terraform',
  'CI/CD',
] as const;

const RESUME_PROJECTS = [
  {
    name: 'Helios — Distributed Job Scheduler',
    tag: 'Open Source',
    blurb:
      'Fault-tolerant scheduler in Go with exactly-once delivery semantics, handling 5M+ daily jobs across multi-region clusters. 4.2K★ on GitHub and running in production at 30+ companies.',
  },
  {
    name: 'Cascade — Streaming ETL Framework',
    tag: 'Open Source',
    blurb:
      'Declarative pipeline framework on Kafka + Flink that cut end-to-end data latency from hours to seconds. Now powers real-time analytics for 12 internal product teams.',
  },
  {
    name: 'Vellum — Type-Safe API Toolkit',
    tag: 'Side project',
    blurb:
      'End-to-end typed RPC layer for TypeScript monorepos with zero codegen. 1.1K★ and featured in the React Status and Node Weekly newsletters.',
  },
] as const;

const RESUME_AWARDS = [
  'AWS Certified Solutions Architect — Professional · 2023',
  'CNCF Certified Kubernetes Administrator (CKA) · 2022',
  'Speaker, KubeCon NA 2023 — “Scaling Event-Driven Systems to Millions of Requests”',
  'Patent pending — Adaptive canary deployment via real-time telemetry signals',
] as const;

/**
 * Section heading — an uppercase label trailed by a hairline that fades into
 * the page. Reads as a clean, modern divider without the heaviness of a full
 * rule, while keeping the Follio standard's restrained, single-accent feel.
 */
function SectionHeading({ children }: { children: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-primary">
        {children}
      </p>
      <span className="h-px flex-1 bg-gradient-to-r from-primary/30 via-gray-200 to-transparent dark:via-gray-700/70" />
    </div>
  );
}

export function ResumeIllustration() {
  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-950" style={sansFont}>
      {/* ── Accent bar ── */}
      <div className="h-[3px] bg-gradient-to-r from-primary via-primary to-primary/60" />

      {/* ── Header ── */}
      <div className="px-6 pb-2 pt-5 text-center">
        <h3 className="text-[17px] font-bold tracking-[-0.025em] text-gray-900 dark:text-gray-50">
          Sarah Chen
        </h3>
        <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-primary">
          Senior Software Engineer
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[7px] font-light text-gray-500 dark:text-gray-400">
          <span>San Francisco, CA</span>
          <span className="text-gray-300 dark:text-gray-700">&bull;</span>
          <span>sarah.chen@email.com</span>
          <span className="text-gray-300 dark:text-gray-700">&bull;</span>
          <span>linkedin.com/in/sarachen</span>
          <span className="text-gray-300 dark:text-gray-700">&bull;</span>
          <span>github.com/sarachen</span>
        </div>
      </div>

      {/* ── Summary ── */}
      <div className="px-6 pb-2 pt-3">
        <p className="text-[7.5px] font-light leading-[1.8] text-gray-700 dark:text-gray-300">
          Full-stack engineer with 8+ years shipping high-throughput distributed systems at scale.
          Led platform teams at two YC-backed startups and a Fortune 500 fintech. Specialized in
          event-driven architectures, developer tooling, and infrastructure automation. Passionate
          about building reliable systems that empower engineering teams to move faster.
        </p>
      </div>

      {/* ── Experience ── */}
      <div className="px-6 pt-1.5">
        <SectionHeading>Experience</SectionHeading>

        <div className="space-y-2">
          {/* Role 1 */}
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-gray-100">
                  Lead Platform Engineer
                </p>
                <p className="mt-[1px] text-[7px] font-light text-gray-600 dark:text-gray-400">
                  Meridian Technologies &middot; San Francisco, CA
                </p>
              </div>
              <p className="shrink-0 text-[6.5px] font-light tabular-nums text-gray-600 dark:text-gray-400">
                Jan 2022 – Present
              </p>
            </div>
            <ul className="mt-1.5 space-y-[3px] text-[7px] font-light leading-[1.7] text-gray-800 dark:text-gray-200">
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/50" />
                <span>
                  Architected event-driven microservices platform processing{' '}
                  <strong className="font-medium text-gray-900 dark:text-gray-100">
                    2.4M requests/day
                  </strong>{' '}
                  with 99.97% uptime SLA across 12 services
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/50" />
                <span>
                  Spearheaded migration from monolith to microservices, reducing mean deploy time
                  from 2 weeks to{' '}
                  <strong className="font-medium text-gray-900 dark:text-gray-100">
                    45 minutes
                  </strong>{' '}
                  via custom CI/CD pipelines with automated canary deployments
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/50" />
                <span>
                  Replaced legacy batch ETL with real-time streaming sync (Kafka + Flink), cutting
                  data latency from 6 hrs to under 30s and saving{' '}
                  <strong className="font-medium text-gray-900 dark:text-gray-100">$340K/yr</strong>{' '}
                  in compute
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/50" />
                <span>
                  Mentored team of 8 engineers; introduced architecture decision records and RFC
                  process adopted company-wide
                </span>
              </li>
            </ul>
          </div>

          {/* Role 2 */}
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-gray-100">
                  Software Engineer II
                </p>
                <p className="mt-[1px] text-[7px] font-light text-gray-600 dark:text-gray-400">
                  Nexus Labs <span className="text-gray-400 dark:text-gray-500">(YC S18)</span>{' '}
                  &middot; Remote
                </p>
              </div>
              <p className="shrink-0 text-[6.5px] font-light tabular-nums text-gray-600 dark:text-gray-400">
                Mar 2019 – Dec 2021
              </p>
            </div>
            <ul className="mt-1.5 space-y-[3px] text-[7px] font-light leading-[1.7] text-gray-800 dark:text-gray-200">
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/40" />
                <span>
                  Engineered real-time collaboration engine using CRDTs, shipped to{' '}
                  <strong className="font-medium text-gray-900 dark:text-gray-100">
                    180K+ monthly active users
                  </strong>{' '}
                  with sub-50ms sync latency
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/40" />
                <span>
                  Designed and built internal GraphQL gateway consolidating 4 REST APIs; adopted by
                  all 6 product teams, reducing frontend data-fetching code by 40%
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/40" />
                <span>
                  Optimized PostgreSQL query layer with materialized views and connection pooling,
                  improving p95 response times by{' '}
                  <strong className="font-medium text-gray-900 dark:text-gray-100">62%</strong>
                </span>
              </li>
            </ul>
          </div>

          {/* Role 3 */}
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-gray-100">
                  Software Engineer
                </p>
                <p className="mt-[1px] text-[7px] font-light text-gray-600 dark:text-gray-400">
                  Stripe &middot; San Francisco, CA
                </p>
              </div>
              <p className="shrink-0 text-[6.5px] font-light tabular-nums text-gray-600 dark:text-gray-400">
                Jun 2017 – Feb 2019
              </p>
            </div>
            <ul className="mt-1.5 space-y-[3px] text-[7px] font-light leading-[1.7] text-gray-800 dark:text-gray-200">
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/30" />
                <span>
                  Core contributor to Payments API processing $B+ annually; designed ML-powered
                  fraud detection feature preventing{' '}
                  <strong className="font-medium text-gray-900 dark:text-gray-100">$2.1M</strong> in
                  chargebacks quarterly
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/30" />
                <span>
                  Built webhook delivery system with at-least-once guarantees serving 50K+ merchants
                  with 99.99% delivery rate
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Selected Projects ── */}
      <div className="px-6 pt-3">
        <SectionHeading>Selected Projects</SectionHeading>
        <div className="space-y-2">
          {RESUME_PROJECTS.map((project) => (
            <div key={project.name}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[8px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-gray-100">
                  {project.name}
                </p>
                <p className="shrink-0 text-[6.5px] font-light tabular-nums text-gray-600 dark:text-gray-400">
                  {project.tag}
                </p>
              </div>
              <p className="mt-0.5 text-[7px] font-light leading-[1.7] text-gray-700 dark:text-gray-300">
                {project.blurb}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 pt-3">
        <SectionHeading>Education</SectionHeading>
        <div className="space-y-2">
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[8px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-gray-100">
                  M.S. Computer Science
                </p>
                <p className="mt-[1px] text-[7px] font-light text-gray-600 dark:text-gray-400">
                  Stanford University
                </p>
              </div>
              <p className="shrink-0 text-[6.5px] font-light tabular-nums text-gray-600 dark:text-gray-400">
                Jun 2019
              </p>
            </div>
            <p className="mt-0.5 text-[6.5px] font-light text-gray-600 dark:text-gray-400">
              Focus: Distributed Systems &middot; Research: Fault-tolerant consensus protocols
            </p>
          </div>
          <div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[8px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-gray-100">
                  B.S. Computer Science
                </p>
                <p className="mt-[1px] text-[7px] font-light text-gray-600 dark:text-gray-400">
                  Carnegie Mellon University
                </p>
              </div>
              <p className="shrink-0 text-[6.5px] font-light tabular-nums text-gray-600 dark:text-gray-400">
                May 2017
              </p>
            </div>
            <p className="mt-0.5 text-[6.5px] font-light text-gray-600 dark:text-gray-400">
              Dean&apos;s List &middot; GPA 3.87/4.0 &middot; TA, Distributed Systems &middot;
              HackCMU Organizer
            </p>
          </div>
        </div>
      </div>

      {/* ── Technical Skills — chips ── */}
      <div className="px-6 pt-3">
        <SectionHeading>Skills</SectionHeading>
        <div className="flex flex-wrap gap-1">
          {RESUME_SKILLS.map((skill) => (
            <span
              key={skill}
              className="rounded-[3px] border border-gray-200 bg-gray-50 px-1.5 py-[2px] text-[6.5px] font-medium leading-none text-gray-700 dark:border-gray-800/70 dark:bg-gray-900/50 dark:text-gray-300"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      {/* ── Awards & Certifications ── */}
      <div className="px-6 pb-7 pt-3">
        <SectionHeading>Awards &amp; Certifications</SectionHeading>
        <ul className="space-y-[3px] text-[7px] font-light leading-[1.7] text-gray-700 dark:text-gray-300">
          {RESUME_AWARDS.map((award) => (
            <li key={award} className="flex gap-1.5">
              <span className="mt-[5px] h-[3px] w-[3px] shrink-0 rounded-full bg-primary/50" />
              <span>{award}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
