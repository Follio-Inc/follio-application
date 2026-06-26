import { SignInForm } from '@/components/auth/sign-in-form';

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12 sm:px-6">
      <div className="w-full max-w-md">
        <SignInForm />
      </div>
    </main>
  );
}
