import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { AppHeader } from '@/components/app-header';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';

const CONTACT_CHANNELS = [
  {
    label: 'General support',
    email: 'support@follio.dev',
    description: 'Product questions, account issues, and help with your resume or portfolio.',
  },
  {
    label: 'Legal & privacy',
    email: 'legal@follio.dev',
    description: 'Privacy requests, terms questions, takedowns, and legal notices.',
  },
  {
    label: 'Security',
    email: 'security@follio.dev',
    description: 'Report vulnerabilities or any security-related concern affecting Follio.',
  },
  {
    label: 'Press & partnerships',
    email: 'press@follio.dev',
    description: 'Media inquiries, partnerships, and collaboration requests.',
  },
] as const;

const RESPONSE_GUIDANCE = [
  'Include your Follio handle, the email tied to your account, and a short summary of the issue.',
  'For privacy or legal requests, describe the data or page involved and the action you want us to take.',
  'For security reports, share reproduction steps only if you can do so safely and without exposing user data.',
] as const;

const OFFICE_HOURS = [
  { label: 'Typical reply', value: '1–2 business days' },
  { label: 'Urgent security', value: 'security@follio.dev' },
] as const;

export const metadata = {
  title: 'Contact Us - Follio',
  description: 'Contact Follio for support, legal, privacy, security, and partnership requests.',
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-background">
      <AppHeader
        tone="marketing"
        left={<Logo href="/" size="md" />}
        right={
          <Link
            href="/privacy"
            className="inline-flex h-8 items-center rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Privacy
          </Link>
        }
      />

      {/* ─── Hero ──────────────────────────────────────────────────────────── */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
          <p className="text-eyebrow">Contact</p>
          <h1 className="text-display mx-auto mt-4 max-w-2xl text-balance text-4xl text-foreground sm:text-5xl">
            Reach the right team for support, legal, and partnership requests.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-[15px] leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            Use the addresses below to get your message routed quickly — for customer support,
            privacy matters, legal notices, security reports, and other business inquiries.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Button asChild size="lg" className="w-full gap-2 rounded-full px-6 sm:w-auto">
              <a href="mailto:support@follio.dev">
                Email support
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full rounded-full px-6 sm:w-auto"
            >
              <Link href="/terms">View terms</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── Contact routes ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-eyebrow">Where to write</p>
          <h2 className="text-display mt-3 text-2xl text-foreground sm:text-3xl">
            Pick the destination that matches your request.
          </h2>
          <p className="mt-4 text-pretty text-[15px] leading-7 text-muted-foreground">
            Each inbox is monitored by the team that owns it, so routing your message correctly is
            the fastest path to an answer.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {CONTACT_CHANNELS.map((channel) => (
            <div key={channel.email} className="surface-raised flex flex-col p-5">
              <p className="text-section-title">{channel.label}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{channel.description}</p>
              <a
                href={`mailto:${channel.email}`}
                className="mt-4 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 transition-colors hover:underline"
              >
                {channel.email}
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Guidance + availability ───────────────────────────────────────── */}
      <section className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto grid max-w-4xl gap-12 px-5 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div>
            <p className="text-eyebrow">Before you write</p>
            <h2 className="text-display mt-3 text-xl text-foreground sm:text-2xl">
              What to include
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A little context up front helps us respond faster and more accurately.
            </p>
            <ul className="mt-6 space-y-4">
              {RESPONSE_GUIDANCE.map((item, index) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-[11px] font-medium tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-muted-foreground">{item}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-eyebrow">Availability</p>
            <h2 className="text-display mt-3 text-xl text-foreground sm:text-2xl">Office hours</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              We don&apos;t publish a physical office address. Email is the fastest way to reach the
              right owner.
            </p>
            <dl className="mt-6 divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
              {OFFICE_HOURS.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 px-4 py-3.5"
                >
                  <dt className="text-eyebrow">{row.label}</dt>
                  <dd className="text-sm font-medium text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </main>
  );
}
