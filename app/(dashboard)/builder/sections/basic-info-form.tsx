'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Globe, Info, Mail, Phone } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProfileBasicInfoSchema, type ProfileBasicInfo } from '@/lib/validations';

import type { FullProfile } from '@/types';
import { ProfilePhotoUpload } from './profile-photo-upload';

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
        {/* Profile Photo */}
        <ProfilePhotoUpload
          currentPhotoUrl={form.watch('avatarUrl')}
          initials={`${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`}
          onPhotoChange={(url) => handleChange('avatarUrl', url)}
          onPhotoRemove={() => handleChange('avatarUrl', '')}
        />

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

interface ContactInfoFormProps {
  profile: FullProfile;
  onContactUpdate: (data: {
    email?: string;
    emailPublic?: boolean;
    phone?: string;
    phonePublic?: boolean;
    website?: string;
  }) => void;
}

// Helper type for additional emails
interface AdditionalEmail {
  email: string;
  source: string;
}

// Helper to get source badge color
function getSourceBadgeVariant(
  source: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (source.toUpperCase()) {
    case 'GITHUB':
      return 'secondary';
    case 'LINKEDIN':
      return 'default';
    case 'RESUME':
      return 'outline';
    default:
      return 'outline';
  }
}

export function ContactInfoForm({ profile, onContactUpdate }: ContactInfoFormProps) {
  const [email, setEmail] = useState(profile.contactInfo?.email || '');
  const [emailPublic, setEmailPublic] = useState(profile.contactInfo?.emailPublic || false);
  const [phone, setPhone] = useState(profile.contactInfo?.phone || '');
  const [phonePublic, setPhonePublic] = useState(profile.contactInfo?.phonePublic || false);
  const [website, setWebsite] = useState(profile.contactInfo?.website || '');

  // Parse additional emails from contactInfo
  const additionalEmails: AdditionalEmail[] = (() => {
    try {
      const raw = profile.contactInfo?.additionalEmails;
      if (Array.isArray(raw)) return raw as unknown as AdditionalEmail[];
      if (typeof raw === 'string') return JSON.parse(raw) as AdditionalEmail[];
      return [];
    } catch {
      return [];
    }
  })();

  const handleEmailChange = (value: string) => {
    setEmail(value);
    onContactUpdate({ email: value });
  };

  const handleEmailPublicChange = (checked: boolean) => {
    setEmailPublic(checked);
    onContactUpdate({ emailPublic: checked });
  };

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    onContactUpdate({ phone: value });
  };

  const handlePhonePublicChange = (checked: boolean) => {
    setPhonePublic(checked);
    onContactUpdate({ phonePublic: checked });
  };

  const handleWebsiteChange = (value: string) => {
    setWebsite(value);
    onContactUpdate({ website: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact Information</CardTitle>
        <CardDescription>
          How people can reach you. Control visibility with the eye icon.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Primary Email
            {profile.contactInfo?.emailSource && (
              <Badge variant="outline" className="text-xs">
                from {profile.contactInfo.emailSource.toLowerCase()}
              </Badge>
            )}
          </Label>
          <div className="flex gap-2">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="you@example.com"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handleEmailPublicChange(!emailPublic)}
              title={emailPublic ? 'Visible on profile' : 'Hidden from profile'}
            >
              {emailPublic ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {emailPublic
              ? 'This email will be visible on your public profile'
              : 'This email is hidden from your public profile'}
          </p>

          {/* Additional Emails */}
          {additionalEmails.length > 0 && (
            <div className="mt-3 rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Info className="h-4 w-4 text-muted-foreground" />
                Additional Emails from Imports
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <span className="cursor-help text-muted-foreground">(?)</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        These emails were found in your imported data. Click on one to make it your
                        primary email.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex flex-wrap gap-2">
                {additionalEmails.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleEmailChange(item.email)}
                    className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm transition-colors hover:bg-muted"
                  >
                    <span>{item.email}</span>
                    <Badge variant={getSourceBadgeVariant(item.source)} className="text-xs">
                      {item.source.toLowerCase()}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Phone Number
          </Label>
          <div className="flex gap-2">
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handlePhonePublicChange(!phonePublic)}
              title={phonePublic ? 'Visible on profile' : 'Hidden from profile'}
            >
              {phonePublic ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {phonePublic
              ? 'This phone number will be visible on your public profile'
              : 'This phone number is hidden from your public profile'}
          </p>
        </div>

        {/* Website */}
        <div className="space-y-2">
          <Label htmlFor="website" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Personal Website
          </Label>
          <Input
            id="website"
            type="url"
            value={website}
            onChange={(e) => handleWebsiteChange(e.target.value)}
            placeholder="https://yourwebsite.com"
          />
          <p className="text-xs text-muted-foreground">Your personal website or blog</p>
        </div>
      </CardContent>
    </Card>
  );
}
