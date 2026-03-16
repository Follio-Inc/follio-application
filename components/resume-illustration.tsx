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

export function ResumeIllustration() {
  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-950" style={sansFont}>
      {/* ── Accent bar ── */}
      <div className="h-[3px] bg-primary" />

      {/* ── Header ── */}
      <div className="px-6 pb-2 pt-5 text-center">
        <h3 className="text-[17px] font-bold tracking-[-0.02em] text-gray-900 dark:text-gray-50">
          Sarah Chen
        </h3>
        <p className="mt-0.5 text-[8px] font-medium tracking-[0.08em] text-primary">
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
      <div className="px-6 pb-2">
        <p className="text-[7.5px] font-light leading-[1.8] text-gray-700 dark:text-gray-300">
          Full-stack engineer with 8+ years shipping high-throughput distributed systems at scale.
          Led platform teams at two YC-backed startups and a Fortune 500 fintech. Specialized in
          event-driven architectures, developer tooling, and infrastructure automation. Passionate
          about building reliable systems that empower engineering teams to move faster.
        </p>
      </div>

      <div className="bg-gray-150 mx-6 h-px dark:bg-gray-800/60" />

      {/* ── Experience ── */}
      <div className="px-6 pt-2.5">
        <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-primary dark:text-primary">
          Experience
        </p>

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

      <div className="bg-gray-150 mx-6 mt-2.5 h-px dark:bg-gray-800/60" />

      {/* ── Education ── */}
      <div className="px-6 pt-2.5">
        <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-primary dark:text-primary">
          Education
        </p>
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

      <div className="bg-gray-150 mx-6 mt-2.5 h-px dark:bg-gray-800/60" />

      {/* ── Technical Skills — inline paragraph ── */}
      <div className="px-6 pb-7 pt-2.5">
        <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-primary dark:text-primary">
          Skills
        </p>
        <p className="text-[7px] font-light leading-[1.8] text-gray-700 dark:text-gray-300">
          {RESUME_SKILLS.join('  ·  ')}
        </p>
      </div>
    </div>
  );
}
