import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service - Follio',
  description: 'Terms of service for Follio',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.08),transparent_30%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--muted)/0.22))]">
      <section className="mx-auto w-full max-w-5xl px-6 py-12 sm:px-8 lg:px-12 lg:py-16">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link href="/" className="text-muted-foreground transition-colors hover:text-foreground">
            Back to home
          </Link>
          <Link
            href="/privacy"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Privacy Policy
          </Link>
        </div>

        <div className="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_-40px_rgb(0_0_0/0.35)] backdrop-blur sm:p-10 lg:p-12">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-primary">
              Terms of Service
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Legal terms for using Follio
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              These terms govern your access to and use of Follio&apos;s website and services.
              Please read them carefully before using the product.
            </p>
            <div className="mt-6 rounded-2xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Last updated:</span> June 8, 2026
            </div>
          </div>

          <article className="mt-10 space-y-10 text-sm leading-7 text-muted-foreground">
            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                1. Agreement to our legal terms
              </h2>
              <p>
                By accessing or using Follio, you agree to be bound by these legal terms. If you do
                not agree, you must not use the service.
              </p>
              <p>
                Follio Inc. operates websites at follio.app and follio.me, plus related products and
                services.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                2. Eligibility and accounts
              </h2>
              <p>
                You represent that any registration information you submit is accurate and current,
                that you have the legal capacity to agree to these terms, and that you are not a
                minor where you live. The services are intended for users who are at least 18 years
                old.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                3. Our services and intellectual property
              </h2>
              <p>
                We own or license the source code, functionality, designs, content, and marks used
                in the service. Subject to these terms, we grant you a limited, non-exclusive,
                non-transferable, revocable license to access and use the service for personal or
                internal business purposes.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                4. User submissions and prohibited activities
              </h2>
              <p>
                If you send us feedback, ideas, or other submissions, you agree we may use them for
                any lawful purpose. You also agree not to use the service for unlawful, harmful,
                automated, or unauthorized activity.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Do not violate applicable law or regulation.</li>
                <li>Do not access the service through bots or other non-human means.</li>
                <li>Do not infringe intellectual property or other third-party rights.</li>
                <li>
                  Do not interfere with the security, availability, or integrity of the service.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                5. Third-party services, user data, and communications
              </h2>
              <p>
                The service may contain links to third-party websites or integrations. We are not
                responsible for third-party content or policies.
              </p>
              <p>
                You are responsible for the data you submit to the service, and you consent to
                receiving electronic communications from us, including notices, policies, and
                transaction-related messages.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                6. Disclaimers and limitation of liability
              </h2>
              <p>
                The service is provided on an as-is and as-available basis. To the fullest extent
                permitted by law, we disclaim warranties and are not liable for indirect,
                incidental, consequential, special, or punitive damages arising from your use of the
                service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                7. Indemnification and termination
              </h2>
              <p>
                You agree to indemnify and hold us harmless from claims arising out of your use of
                the service, your submissions, or your breach of these terms. We may suspend or
                terminate access to the service if we believe these terms have been violated.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                8. Miscellaneous and contact
              </h2>
              <p>
                These terms and any policies posted on the service are the entire agreement between
                you and Follio. If a provision is unenforceable, the remaining provisions remain in
                effect.
              </p>
              <p>
                Questions about these terms can be sent through the{' '}
                <Link
                  href="/contact"
                  className="text-foreground underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                >
                  contact page
                </Link>{' '}
                or by email to{' '}
                <a
                  href="mailto:legal@follio.dev"
                  className="text-foreground underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                >
                  legal@follio.dev
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
