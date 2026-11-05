'use client';

import { useSignIn } from '@clerk/nextjs';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function clerkErrorMessage(err: unknown, fallback: string): string {
  const clerkError = err as { errors?: Array<{ message: string; longMessage?: string }> };
  return clerkError.errors?.[0]?.longMessage || clerkError.errors?.[0]?.message || fallback;
}

/**
 * Reset a forgotten password with Clerk's email code: enter the email, then the emailed code
 * and a new password. Signs in when Clerk completes; if the account also needs a second step
 * (two-step verification), the person signs in again with the new password.
 */
export function ForgotPasswordForm() {
  const { isLoaded, signIn, setActive } = useSignIn();

  const [email, setEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  /** Where Clerk sent the code, e.g. "c***@example.com". */
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Find the account, check it can reset a password, and email the code. Returns false (with
   * an error shown) when the account has no password, e.g. one that only signs in with Google.
   */
  const sendCode = async (): Promise<boolean> => {
    if (!isLoaded) return false;
    const attempt = await signIn.create({ identifier: email.trim() });
    const factor = attempt.supportedFirstFactors?.find(
      (f) => f.strategy === 'reset_password_email_code'
    );
    if (factor?.strategy !== 'reset_password_email_code') {
      setError(
        'This account doesn’t have a password to reset. Sign in with Google, GitHub or LinkedIn instead.'
      );
      return false;
    }
    await attempt.prepareFirstFactor({
      strategy: 'reset_password_email_code',
      emailAddressId: factor.emailAddressId,
    });
    setSentTo(factor.safeIdentifier);
    return true;
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (await sendCode()) setCodeSent(true);
    } catch (err: unknown) {
      setError(clerkErrorMessage(err, 'Couldn’t send a reset code. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setNotice('');
    try {
      if (await sendCode()) setNotice('We sent a new code.');
    } catch (err: unknown) {
      setError(clerkErrorMessage(err, 'Couldn’t send a new code. Please try again.'));
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setError('');
    setNotice('');

    if (password !== confirmPassword) {
      setError('The passwords don’t match.');
      return;
    }

    setIsLoading(true);
    try {
      const verified = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
      });
      if (verified.status !== 'needs_new_password') {
        setError('That code didn’t work. Please try again.');
        return;
      }

      const result = await signIn.resetPassword({ password, signOutOfOtherSessions: true });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        // Full document navigation, as after sign-in, so home can route to onboarding.
        window.location.assign('/');
        return;
      }
      // e.g. `needs_second_factor`: the password is changed, but signing in needs another step.
      setPasswordChanged(true);
    } catch (err: unknown) {
      setError(clerkErrorMessage(err, 'Couldn’t reset your password. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseDifferentEmail = () => {
    setCodeSent(false);
    setCode('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setNotice('');
  };

  const errorBox = error && (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      {error}
    </div>
  );

  return (
    <Card className="w-full max-w-md rounded-2xl border shadow-lg">
      <CardHeader className="space-y-4 text-center">
        <div className="flex justify-center">
          <Logo size="lg" showText={false} />
        </div>
        <div>
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription className="mt-1">
            {codeSent
              ? `We sent a code to ${sentTo || email.trim()}. Check your spam folder if you don’t see it.`
              : 'Enter your email and we’ll send you a code to reset your password.'}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {passwordChanged ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Your password was changed. Sign in with your new password to continue.
            </p>
            <Button asChild className="w-full">
              <Link href="/sign-in">Back to sign in</Link>
            </Button>
          </div>
        ) : codeSent ? (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                disabled={isLoading}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter it again"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>

            {errorBox}
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !code.trim() || !password || !confirmPassword}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset password
            </Button>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={handleUseDifferentEmail}
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                Use a different email
              </button>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isLoading}
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                Send a new code
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="email"
                autoFocus
              />
            </div>

            {errorBox}

            <Button type="submit" className="w-full" disabled={isLoading || !email.trim()}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send reset code
            </Button>
          </form>
        )}

        {!passwordChanged && (
          <p className="text-center text-sm text-muted-foreground">
            Remembered it?{' '}
            <Link href="/sign-in" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
