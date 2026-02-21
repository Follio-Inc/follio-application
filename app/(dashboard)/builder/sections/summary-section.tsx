'use client';

import { useCallback, useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import type { FullProfile } from '@/types';

interface SummarySectionProps {
  profile: FullProfile;
  onUpdate: (data: Partial<FullProfile>) => void;
}

export function SummarySection({ profile, onUpdate }: SummarySectionProps) {
  const [summary, setSummary] = useState(profile.summary || '');

  const handleChange = useCallback(
    (value: string) => {
      setSummary(value);
      onUpdate({ summary: value });
    },
    [onUpdate]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
        <CardDescription>
          A brief introduction about yourself, your experience, and what you&apos;re passionate
          about
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="summary">About / Summary</Label>
          <Textarea
            id="summary"
            value={summary}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Write a brief introduction about yourself, your experience, and what you're passionate about..."
            rows={6}
          />
          <p className="text-xs text-muted-foreground">{summary.length}/2000 characters</p>
        </div>
      </CardContent>
    </Card>
  );
}
