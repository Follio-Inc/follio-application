'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import { Check, Loader2, LogOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ContactSection } from '@/components/contact-section';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ContactData } from '@/lib/hooks/use-contact-manager';
import type { ContactInfo, Profile } from '@prisma/client';

const NAME_SAVE_DEBOUNCE_MS = 700;
const CONTACT_SAVE_DEBOUNCE_MS = 800;

export interface AccountContactUpdatePayload {
  email?: string;
  phone?: string;
  phoneCountryCode?: string | null;
  phoneNumber?: string;
  additionalEmails?: Array<{ email: string; source: string }>;
  additionalPhones?: Array<{ countryCode: string | null; number: string; source: string }>;
}

interface AccountSectionProps {
  profile: Profile & { contactInfo: ContactInfo | null };
  onProfileUpdateAction: (updates: Partial<Profile>) => void;
  onContactUpdateAction: (updates: AccountContactUpdatePayload) => void;
}

function buildInitialContactData(
  profile: Profile & { contactInfo: ContactInfo | null }
): ContactData {
  const contactInfo = profile.contactInfo as Record<string, unknown> | null;

  const allEmails: ContactData['allEmails'] = (() => {
    const emails: Array<{
      email: string;
      source: string;
      clerkEmailId?: string;
      verified: boolean;
    }> = [];

    if (contactInfo?.email) {
      emails.push({
        email: contactInfo.email as string,
        source: (contactInfo.emailSource as string) || 'MANUAL',
        verified: true,
      });
    }

    try {
      const raw = contactInfo?.additionalEmails;
      const additional = Array.isArray(raw)
        ? (raw as Array<{ email: string; source: string }>)
        : typeof raw === 'string'
          ? (JSON.parse(raw) as Array<{ email: string; source: string }>)
          : [];

      for (const emailEntry of additional) {
        emails.push({ email: emailEntry.email, source: emailEntry.source, verified: false });
      }
    } catch {
      // Ignore malformed persisted JSON
    }

    return emails;
  })();

  const allPhones: ContactData['allPhones'] = (() => {
    const phones: Array<{
      phone?: string;
      countryCode?: string | null;
      number?: string;
      source: string;
    }> = [];

    if (contactInfo?.phoneNumber || contactInfo?.phone) {
      phones.push({
        countryCode: (contactInfo.phoneCountryCode as string | null) ?? null,
        number: (contactInfo.phoneNumber as string) || '',
        phone: (contactInfo.phone as string) || '',
        source: (contactInfo.phoneSource as string) || 'MANUAL',
      });
    }

    try {
      const raw = contactInfo?.additionalPhones;
      const additional = Array.isArray(raw)
        ? (raw as Array<Record<string, unknown>>)
        : typeof raw === 'string'
          ? (JSON.parse(raw) as Array<Record<string, unknown>>)
          : [];

      for (const phoneEntry of additional) {
        phones.push({
          countryCode: (phoneEntry.countryCode as string | null) ?? null,
          number: (phoneEntry.number as string) || '',
          phone: (phoneEntry.phone as string) || '',
          source: (phoneEntry.source as string) || 'MANUAL',
        });
      }
    } catch {
      // Ignore malformed persisted JSON
    }

    return phones;
  })();

  return {
    email: (contactInfo?.email as string) ?? undefined,
    phone: (contactInfo?.phone as string) ?? undefined,
    allEmails,
    allPhones,
    primaryEmailIndex: 0,
    primaryPhoneIndex: 0,
  };
}

export function AccountSection({
  profile,
  onProfileUpdateAction,
  onContactUpdateAction,
}: AccountSectionProps) {
  const { user } = useUser();
  const { signOut } = useClerk();

  const [firstName, setFirstName] = useState(profile.firstName || '');
  const [lastName, setLastName] = useState(profile.lastName || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);

  const nameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contactTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    [firstName, lastName].filter(Boolean).join(' ');
  const email = user?.emailAddresses[0]?.emailAddress || '';
  const avatarUrl = user?.imageUrl || profile.avatarUrl || '';
  const initials = [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';

  const initialContactData = useMemo(() => buildInitialContactData(profile), [profile]);

  const saveNameFields = useCallback(
    async (data: { firstName: string; lastName: string }) => {
      setNameSaving(true);
      try {
        const response = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (response.ok) {
          onProfileUpdateAction(data);
          setNameSaved(true);
          setTimeout(() => setNameSaved(false), 1800);
        }
      } finally {
        setNameSaving(false);
      }
    },
    [onProfileUpdateAction]
  );

  const scheduleNameSave = useCallback(
    (data: { firstName: string; lastName: string }) => {
      if (nameTimeoutRef.current) {
        clearTimeout(nameTimeoutRef.current);
      }

      nameTimeoutRef.current = setTimeout(() => {
        void saveNameFields(data);
      }, NAME_SAVE_DEBOUNCE_MS);
    },
    [saveNameFields]
  );

  const saveContactFields = useCallback(async (data: AccountContactUpdatePayload) => {
    setContactSaving(true);
    try {
      await fetch('/api/profile/contact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } finally {
      setContactSaving(false);
    }
  }, []);

  const scheduleContactSave = useCallback(
    (data: AccountContactUpdatePayload) => {
      if (contactTimeoutRef.current) {
        clearTimeout(contactTimeoutRef.current);
      }

      contactTimeoutRef.current = setTimeout(() => {
        void saveContactFields(data);
      }, CONTACT_SAVE_DEBOUNCE_MS);
    },
    [saveContactFields]
  );

  const handleFirstNameChange = (value: string) => {
    setFirstName(value);
    scheduleNameSave({ firstName: value, lastName });
  };

  const handleLastNameChange = (value: string) => {
    setLastName(value);
    scheduleNameSave({ firstName, lastName: value });
  };

  const handleContactChange = useCallback(
    (data: ContactData) => {
      const allEmails = data.allEmails || [];
      const allPhones = data.allPhones || [];
      const primaryEmailIndex = data.primaryEmailIndex ?? 0;
      const primaryPhoneIndex = data.primaryPhoneIndex ?? 0;

      const primaryEmail = allEmails[primaryEmailIndex]?.email;
      const primaryPhone = allPhones[primaryPhoneIndex];

      const payload: AccountContactUpdatePayload = {
        email: primaryEmail,
        phone: primaryPhone?.phone || '',
        phoneCountryCode: primaryPhone?.countryCode || null,
        phoneNumber: primaryPhone?.number || '',
        additionalEmails: allEmails
          .filter((_, index) => index !== primaryEmailIndex)
          .map((item) => ({ email: item.email, source: item.source })),
        additionalPhones: allPhones
          .filter((_, index) => index !== primaryPhoneIndex)
          .map((item) => ({
            countryCode: item.countryCode || null,
            number: item.number || '',
            source: item.source,
          })),
      };

      onContactUpdateAction(payload);
      scheduleContactSave(payload);
    },
    [onContactUpdateAction, scheduleContactSave]
  );

  useEffect(() => {
    return () => {
      if (nameTimeoutRef.current) {
        clearTimeout(nameTimeoutRef.current);
      }
      if (contactTimeoutRef.current) {
        clearTimeout(contactTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Manage your identity and account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-border">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{displayName || 'Your Name'}</p>
              <p className="truncate text-sm text-muted-foreground">{email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Photo is managed by your sign-in provider
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="settings-first-name">First name</Label>
              <Input
                id="settings-first-name"
                value={firstName}
                onChange={(event) => handleFirstNameChange(event.target.value)}
                placeholder="Alex"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-last-name">Last name</Label>
              <Input
                id="settings-last-name"
                value={lastName}
                onChange={(event) => handleLastNameChange(event.target.value)}
                placeholder="Chen"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {nameSaving && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving account details...
              </span>
            )}
            {!nameSaving && nameSaved && (
              <span className="inline-flex items-center gap-1 text-green-600">
                <Check className="h-3 w-3" /> Account details saved
              </span>
            )}
            {!nameSaving && !nameSaved && 'Name updates save automatically'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email & Phone</CardTitle>
          <CardDescription>
            Manage your login and contact methods. Primary email is used for sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContactSection
            initialData={initialContactData}
            onChange={handleContactChange}
            showCard={false}
            title=""
            description=""
          />
          <p className="mt-4 text-xs text-muted-foreground">
            {contactSaving ? 'Saving contact changes...' : 'Contact changes sync automatically'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>Securely end your current session</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void signOut({ redirectUrl: '/' })}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
