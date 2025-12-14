import Link from 'next/link';
import { ArrowRight, FileText, Briefcase, Clock, Users, Download, CheckCircle2, Sparkles } from 'lucide-react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';

export default async function HomePage() {
  const { userId } = await auth();
  
  // If user is logged in, redirect to dashboard
  if (userId) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-lg font-bold text-primary-foreground">F</span>
            </div>
            <span className="text-xl font-semibold">Follio</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/sign-in">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/sign-up">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>The future of professional profiles</span>
          </div>
          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Your resume,{' '}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              reimagined
            </span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Create a digital-native resume that adapts to every viewer. Multiple views, perfect
            parsing, and seamless exports — all from a single source of truth.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/sign-up">
              <Button size="xl" className="gap-2">
                Create your Follio
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/u/alexchen">
              <Button size="xl" variant="outline">
                See demo profile
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold">One profile, infinite possibilities</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Your data is stored once, rendered everywhere. Viewers choose their preferred lens.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Resume View */}
          <div className="group rounded-2xl border bg-card p-6 transition-shadow hover:shadow-lg">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="mb-2 font-semibold">Resume View</h3>
            <p className="text-sm text-muted-foreground">
              Traditional resume format. Clean, professional, and ATS-friendly for job applications.
            </p>
          </div>

          {/* Portfolio View */}
          <div className="group rounded-2xl border bg-card p-6 transition-shadow hover:shadow-lg">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Briefcase className="h-6 w-6" />
            </div>
            <h3 className="mb-2 font-semibold">Portfolio View</h3>
            <p className="text-sm text-muted-foreground">
              Showcase your projects with rich visuals, tech stacks, and live demos.
            </p>
          </div>

          {/* Timeline View */}
          <div className="group rounded-2xl border bg-card p-6 transition-shadow hover:shadow-lg">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Clock className="h-6 w-6" />
            </div>
            <h3 className="mb-2 font-semibold">Timeline View</h3>
            <p className="text-sm text-muted-foreground">
              Your career journey as a chronological story. Perfect for interviews.
            </p>
          </div>

          {/* Recruiter View */}
          <div className="group rounded-2xl border bg-card p-6 transition-shadow hover:shadow-lg">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="mb-2 font-semibold">Recruiter View</h3>
            <p className="text-sm text-muted-foreground">
              Key metrics, skills matrix, and quick facts optimized for busy recruiters.
            </p>
          </div>
        </div>
      </section>

      {/* Perfect Parsing Section */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="mb-4 text-3xl font-bold">100% correct parsing, guaranteed</h2>
              <p className="mb-6 text-lg text-muted-foreground">
                No more broken exports. Your data is structured from the start, so exports are
                always accurate — whether it's JSON, plain text, or PDF.
              </p>
              <ul className="space-y-3">
                {[
                  'JSON Resume standard export',
                  'Plain text for copy/paste',
                  'PDF with perfect formatting',
                  'ATS-optimized output',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="rounded-2xl border bg-card p-6 shadow-lg">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-medium">Export Options</span>
                  <Download className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                    <span className="text-sm">JSON Resume</span>
                    <span className="text-xs text-muted-foreground">.json</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                    <span className="text-sm">Plain Text</span>
                    <span className="text-xs text-muted-foreground">.txt</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                    <span className="text-sm">PDF Document</span>
                    <span className="text-xs text-muted-foreground">.pdf</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Import Section */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="mb-4 text-3xl font-bold">Import from anywhere</h2>
          <p className="mx-auto mb-12 max-w-2xl text-muted-foreground">
            Upload your existing resume, connect GitHub, or start fresh. We'll help you build your
            canonical profile.
          </p>
          <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-3">
            <div className="rounded-2xl border bg-card p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-semibold">Resume Upload</h3>
              <p className="text-sm text-muted-foreground">PDF or DOCX</p>
            </div>
            <div className="rounded-2xl border bg-card p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </div>
              <h3 className="mb-2 font-semibold">GitHub Connect</h3>
              <p className="text-sm text-muted-foreground">Import projects & repos</p>
            </div>
            <div className="rounded-2xl border bg-card p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-semibold">Manual Entry</h3>
              <p className="text-sm text-muted-foreground">Start from scratch</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-primary px-8 py-16 text-center text-primary-foreground">
          <h2 className="mb-4 text-3xl font-bold">Ready to build your Follio?</h2>
          <p className="mx-auto mb-8 max-w-xl opacity-90">
            Join professionals who trust Follio for their digital presence. Create your canonical
            profile in minutes.
          </p>
          <Link href="/sign-up">
            <Button size="xl" variant="secondary" className="gap-2">
              Get started for free
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
                <span className="text-sm font-bold text-primary-foreground">F</span>
              </div>
              <span className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Follio. All rights reserved.
              </span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="#" className="hover:text-foreground">
                Privacy
              </Link>
              <Link href="#" className="hover:text-foreground">
                Terms
              </Link>
              <Link href="#" className="hover:text-foreground">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
