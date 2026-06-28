import { SignUpForm } from '@/components/auth/sign-up-form';

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12 sm:px-6">
      <div className="w-full max-w-md">
        <SignUpForm />
      </div>
    </main>
  );
}
