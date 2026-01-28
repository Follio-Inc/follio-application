'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Globe, Mail, Phone } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

export function ContactInfoForm({ profile, onContactUpdate }: ContactInfoFormProps) {
  const [email, setEmail] = useState(profile.contactInfo?.email || '');
  const [emailPublic, setEmailPublic] = useState(profile.contactInfo?.emailPublic || false);
  const [phone, setPhone] = useState(profile.contactInfo?.phone || '');
  const [phonePublic, setPhonePublic] = useState(profile.contactInfo?.phonePublic || false);
  const [website, setWebsite] = useState(profile.contactInfo?.website || '');

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
            Email Address
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
