import { ArrowRight, Mail, Scale, Shield, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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

export const metadata = {
  title: 'Contact Us - Follio',
  description: 'Contact Follio for support, legal, privacy, security, and partnership requests.',
};

export default function ContactPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(46,212,174,0.14),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(46,212,174,0.08),transparent_24%),linear-gradient(to_bottom,rgba(250,250,250,0.8),transparent_22%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(46,212,174,0.16),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(46,212,174,0.09),transparent_24%),linear-gradient(to_bottom,rgba(255,255,255,0.03),transparent_22%)]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-border/60 pb-5">
          <Link href="/" className="group inline-flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-card shadow-sm transition-transform duration-200 group-hover:-translate-y-0.5">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-foreground">Follio</p>
              <p className="text-xs text-muted-foreground">Professional identity platform</p>
            </div>
          </Link>

          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <Link href="/privacy">Privacy</Link>
          </Button>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
          <div className="relative space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Mail className="h-3.5 w-3.5" />
              Contact us
            </div>

            <div className="space-y-5">
              <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Reach the right team for support, legal, and partnership requests.
              </h1>
              <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                Use the addresses below to get your message routed quickly. This page is for
                customer support, privacy matters, legal notices, security reports, and other
                business inquiries.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2 rounded-full px-6">
                <a href="mailto:support@follio.dev">
                  Email support
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full px-6">
                <Link href="/terms">View terms</Link>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Support</p>
                <p className="mt-2 text-sm text-foreground">Product help and account issues</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Legal</p>
                <p className="mt-2 text-sm text-foreground">Privacy, takedowns, and notices</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Security</p>
                <p className="mt-2 text-sm text-foreground">Responsible vulnerability reports</p>
              </div>
            </div>
          </div>

          <Card className="relative overflow-hidden border-border/70 bg-card/90 shadow-[0_24px_80px_-28px_rgb(0_0_0/0.35)] backdrop-blur">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
            <CardHeader className="space-y-3 pb-4">
              <CardTitle className="text-2xl">Contact routes</CardTitle>
              <CardDescription>
                Pick the destination that matches your request so we can route it correctly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {CONTACT_CHANNELS.map((channel) => (
                <div
                  key={channel.email}
                  className="rounded-2xl border border-border/70 bg-background/70 p-4 transition-colors hover:border-primary/30 hover:bg-primary/5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{channel.label}</p>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {channel.description}
                      </p>
                    </div>
                    <a
                      href={`mailto:${channel.email}`}
                      className="shrink-0 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      {channel.email}
                    </a>
                  </div>
                </div>
              ))}

              <div className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-3">
                <div className="rounded-xl bg-muted/40 p-3">
                  <Shield className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-sm font-medium text-foreground">Security first</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Handle sensitive reports privately and carefully.
                  </p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <Scale className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-sm font-medium text-foreground">Legal requests</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Include the page, profile handle, or policy reference.
                  </p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <Users className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-sm font-medium text-foreground">Other inquiries</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Partnership and press requests are routed separately.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 pb-10 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-border/70 bg-card/80 shadow-sm backdrop-blur">
            <CardHeader>
              <CardTitle className="text-lg">What to include</CardTitle>
              <CardDescription>
                A little context up front helps us respond faster and more accurately.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {RESPONSE_GUIDANCE.map((item) => (
                <div key={item} className="flex gap-3 rounded-xl bg-muted/40 p-3">
                  <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <p className="text-sm leading-6 text-muted-foreground">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80 shadow-sm backdrop-blur">
            <CardHeader>
              <CardTitle className="text-lg">Office hours</CardTitle>
              <CardDescription>
                We do not publish a physical office address here. Email is the fastest way to reach
                the right owner.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Typical reply
                  </p>
                  <p className="mt-2 text-sm text-foreground">1-2 business days</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Urgent security
                  </p>
                  <p className="mt-2 text-sm text-foreground">Use security@follio.dev</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
