import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/20">
      <SignIn
        forceRedirectUrl="/me"
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'shadow-lg border rounded-2xl',
          },
        }}
      />
    </div>
  );
}
