import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy - Follio',
  description: 'Privacy policy for Follio - Your professional identity platform',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.08),transparent_30%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--muted)/0.22))]">
      <section className="mx-auto w-full max-w-5xl px-6 py-12 sm:px-8 lg:px-12 lg:py-16">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link href="/" className="text-muted-foreground transition-colors hover:text-foreground">
            Back to home
          </Link>
          <Link
            href="/terms"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Terms of Service
          </Link>
        </div>

        <div className="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_-40px_rgb(0_0_0/0.35)] backdrop-blur sm:p-10 lg:p-12">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-primary">
              Privacy Policy
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              How Follio handles your information
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              This policy explains what we collect, why we collect it, how we use and share it, and
              the choices you have when using Follio.
            </p>
            <div className="mt-6 rounded-2xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Last updated:</span> June 8, 2026
            </div>
          </div>

          <article className="mt-10 space-y-10 text-sm leading-7 text-muted-foreground">
            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                1. Interpretation and definitions
              </h2>
              <p>
                Capitalized terms have the meanings given in this policy. We use "Personal Data" and
                "Personal Information" interchangeably unless a law uses a specific term.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ['Account', 'A unique account created to access Follio.'],
                  ['Company', 'Follio Inc., 626 E Kilbourn Ave, Apt 1408, Milwaukee, WI 53202.'],
                  ['Service', 'The Follio website and related services.'],
                  ['Website', 'Follio, available at follio.me.'],
                ].map(([term, definition]) => (
                  <div
                    key={term}
                    className="rounded-2xl border border-border/60 bg-background/70 p-4"
                  >
                    <p className="font-medium text-foreground">{term}</p>
                    <p className="mt-1">{definition}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                2. Information we collect
              </h2>
              <p>We may collect the following information when you use Follio:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Account details such as your name, email address, and profile information.</li>
                <li>
                  Usage data such as pages visited, time spent, browser information, and device
                  data.
                </li>
                <li>
                  Cookies and similar tracking technologies used for authentication, preferences,
                  and analytics.
                </li>
                <li>
                  Information you voluntarily submit through forms, support requests, or profile
                  content.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                3. How we use information
              </h2>
              <p>We use personal data to operate and improve the service, including to:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Provide, maintain, and monitor the service.</li>
                <li>Manage your account and authenticate you.</li>
                <li>Contact you about updates, security notices, and support.</li>
                <li>Analyze usage, improve product quality, and prevent abuse.</li>
                <li>
                  Support business transfers, legal compliance, and other legitimate business needs.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                4. Cookies and tracking
              </h2>
              <p>
                We use essential cookies to keep you signed in and to operate the website, and we
                may use other cookies for preferences, analytics, and product improvement where
                permitted by law.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                5. Sharing and retention
              </h2>
              <p>
                We may share information with service providers, affiliates, business partners,
                other users in public areas, or third parties when required by law or with your
                consent.
              </p>
              <p>
                We retain personal data only as long as needed for the purposes described in this
                policy, to comply with legal obligations, and to resolve disputes. When data is no
                longer needed, we delete or anonymize it where practical.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                6. Security, transfers, and your rights
              </h2>
              <p>
                We take reasonable measures to protect your data, but no online system is perfectly
                secure. Your information may be processed in locations outside your jurisdiction,
                subject to appropriate safeguards where required.
              </p>
              <p>
                You can request access, correction, or deletion of personal data by contacting us.
                Some data may need to be kept for legal, security, or backup purposes.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                7. Children&apos;s privacy
              </h2>
              <p>
                Follio is not intended for anyone under 16. We do not knowingly collect personal
                data from children under 16.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                8. Contact us
              </h2>
              <p>
                If you have questions about this Privacy Policy or your data, contact us through the{' '}
                <Link
                  href="/contact"
                  className="text-foreground underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                >
                  contact page
                </Link>{' '}
                or directly at{' '}
                <a
                  href="mailto:shobhit.s@follio.me"
                  className="text-foreground underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                >
                  shobhit.s@follio.me
                </a>
                .
              </p>
            </section>
          </article>
        </div>
      </section>
    </main>
  );
}
