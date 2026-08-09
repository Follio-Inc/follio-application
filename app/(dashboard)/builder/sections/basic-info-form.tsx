'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Globe } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';

import { ContactSection } from '@/components/contact-section';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notifyProfileUpdated } from '@/lib/events';
import type { ContactData } from '@/lib/hooks/use-contact-manager';
import { cn } from '@/lib/utils';
import { ProfileBasicInfoSchema, type ProfileBasicInfo } from '@/lib/validations';

import type { FullProfile } from '@/types';

// ──────────────────────────────────────────────
// BasicInfoForm — Name + Headline
// Contact details and links are rendered by
// ContactDetailsSection below this form in the Header section.
// ──────────────────────────────────────────────

interface BasicInfoFormProps {
  profile: FullProfile;
  onUpdate: (data: Partial<FullProfile>) => void;
  /** @deprecated Contact/link updates now handled by ContactDetailsSection */
  onContactUpdate?: (data: Record<string, unknown>) => void;
  /** @deprecated Links now handled by ContactDetailsSection */
  onLinksUpdate?: (links: unknown[]) => void;
  /** When true, renders without Card wrapper for use inside accordion sections */
  embedded?: boolean;
}

export function BasicInfoForm({ profile, onUpdate, embedded }: BasicInfoFormProps) {
  const form = useForm<ProfileBasicInfo>({
    resolver: zodResolver(ProfileBasicInfoSchema),
    defaultValues: {
      firstName: profile.firstName || '',
      middleName: profile.middleName || '',
      lastName: profile.lastName || '',
      headline: profile.headline || '',
      location: profile.location || '',
      avatarUrl: profile.avatarUrl || '',
    },
  });

  const handleChange = (field: keyof ProfileBasicInfo, value: string) => {
    form.setValue(field, value);
    onUpdate({ [field]: value });
  };

  const formFields = (
    <div className={embedded ? 'space-y-4' : 'space-y-6'}>
      {/* Name */}
      <div className={cn('grid sm:grid-cols-3', embedded ? 'gap-3' : 'gap-4')}>
        <div className="space-y-1.5">
          <Label
            htmlFor="firstName"
            className={embedded ? 'text-xs text-muted-foreground' : undefined}
          >
            First Name *
          </Label>
          <Input
            id="firstName"
            value={form.watch('firstName')}
            onChange={(e) => handleChange('firstName', e.target.value)}
            placeholder="Alex"
            className={embedded ? 'h-9' : undefined}
          />
          {form.formState.errors.firstName && (
            <p className="text-sm text-destructive">{form.formState.errors.firstName.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="middleName"
            className={embedded ? 'text-xs text-muted-foreground' : undefined}
          >
            Middle Name
          </Label>
          <Input
            id="middleName"
            value={form.watch('middleName')}
            onChange={(e) => handleChange('middleName', e.target.value)}
            placeholder="Taylor"
            className={embedded ? 'h-9' : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="lastName"
            className={embedded ? 'text-xs text-muted-foreground' : undefined}
          >
            Last Name
          </Label>
          <Input
            id="lastName"
            value={form.watch('lastName')}
            onChange={(e) => handleChange('lastName', e.target.value)}
            placeholder="Chen"
            className={embedded ? 'h-9' : undefined}
          />
        </div>
      </div>

      {/* Headline */}
      <div className="space-y-1.5">
        <Label
          htmlFor="headline"
          className={embedded ? 'text-xs text-muted-foreground' : undefined}
        >
          Professional Headline
        </Label>
        <Input
          id="headline"
          value={form.watch('headline')}
          onChange={(e) => handleChange('headline', e.target.value)}
          placeholder="Senior Software Engineer at Google"
          className={embedded ? 'h-9' : undefined}
        />
        {!embedded && (
          <p className="text-xs text-muted-foreground">
            A short tagline that appears below your name
          </p>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <p className="text-eyebrow">Name &amp; Headline</p>
        {formFields}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>Your name and professional headline</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6 rounded-xl bg-muted/40 p-4">{formFields}</div>
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

  const handleVisibilityChange = async (field: 'emailPublic' | 'phonePublic', checked: boolean) => {
    const setter = field === 'emailPublic' ? setEmailPublic : setPhonePublic;
    const getter = field === 'emailPublic' ? emailPublic : phonePublic;
    const prev = getter;

    setter(checked);
    onContactUpdate({ [field]: checked });

    try {
      const res = await fetch('/api/profile/contact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: checked }),
      });
      if (!res.ok) throw new Error(`Failed to update ${field}`);
      notifyProfileUpdated();
    } catch {
      setter(prev);
      onContactUpdate({ [field]: prev });
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
      <CardContent>
        <div className="space-y-6 rounded-xl bg-muted/40 p-4">
          {/* Contact Section with full Clerk integration */}
          <ContactSection
            initialData={initialContactData}
            onChange={handleContactChange}
            showCard={false}
            title=""
            description=""
            emailPublic={emailPublic}
            phonePublic={phonePublic}
            onEmailPublicChange={(val) => handleVisibilityChange('emailPublic', val)}
            onPhonePublicChange={(val) => handleVisibilityChange('phonePublic', val)}
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
        </div>
      </CardContent>
    </Card>
  );
}
