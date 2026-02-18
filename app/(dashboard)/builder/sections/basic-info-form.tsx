'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Globe } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';

import { ContactSection } from '@/components/contact-section';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { notifyProfileUpdated } from '@/lib/events';
import type { ContactData } from '@/lib/hooks/use-contact-manager';
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
    phoneCountryCode?: string | null;
    phoneNumber?: string;
    phonePublic?: boolean;
    website?: string;
    additionalEmails?: Array<{ email: string; source: string }>;
    additionalPhones?: Array<{ countryCode: string | null; number: string; source: string }>;
  }) => void;
}

/**
 * ContactInfoForm - Uses the shared ContactSection component for full email/phone management
 * including Clerk email verification, add/delete, and set primary functionality.
 */
export function ContactInfoForm({ profile, onContactUpdate }: ContactInfoFormProps) {
  const [emailPublic, setEmailPublic] = useState(profile.contactInfo?.emailPublic || false);
  const [phonePublic, setPhonePublic] = useState(profile.contactInfo?.phonePublic || false);
  const [website, setWebsite] = useState(profile.contactInfo?.website || '');

  // Build initial contact data from profile for ContactSection
  const initialContactData: ContactData = {
    email: profile.contactInfo?.email ?? undefined,
    phone: profile.contactInfo?.phone ?? undefined,
    allEmails: (() => {
      // Build email list: primary email first (with verified status from Clerk),
      // then additional emails
      const emails: Array<{
        email: string;
        source: string;
        clerkEmailId?: string;
        verified: boolean;
      }> = [];

      // Add primary email if exists
      if (profile.contactInfo?.email) {
        emails.push({
          email: profile.contactInfo.email,
          source:
            ((profile.contactInfo as Record<string, unknown>)?.emailSource as string) || 'MANUAL',
          verified: true, // Primary email is always verified
        });
      }

      // Add additional emails
      try {
        const raw = profile.contactInfo?.additionalEmails;
        const additionalEmails = Array.isArray(raw)
          ? (raw as Array<{ email: string; source: string }>)
          : typeof raw === 'string'
            ? (JSON.parse(raw) as Array<{ email: string; source: string }>)
            : [];

        for (const e of additionalEmails) {
          emails.push({
            email: e.email,
            source: e.source,
            verified: false, // Additional emails need verification
          });
        }
      } catch {
        // Ignore parse errors
      }

      return emails;
    })(),
    allPhones: (() => {
      const phones: Array<{
        phone?: string;
        countryCode?: string | null;
        number?: string;
        source: string;
      }> = [];

      const contactInfo = profile.contactInfo as Record<string, unknown> | null;

      // Add primary phone if exists
      if (contactInfo?.phoneNumber || contactInfo?.phone) {
        phones.push({
          countryCode: (contactInfo?.phoneCountryCode as string | null) ?? null,
          number: (contactInfo?.phoneNumber as string) || '',
          phone: (contactInfo?.phone as string) || '',
          source: (contactInfo?.phoneSource as string) || 'MANUAL',
        });
      }

      // Add additional phones
      try {
        const raw = contactInfo?.additionalPhones;
        const additionalPhones = Array.isArray(raw)
          ? (raw as Array<Record<string, unknown>>)
          : typeof raw === 'string'
            ? (JSON.parse(raw) as Array<Record<string, unknown>>)
            : [];

        for (const p of additionalPhones) {
          phones.push({
            countryCode: (p.countryCode as string | null) ?? null,
            number: (p.number as string) || '',
            phone: (p.phone as string) || '',
            source: (p.source as string) || 'MANUAL',
          });
        }
      } catch {
        // Ignore parse errors
      }

      return phones;
    })(),
    primaryEmailIndex: 0,
    primaryPhoneIndex: 0,
  };

  // Handle contact data changes from ContactSection and transform to builder format
  const handleContactChange = useCallback(
    (data: ContactData) => {
      const allEmails = data.allEmails || [];
      const allPhones = data.allPhones || [];
      const primaryEmailIdx = data.primaryEmailIndex ?? 0;
      const primaryPhoneIdx = data.primaryPhoneIndex ?? 0;

      // Get primary email
      const primaryEmail = allEmails[primaryEmailIdx]?.email;

      // Get additional emails (all except primary)
      const additionalEmails = allEmails
        .filter((_, idx) => idx !== primaryEmailIdx)
        .map((e) => ({ email: e.email, source: e.source }));

      // Get primary phone
      const primaryPhone = allPhones[primaryPhoneIdx];

      // Get additional phones (all except primary)
      const additionalPhones = allPhones
        .filter((_, idx) => idx !== primaryPhoneIdx)
        .map((p) => ({
          countryCode: p.countryCode || null,
          number: p.number || '',
          source: p.source,
        }));

      onContactUpdate({
        email: primaryEmail,
        phone: primaryPhone?.phone || '',
        phoneCountryCode: primaryPhone?.countryCode || null,
        phoneNumber: primaryPhone?.number || '',
        additionalEmails,
        additionalPhones,
      });
    },
    [onContactUpdate]
  );

  const handleEmailPublicChange = async (checked: boolean) => {
    console.log(
      '[EmailToggle] handleEmailPublicChange called with:',
      checked,
      'prev:',
      emailPublic
    );
    // Optimistic update: update local UI + sync to parent state
    const prev = emailPublic;
    setEmailPublic(checked);
    // Keep parent's contactInfo state in sync so that if the user saves
    // other contact changes (Save button), emailPublic isn't overwritten
    onContactUpdate({ emailPublic: checked });

    try {
      const res = await fetch('/api/profile/contact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailPublic: checked }),
      });
      console.log('[EmailToggle] API response status:', res.status);
      if (!res.ok) throw new Error('Failed to update email visibility');
      notifyProfileUpdated();
    } catch (err) {
      console.error('[EmailToggle] Failed to update email visibility:', err);
      setEmailPublic(prev);
      onContactUpdate({ emailPublic: prev });
    }
  };

  const handlePhonePublicChange = async (checked: boolean) => {
    console.log(
      '[PhoneToggle] handlePhonePublicChange called with:',
      checked,
      'prev:',
      phonePublic
    );
    const prev = phonePublic;
    setPhonePublic(checked);
    onContactUpdate({ phonePublic: checked });

    try {
      const res = await fetch('/api/profile/contact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phonePublic: checked }),
      });
      console.log('[PhoneToggle] API response status:', res.status);
      if (!res.ok) {
        const errBody = await res.text();
        console.error('[PhoneToggle] API error body:', errBody);
        throw new Error('Failed to update phone visibility');
      }
      console.log('[PhoneToggle] Success, dispatching profile-updated event');
      notifyProfileUpdated();
    } catch (err) {
      console.error('[PhoneToggle] Failed to update phone visibility:', err);
      setPhonePublic(prev);
      onContactUpdate({ phonePublic: prev });
    }
  };

  const handleWebsiteChange = (value: string) => {
    setWebsite(value);
    onContactUpdate({ website: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact Information</CardTitle>
        <CardDescription>Manage your email addresses and phone numbers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Contact Section with full Clerk integration */}
        <ContactSection
          initialData={initialContactData}
          onChange={handleContactChange}
          showCard={false}
          title=""
          description=""
          emailPublic={emailPublic}
          phonePublic={phonePublic}
          onEmailPublicChange={handleEmailPublicChange}
          onPhonePublicChange={handlePhonePublicChange}
        />

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
