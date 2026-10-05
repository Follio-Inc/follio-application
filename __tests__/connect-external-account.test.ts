import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/errors', () => ({
  isReverificationCancelledError: (error: unknown) =>
    Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'reverification_cancelled'
    ),
}));

import {
  githubConnectFallbackHint,
  mapExternalAccountConnectError,
} from '@/lib/account/connect-external-account';

describe('mapExternalAccountConnectError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats Clerk step-up cancellation as cancelled', () => {
    expect(mapExternalAccountConnectError({ code: 'reverification_cancelled' }, 'GitHub')).toEqual({
      kind: 'cancelled',
    });
  });

  it('treats an already-linked provider as already connected', () => {
    expect(
      mapExternalAccountConnectError(new Error('This account is already connected'), 'GitHub')
    ).toEqual({ kind: 'already_connected' });
  });

  it('rewrites Clerk additional verification errors into a retry prompt', () => {
    expect(
      mapExternalAccountConnectError(
        new Error('You need to provide additional verification to perform this operation'),
        'GitHub'
      )
    ).toEqual({
      kind: 'error',
      message: "Confirm it's you, then try connecting GitHub again.",
    });
  });

  it('passes through unrelated Clerk errors', () => {
    expect(
      mapExternalAccountConnectError(new Error('OAuth provider unavailable'), 'GitHub')
    ).toEqual({
      kind: 'error',
      message: 'OAuth provider unavailable',
    });
  });
});

describe('githubConnectFallbackHint', () => {
  it('points users at username import when OAuth cannot start', () => {
    expect(githubConnectFallbackHint("Confirm it's you, then try connecting GitHub again.")).toBe(
      "Confirm it's you, then try connecting GitHub again. You can also import by entering your GitHub username — no account connection needed."
    );
  });
});
