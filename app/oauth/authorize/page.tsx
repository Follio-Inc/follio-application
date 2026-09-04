import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { parseScopeString } from '@/lib/ai-connector/scopes';
import { isAllowedRedirectUri, redirectUriMatches } from '@/lib/ai-connector/oauth-register';
import { getOauthClient } from '@/services/ai-connector-oauth.service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Connect Follio',
  description: 'Allow an AI assistant to read and propose edits to your Follio',
};

interface AuthorizePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-eyebrow">Follio</p>
      <h1 className="text-display mt-3 text-2xl">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </main>
  );
}

export default async function OauthAuthorizePage({ searchParams }: AuthorizePageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const params = await searchParams;
  const clientId = firstParam(params.client_id);
  const redirectUri = firstParam(params.redirect_uri);
  const responseType = firstParam(params.response_type) || 'code';
  const codeChallenge = firstParam(params.code_challenge);
  const codeChallengeMethod = firstParam(params.code_challenge_method) || 'S256';
  const state = firstParam(params.state);
  const scope = firstParam(params.scope);

  if (responseType !== 'code') {
    return (
      <ErrorState title="Unsupported request" message="Follio only supports authorization code." />
    );
  }

  if (codeChallengeMethod !== 'S256' || !codeChallenge) {
    return (
      <ErrorState
        title="This connection is missing PKCE"
        message="The assistant must send a S256 code challenge. Try connecting again."
      />
    );
  }

  if (!clientId || !redirectUri || !isAllowedRedirectUri(redirectUri)) {
    return (
      <ErrorState
        title="Invalid connect request"
        message="The assistant sent an incomplete or unsafe redirect URL."
      />
    );
  }

  const client = await getOauthClient(clientId);
  if (!client || !redirectUriMatches(client.redirectUris, redirectUri)) {
    return (
      <ErrorState
        title="Unknown assistant"
        message="This AI client is not registered with Follio. Start the connection from Claude again."
      />
    );
  }

  const scopes = parseScopeString(scope);
  const clientName = client.name || 'This AI assistant';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-eyebrow">Follio</p>
      <h1 className="text-display mt-3 text-2xl">Connect {clientName}?</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {clientName} will be able to read your Follio and propose edits. Changes stay in a draft
        until you confirm them in chat or in Settings.
      </p>

      <ul className="mt-6 space-y-2 text-sm text-foreground">
        {scopes.includes('follio.read') && <li>Read your profile, resume, and projects</li>}
        {scopes.includes('follio.draft') && <li>Propose edits as drafts</li>}
        {scopes.includes('follio.apply') && (
          <li>Apply drafts after you confirm (never silently publish)</li>
        )}
      </ul>

      <form action="/api/oauth/authorize" method="post" className="mt-8 flex flex-col gap-3">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="scope" value={scopes.join(' ')} />

        <button
          type="submit"
          name="decision"
          value="allow"
          className="hover:bg-primary/88 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all"
        >
          Allow access
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-medium shadow-sm transition-all hover:bg-muted"
        >
          Deny
        </button>
      </form>
    </main>
  );
}
