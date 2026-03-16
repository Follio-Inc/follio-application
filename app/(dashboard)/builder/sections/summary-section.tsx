'use client';

import { useCallback, useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

import type { FullProfile } from '@/types';

interface SummarySectionProps {
  profile: FullProfile;
  onUpdate: (data: Partial<FullProfile>) => void;
  /** When true, renders without Card wrapper for use inside accordion sections */
  embedded?: boolean;
}

export function SummarySection({ profile, onUpdate, embedded }: SummarySectionProps) {
  const [summary, setSummary] = useState(profile.summary || '');

  const handleChange = useCallback(
    (value: string) => {
      setSummary(value);
      onUpdate({ summary: value });
    },
    [onUpdate]
  );

  const descriptionText =
    "A brief introduction about yourself, your experience, and what you're passionate about";

  const content = (
    <div className="space-y-2">
      <RichTextEditor
        value={summary}
        onChange={handleChange}
        placeholder="Write a brief introduction about yourself, your experience, and what you're passionate about..."
        minHeight="180px"
      />
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{descriptionText}</p>
        {content}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>{descriptionText}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 rounded-xl bg-muted/40 p-4">{content}</div>
      </CardContent>
    </Card>
  );
}
