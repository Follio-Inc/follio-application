'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfileBasicInfoSchema, type ProfileBasicInfo } from '@/lib/validations';

import type { FullProfile } from '@/types';

interface BasicInfoFormProps {
  profile: FullProfile;
  onUpdate: (data: Partial<FullProfile>) => void;
}

export function BasicInfoForm({ profile, onUpdate }: BasicInfoFormProps) {
  const form = useForm<ProfileBasicInfo>({
    resolver: zodResolver(ProfileBasicInfoSchema),
    defaultValues: {
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      headline: profile.headline || '',
      summary: profile.summary || '',
      location: profile.location || '',
      avatarUrl: profile.avatarUrl || '',
    },
  });

  const handleChange = (field: keyof ProfileBasicInfo, value: string) => {
    form.setValue(field, value);
    onUpdate({ [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
        <CardDescription>Your personal details and professional summary</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-6">
          <Avatar className="h-20 w-20">
            <AvatarImage src={form.watch('avatarUrl') || undefined} />
            <AvatarFallback className="text-xl">
              {profile.firstName?.[0]}
              {profile.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Label htmlFor="avatarUrl">Profile Photo URL</Label>
            <Input
              id="avatarUrl"
              value={form.watch('avatarUrl')}
              onChange={(e) => handleChange('avatarUrl', e.target.value)}
              placeholder="https://example.com/avatar.jpg"
            />
          </div>
        </div>

        {/* Name */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              value={form.watch('firstName')}
              onChange={(e) => handleChange('firstName', e.target.value)}
              placeholder="Alex"
            />
            {form.formState.errors.firstName && (
              <p className="text-sm text-destructive">{form.formState.errors.firstName.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              value={form.watch('lastName')}
              onChange={(e) => handleChange('lastName', e.target.value)}
              placeholder="Chen"
            />
          </div>
        </div>

        {/* Headline */}
        <div className="space-y-2">
          <Label htmlFor="headline">Professional Headline</Label>
          <Input
            id="headline"
            value={form.watch('headline')}
            onChange={(e) => handleChange('headline', e.target.value)}
            placeholder="Senior Software Engineer at Google"
          />
          <p className="text-xs text-muted-foreground">
            A short tagline that appears below your name
          </p>
        </div>

        {/* Location */}
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={form.watch('location')}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder="San Francisco, CA"
          />
        </div>

        {/* Summary */}
        <div className="space-y-2">
          <Label htmlFor="summary">About / Summary</Label>
          <Textarea
            id="summary"
            value={form.watch('summary')}
            onChange={(e) => handleChange('summary', e.target.value)}
            placeholder="Write a brief introduction about yourself, your experience, and what you're passionate about..."
            rows={6}
          />
          <p className="text-xs text-muted-foreground">
            {(form.watch('summary') || '').length}/2000 characters
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
