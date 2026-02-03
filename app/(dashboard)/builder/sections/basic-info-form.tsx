'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Globe, Mail, Phone, Star, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
    additionalEmails?: Array<{ email: string; source: string }>;
    additionalPhones?: Array<{ phone: string; source: string }>;
  }) => void;
}

// Helper type for additional emails
interface AdditionalEmail {
  email: string;
  source: string;
}

// Helper type for additional phones
interface AdditionalPhone {
  phone: string;
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
    case 'SIGNUP':
      return 'default';
    default:
      return 'outline';
  }
}

export function ContactInfoForm({ profile, onContactUpdate }: ContactInfoFormProps) {
  const [primaryEmail, setPrimaryEmail] = useState(profile.contactInfo?.email || '');
  const [emailPublic, setEmailPublic] = useState(profile.contactInfo?.emailPublic || false);
  const [primaryPhone, setPrimaryPhone] = useState(profile.contactInfo?.phone || '');
  const [phonePublic, setPhonePublic] = useState(profile.contactInfo?.phonePublic || false);
  const [website, setWebsite] = useState(profile.contactInfo?.website || '');

  // Parse additional emails from contactInfo
  const [additionalEmails, setAdditionalEmails] = useState<AdditionalEmail[]>(() => {
    try {
      const raw = profile.contactInfo?.additionalEmails;
      if (Array.isArray(raw)) return raw as unknown as AdditionalEmail[];
      if (typeof raw === 'string') return JSON.parse(raw) as AdditionalEmail[];
      return [];
    } catch {
      return [];
    }
  });

  // Parse additional phones from contactInfo
  const [additionalPhones, setAdditionalPhones] = useState<AdditionalPhone[]>(() => {
    try {
      const raw = (profile.contactInfo as Record<string, unknown>)?.additionalPhones;
      if (Array.isArray(raw)) return raw as unknown as AdditionalPhone[];
      if (typeof raw === 'string') return JSON.parse(raw) as AdditionalPhone[];
      return [];
    } catch {
      return [];
    }
  });

  // Build combined email list: primary email first, then additional emails
  const allEmails: Array<{ email: string; source: string; isPrimary: boolean }> = [
    ...(primaryEmail
      ? [
          {
            email: primaryEmail,
            source: profile.contactInfo?.emailSource || 'MANUAL',
            isPrimary: true,
          },
        ]
      : []),
    ...additionalEmails.map((e) => ({ ...e, isPrimary: false })),
  ];

  // Build combined phone list: primary phone first, then additional phones
  const allPhones: Array<{ phone: string; source: string; isPrimary: boolean }> = [
    ...(primaryPhone
      ? [
          {
            phone: primaryPhone,
            source:
              ((profile.contactInfo as Record<string, unknown>)?.phoneSource as string) || 'MANUAL',
            isPrimary: true,
          },
        ]
      : []),
    ...additionalPhones.map((p) => ({ ...p, isPrimary: false })),
  ];

  const handleMakePrimary = (emailToMakePrimary: string, _source: string) => {
    // Current primary becomes additional (if it exists)
    const newAdditionalEmails = additionalEmails.filter((e) => e.email !== emailToMakePrimary);
    if (primaryEmail) {
      newAdditionalEmails.unshift({
        email: primaryEmail,
        source: profile.contactInfo?.emailSource || 'MANUAL',
      });
    }

    setPrimaryEmail(emailToMakePrimary);
    setAdditionalEmails(newAdditionalEmails);

    onContactUpdate({
      email: emailToMakePrimary,
      additionalEmails: newAdditionalEmails,
    });
  };

  const handleDeleteEmail = (emailToDelete: string) => {
    const newAdditionalEmails = additionalEmails.filter((e) => e.email !== emailToDelete);
    setAdditionalEmails(newAdditionalEmails);
    onContactUpdate({ additionalEmails: newAdditionalEmails });
  };

  const handleEmailPublicChange = (checked: boolean) => {
    setEmailPublic(checked);
    onContactUpdate({ emailPublic: checked });
  };

  const handleMakePhonePrimary = (phoneToMakePrimary: string, _source: string) => {
    // Current primary becomes additional (if it exists)
    const newAdditionalPhones = additionalPhones.filter((p) => p.phone !== phoneToMakePrimary);
    if (primaryPhone) {
      newAdditionalPhones.unshift({
        phone: primaryPhone,
        source:
          ((profile.contactInfo as Record<string, unknown>)?.phoneSource as string) || 'MANUAL',
      });
    }

    setPrimaryPhone(phoneToMakePrimary);
    setAdditionalPhones(newAdditionalPhones);

    onContactUpdate({
      phone: phoneToMakePrimary,
      additionalPhones: newAdditionalPhones,
    });
  };

  const handleDeletePhone = (phoneToDelete: string) => {
    const newAdditionalPhones = additionalPhones.filter((p) => p.phone !== phoneToDelete);
    setAdditionalPhones(newAdditionalPhones);
    onContactUpdate({ additionalPhones: newAdditionalPhones });
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
        {/* Email Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Addresses
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleEmailPublicChange(!emailPublic)}
              className="h-8 gap-2"
              title={
                emailPublic
                  ? 'Primary email visible on profile'
                  : 'Primary email hidden from profile'
              }
            >
              {emailPublic ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              <span className="text-xs">{emailPublic ? 'Visible' : 'Hidden'}</span>
            </Button>
          </div>

          {allEmails.length > 0 ? (
            <div className="space-y-2">
              {allEmails.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                    item.isPrimary
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border bg-background hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.isPrimary && <Star className="h-4 w-4 fill-primary text-primary" />}
                    <div>
                      <p className={`text-sm ${item.isPrimary ? 'font-medium' : ''}`}>
                        {item.email}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <Badge variant={getSourceBadgeVariant(item.source)} className="text-xs">
                          {item.source.toLowerCase()}
                        </Badge>
                        {item.isPrimary && (
                          <span className="text-xs font-medium text-primary">Primary</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!item.isPrimary && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMakePrimary(item.email, item.source)}
                          className="h-7 text-xs"
                        >
                          <Star className="mr-1 h-3 w-3" />
                          Make Primary
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteEmail(item.email)}
                          className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No email addresses found.
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {emailPublic
              ? 'Your primary email will be visible on your public profile'
              : 'Your primary email is hidden from your public profile'}
          </p>
        </div>

        {/* Phone Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Phone Numbers
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePhonePublicChange(!phonePublic)}
              className="h-8 gap-2"
              title={
                phonePublic
                  ? 'Primary phone visible on profile'
                  : 'Primary phone hidden from profile'
              }
            >
              {phonePublic ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              <span className="text-xs">{phonePublic ? 'Visible' : 'Hidden'}</span>
            </Button>
          </div>

          {allPhones.length > 0 ? (
            <div className="space-y-2">
              {allPhones.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                    item.isPrimary
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border bg-background hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.isPrimary && <Star className="h-4 w-4 fill-primary text-primary" />}
                    <div>
                      <p className={`text-sm ${item.isPrimary ? 'font-medium' : ''}`}>
                        {item.phone}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <Badge variant={getSourceBadgeVariant(item.source)} className="text-xs">
                          {item.source.toLowerCase()}
                        </Badge>
                        {item.isPrimary && (
                          <span className="text-xs font-medium text-primary">Primary</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!item.isPrimary && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMakePhonePrimary(item.phone, item.source)}
                          className="h-7 text-xs"
                        >
                          <Star className="mr-1 h-3 w-3" />
                          Make Primary
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePhone(item.phone)}
                          className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No phone numbers found.
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {phonePublic
              ? 'Your primary phone will be visible on your public profile'
              : 'Your primary phone is hidden from your public profile'}
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
