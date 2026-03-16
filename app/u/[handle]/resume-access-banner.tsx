'use client';

import { ArrowRight, FileText, Lock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { getResumePath } from '@/lib/url';

interface ResumeAccessBannerProps {
  profileHandle: string;
  resumeVisibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  authState: 'owner' | 'authenticated' | 'anonymous';
}

export function ResumeAccessBanner({
  profileHandle,
  resumeVisibility,
  authState,
}: ResumeAccessBannerProps) {
  const [requestSent, setRequestSent] = useState(false);

  // Owner always sees a direct link
  if (authState === 'owner') {
    return (
      <div className="border-b bg-muted/30">
        <div className="container flex items-center justify-center gap-3 py-2.5">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Want to see your resume view?</span>
          <Link href={getResumePath(profileHandle)}>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              View Resume
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Private resume: don't show any banner to non-owners
  if (resumeVisibility === 'PRIVATE') {
    return null;
  }

  // Public resume: show a direct link
  if (resumeVisibility === 'PUBLIC') {
    return (
      <div className="border-b bg-muted/30">
        <div className="container flex items-center justify-center gap-3 py-2.5">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Looking for a detailed resume?</span>
          <Link href={getResumePath(profileHandle)}>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              View Resume
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Unlisted resume: show Request Access
  return (
    <div className="border-b bg-muted/30">
      <div className="container flex items-center justify-center gap-3 py-2.5">
        <Lock className="h-4 w-4 text-amber-500" />
        <span className="text-sm text-muted-foreground">Resume is available upon request.</span>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={requestSent}>
              {requestSent ? 'Request Sent' : 'Request Access'}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Request Resume Access</DialogTitle>
              <DialogDescription>
                This resume is unlisted. Send a request to the profile owner to get access.
              </DialogDescription>
            </DialogHeader>
            <RequestAccessForm
              profileHandle={profileHandle}
              onSuccess={() => setRequestSent(true)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ─── Request Access Form ───

function RequestAccessForm({
  profileHandle,
  onSuccess,
}: {
  profileHandle: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // TODO: Implement actual request access API
    // For now, simulate sending a request
    console.log('Request access for', profileHandle, { name, email, message });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setIsSubmitting(false);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          Your Name
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="John Doe"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Your Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="john@company.com"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="message" className="text-sm font-medium">
          Message (optional)
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="I'd like to view your resume for a potential opportunity..."
        />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Sending...' : 'Send Request'}
      </Button>
    </form>
  );
}
