'use client';

import { useClerk, useSignIn, useUser } from '@clerk/nextjs';
import { useState } from 'react';

interface GitHubData {
  profile: {
    firstName?: string;
    lastName?: string;
    headline?: string;
    summary?: string;
    location?: string;
    avatarUrl?: string;
    company?: string;
  };
  githubProfile: {
    username: string;
    githubId: number;
    bio: string | null;
    publicRepos: number;
    followers: number;
    following: number;
    totalStars: number;
    totalForks: number;
    primaryLanguages: string[];
    languageStats: Record<string, number>;
    organizations: Array<{
      login: string;
      avatarUrl: string;
      url: string;
      description?: string;
    }>;
  };
  projects: Array<{
    title: string;
    description?: string;
    repoUrl: string;
    ghStars: number;
    ghForks: number;
    ghLanguage?: string;
    ghTopics: string[];
    ghPinned: boolean;
    ghReadme?: string;
  }>;
  skills: Array<{
    name: string;
    category: string;
    percentage?: number;
  }>;
  links: Array<{
    type: string;
    url: string;
    label: string;
  }>;
  summary: {
    projects: number;
    skills: number;
    links: number;
  };
  _meta: {
    username: string;
    fetchedAt: string;
    hasPinnedRepos: boolean;
    hasOrganizations: boolean;
  };
}

export default function TestGitHubPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signIn } = useSignIn();
  const { signOut } = useClerk();
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GitHubData | null>(null);
  const [rawResponse, setRawResponse] = useState<string>('');

  // Find connected GitHub account from Clerk
  const githubAccount = user?.externalAccounts?.find((account) => account.provider === 'github');

  const githubUsername = githubAccount?.username;

  // Show loading state while Clerk loads
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  // Show sign-in prompt if not authenticated
  if (!isSignedIn) {
    const handleGitHubSignIn = async () => {
      if (!signIn) return;
      setSigningIn(true);
      setError(null);

      try {
        await signIn.authenticateWithRedirect({
          strategy: 'oauth_github',
          redirectUrl: '/test-github',
          redirectUrlComplete: '/test-github',
        });
      } catch (err) {
        console.error('GitHub sign-in error:', err);
        setError(err instanceof Error ? err.message : 'Failed to sign in with GitHub');
        setSigningIn(false);
      }
    };

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <h1 className="mb-4 text-3xl font-bold">🧪 GitHub Import Test</h1>
          <p className="mb-6 text-gray-400">Sign in with GitHub to test the import</p>
          {error && (
            <div className="mb-4 rounded-lg border border-red-700 bg-red-900/50 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
          <button
            onClick={handleGitHubSignIn}
            disabled={signingIn}
            className="flex items-center gap-3 rounded-lg bg-gray-800 px-6 py-3 font-medium transition-colors hover:bg-gray-700 disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            {signingIn ? 'Signing in...' : 'Sign in with GitHub'}
          </button>
        </div>
      </div>
    );
  }

  const handleConnectGitHub = async () => {
    setConnecting(true);
    setError(null);

    try {
      const externalAccount = await user?.createExternalAccount({
        strategy: 'oauth_github',
        redirectUrl: window.location.href,
      });

      const url = externalAccount?.verification?.externalVerificationRedirectURL;
      if (url) {
        window.location.href = url.toString();
      }
    } catch (err) {
      console.error('GitHub connect error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect GitHub');
      setConnecting(false);
    }
  };

  const handleDisconnectGitHub = async () => {
    if (!githubAccount) return;

    setDisconnecting(true);
    setError(null);

    try {
      await githubAccount.destroy();
      // Clear any imported data
      setData(null);
      setRawResponse('');
    } catch (err) {
      console.error('GitHub disconnect error:', err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect GitHub');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleImport = async () => {
    if (!githubUsername) {
      setError('No GitHub account connected');
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);
    setRawResponse('');

    try {
      const response = await fetch('/api/import/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: githubUsername, saveToProfile: true }),
      });

      const result = await response.json();
      setRawResponse(JSON.stringify(result, null, 2));

      if (!response.ok) {
        throw new Error(result.error || 'Failed to import');
      }

      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8 text-white">
      <div className="mx-auto max-w-6xl">
        {/* User Info Bar */}
        <div className="mb-6 flex items-center justify-between rounded-lg bg-gray-800 p-4">
          <div className="flex items-center gap-3">
            {user?.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.imageUrl} alt="User" className="h-10 w-10 rounded-full" />
            )}
            <div>
              <div className="font-medium">{user?.fullName || user?.username || 'User'}</div>
              <div className="text-sm text-gray-400">{user?.primaryEmailAddress?.emailAddress}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-green-400">✓ Authenticated via Clerk</div>
            <button
              onClick={handleSignOut}
              className="rounded bg-red-600/20 px-3 py-1 text-sm text-red-400 transition-colors hover:bg-red-600/30"
            >
              Sign Out
            </button>
          </div>
        </div>

        <h1 className="mb-2 text-3xl font-bold">🧪 GitHub Import Test Page</h1>
        <p className="mb-8 text-gray-400">
          Test the enhanced GitHub import functionality with Clerk OAuth
        </p>

        {/* GitHub Connection Section */}
        <div className="mb-8 rounded-lg bg-gray-800 p-6">
          <h2 className="mb-4 text-xl font-semibold">GitHub Connection</h2>

          {githubUsername ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-lg bg-green-900/30 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-700">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-green-400">✓ GitHub Connected</div>
                  <div className="text-lg">@{githubUsername}</div>
                </div>
                <button
                  onClick={handleImport}
                  disabled={loading}
                  className="rounded-lg bg-blue-600 px-6 py-2 font-medium transition-colors hover:bg-blue-700 disabled:bg-gray-600"
                >
                  {loading ? 'Importing...' : 'Import Data'}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  Connected via Clerk OAuth. Click &quot;Import Data&quot; to fetch your GitHub
                  profile, repositories, and statistics.
                </p>
                <button
                  onClick={handleDisconnectGitHub}
                  disabled={disconnecting}
                  className="rounded bg-red-600/20 px-3 py-1 text-sm text-red-400 transition-colors hover:bg-red-600/30 disabled:opacity-50"
                >
                  {disconnecting ? 'Disconnecting...' : 'Disconnect GitHub'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-lg bg-gray-700 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-600">
                  <svg className="h-6 w-6 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-400">GitHub Not Connected</div>
                  <div className="text-sm text-gray-500">
                    Connect your GitHub account to import your data
                  </div>
                </div>
                <button
                  onClick={handleConnectGitHub}
                  disabled={connecting}
                  className="rounded-lg bg-gray-600 px-6 py-2 font-medium transition-colors hover:bg-gray-500 disabled:opacity-50"
                >
                  {connecting ? 'Connecting...' : 'Connect GitHub'}
                </button>
              </div>

              <p className="text-sm text-gray-400">
                This uses Clerk OAuth to securely connect your GitHub account.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-700 bg-red-900/50 p-4 text-red-200">
              ❌ {error}
            </div>
          )}
        </div>

        {/* Results Section */}
        {data && (
          <div className="space-y-6">
            {/* Success Banner with Navigation Links */}
            <div className="rounded-lg border border-green-700 bg-green-900/50 p-6">
              <h2 className="mb-2 text-xl font-semibold text-green-400">
                ✅ Data Saved to Profile!
              </h2>
              <p className="mb-4 text-gray-300">
                Your GitHub data has been imported and saved. You can now view and manage it in the
                Builder.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="/builder/projects"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium transition-colors hover:bg-blue-700"
                >
                  📁 View Projects in Builder
                </a>
                <a
                  href="/builder/skills"
                  className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 font-medium transition-colors hover:bg-purple-700"
                >
                  🛠️ View Skills
                </a>
                <a
                  href="/builder/links"
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-600 px-4 py-2 font-medium transition-colors hover:bg-gray-500"
                >
                  🔗 View Links
                </a>
              </div>
            </div>

            {/* Profile Card */}
            <div className="rounded-lg bg-gray-800 p-6">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
                👤 Profile Data
              </h2>
              <div className="flex gap-6">
                {data.profile.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.profile.avatarUrl}
                    alt="Avatar"
                    className="h-24 w-24 rounded-full"
                  />
                )}
                <div className="space-y-2">
                  <p>
                    <span className="text-gray-400">Name:</span>{' '}
                    <strong>
                      {data.profile.firstName} {data.profile.lastName}
                    </strong>
                  </p>
                  <p>
                    <span className="text-gray-400">Headline:</span> {data.profile.headline}
                  </p>
                  <p>
                    <span className="text-gray-400">Location:</span>{' '}
                    {data.profile.location || 'N/A'}
                  </p>
                  <p>
                    <span className="text-gray-400">Company:</span> {data.profile.company || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* GitHub Stats */}
            <div className="rounded-lg bg-gray-800 p-6">
              <h2 className="mb-4 text-xl font-semibold">📊 GitHub Stats</h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-lg bg-gray-700 p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-400">
                    {data.githubProfile.totalStars}
                  </div>
                  <div className="text-sm text-gray-400">Total Stars</div>
                </div>
                <div className="rounded-lg bg-gray-700 p-4 text-center">
                  <div className="text-2xl font-bold text-blue-400">
                    {data.githubProfile.publicRepos}
                  </div>
                  <div className="text-sm text-gray-400">Public Repos</div>
                </div>
                <div className="rounded-lg bg-gray-700 p-4 text-center">
                  <div className="text-2xl font-bold text-green-400">
                    {data.githubProfile.followers}
                  </div>
                  <div className="text-sm text-gray-400">Followers</div>
                </div>
                <div className="rounded-lg bg-gray-700 p-4 text-center">
                  <div className="text-2xl font-bold text-purple-400">
                    {data.githubProfile.totalForks}
                  </div>
                  <div className="text-sm text-gray-400">Total Forks</div>
                </div>
              </div>
            </div>

            {/* Organizations */}
            {data.githubProfile.organizations.length > 0 && (
              <div className="rounded-lg bg-gray-800 p-6">
                <h2 className="mb-4 text-xl font-semibold">🏢 Organizations</h2>
                <div className="flex flex-wrap gap-4">
                  {data.githubProfile.organizations.map((org) => (
                    <a
                      key={org.login}
                      href={org.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 transition-colors hover:bg-gray-600"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={org.avatarUrl} alt={org.login} className="h-6 w-6 rounded" />
                      <span>{org.login}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Language Stats */}
            <div className="rounded-lg bg-gray-800 p-6">
              <h2 className="mb-4 text-xl font-semibold">💻 Language Statistics</h2>
              <div className="space-y-3">
                {Object.entries(data.githubProfile.languageStats)
                  .slice(0, 10)
                  .map(([lang, percentage]) => (
                    <div key={lang}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{lang}</span>
                        <span className="text-gray-400">{percentage}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-700">
                        <div
                          className="h-2 rounded-full bg-blue-500 transition-all"
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Projects */}
            <div className="rounded-lg bg-gray-800 p-6">
              <h2 className="mb-4 text-xl font-semibold">📂 Projects ({data.projects.length})</h2>
              <div className="grid gap-4">
                {data.projects.map((project, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg bg-gray-700 p-4 ${project.ghPinned ? 'ring-2 ring-yellow-500' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold">{project.title}</h3>
                          {project.ghPinned && (
                            <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                              📌 Pinned
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-400">
                          {project.description || 'No description'}
                        </p>
                        {project.ghReadme && (
                          <p className="mt-2 text-xs italic text-gray-500">
                            README: {project.ghReadme.slice(0, 150)}...
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {project.ghLanguage && (
                            <span className="rounded bg-blue-500/20 px-2 py-1 text-xs text-blue-300">
                              {project.ghLanguage}
                            </span>
                          )}
                          {project.ghTopics.slice(0, 5).map((topic) => (
                            <span
                              key={topic}
                              className="rounded bg-gray-600 px-2 py-1 text-xs text-gray-300"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="text-yellow-400">⭐ {project.ghStars}</div>
                        <div className="text-gray-400">🍴 {project.ghForks}</div>
                      </div>
                    </div>
                    <a
                      href={project.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-sm text-blue-400 hover:underline"
                    >
                      View on GitHub →
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Skills */}
            <div className="rounded-lg bg-gray-800 p-6">
              <h2 className="mb-4 text-xl font-semibold">🛠 Skills ({data.skills.length})</h2>
              <div className="space-y-4">
                {/* Languages */}
                <div>
                  <h3 className="mb-2 text-sm font-medium text-gray-400">Languages</h3>
                  <div className="flex flex-wrap gap-2">
                    {data.skills
                      .filter((s) => s.category === 'Languages')
                      .map((skill) => (
                        <span
                          key={skill.name}
                          className="rounded-full bg-blue-500/20 px-3 py-1 text-sm text-blue-300"
                        >
                          {skill.name}
                          {skill.percentage && (
                            <span className="ml-1 text-blue-400">({skill.percentage}%)</span>
                          )}
                        </span>
                      ))}
                  </div>
                </div>
                {/* Technologies */}
                <div>
                  <h3 className="mb-2 text-sm font-medium text-gray-400">Technologies</h3>
                  <div className="flex flex-wrap gap-2">
                    {data.skills
                      .filter((s) => s.category === 'Technologies')
                      .map((skill) => (
                        <span
                          key={skill.name}
                          className="rounded-full bg-green-500/20 px-3 py-1 text-sm text-green-300"
                        >
                          {skill.name}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Meta Info */}
            <div className="rounded-lg bg-gray-800 p-6">
              <h2 className="mb-4 text-xl font-semibold">ℹ️ Import Metadata</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Username:</span> {data._meta.username}
                </div>
                <div>
                  <span className="text-gray-400">Fetched At:</span>{' '}
                  {new Date(data._meta.fetchedAt).toLocaleString()}
                </div>
                <div>
                  <span className="text-gray-400">Has Pinned Repos:</span>{' '}
                  {data._meta.hasPinnedRepos ? '✅ Yes' : '❌ No'}
                </div>
                <div>
                  <span className="text-gray-400">Has Organizations:</span>{' '}
                  {data._meta.hasOrganizations ? '✅ Yes' : '❌ No'}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-gray-800 p-6">
              <h2 className="mb-4 text-xl font-semibold">📋 Summary</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold">{data.summary.projects}</div>
                  <div className="text-gray-400">Projects</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold">{data.summary.skills}</div>
                  <div className="text-gray-400">Skills</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold">{data.summary.links}</div>
                  <div className="text-gray-400">Links</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Raw JSON Response */}
        {rawResponse && (
          <div className="mt-8 rounded-lg bg-gray-800 p-6">
            <h2 className="mb-4 text-xl font-semibold">🔍 Raw API Response</h2>
            <pre className="max-h-96 overflow-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-300">
              {rawResponse}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
