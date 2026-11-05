import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

// A static segment, so it wins over the `[[...sign-in]]` catch-all that used to answer
// `/sign-in/forgot-password` with the sign-in form.
export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12 sm:px-6">
      <div className="w-full max-w-md">
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
