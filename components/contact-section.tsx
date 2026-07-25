'use client';

import { Check, Eye, EyeOff, Mail, Pencil, Phone, Plus, Trash2, X } from 'lucide-react';
import { useUser } from '@clerk/nextjs';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PhoneInput, formatStandardPhone, type PhoneValue } from '@/components/ui/phone-input';
import { Spinner } from '@/components/ui/spinner';
import { formatContactSourceLabel } from '@/lib/contact/source-label';
import {
  useContactManager,
  type ContactData,
  type EmailEntry,
  type PhoneEntry,
} from '@/lib/hooks/use-contact-manager';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface ContactSectionProps {
  /**
   * Initial contact data (from profile, import, etc.)
   */
  initialData?: ContactData;
  /**
   * Called when contact data changes (for parent to save)
   */
  onChange?: (data: ContactData) => void;
  /**
   * Whether to show the card wrapper
   */
  showCard?: boolean;
  /**
   * Custom title for the section
   */
  title?: string;
  /**
   * Custom description for the section
   */
  description?: string;
  /**
   * Whether primary email is visible on resume (optional eye toggle)
   */
  emailPublic?: boolean;
  /**
   * Whether primary phone is visible on resume (optional eye toggle)
   */
  phonePublic?: boolean;
  /**
   * Callback when email visibility is toggled
   */
  onEmailPublicChange?: (value: boolean) => void;
  /**
   * Callback when phone visibility is toggled
   */
  onPhonePublicChange?: (value: boolean) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

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

// ============================================================================
// Email List Item Component
// ============================================================================

interface EmailListItemProps {
  item: EmailEntry;
  index: number;
  isPrimary: boolean;
  isLoading: boolean;
  isVerifying: boolean;
  verificationCode: string;
  sourceLabel: string;
  onVerificationCodeChange: (code: string) => void;
  onStartVerify: () => void;
  onCancelVerify: () => void;
  onVerifyCode: () => void;
  onResendCode: () => void;
  onAddAndVerify: () => void;
  onMakePrimary: () => void;
  onDelete: () => void;
}

function EmailListItem({
  item,
  isPrimary,
  isLoading,
  isVerifying,
  verificationCode,
  sourceLabel,
  onVerificationCodeChange,
  onStartVerify,
  onCancelVerify,
  onVerifyCode,
  onResendCode,
  onAddAndVerify,
  onMakePrimary,
  onDelete,
}: EmailListItemProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/70 bg-background p-3.5 transition-colors',
        isPrimary && 'border-primary/30 bg-primary/5'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
          <div className="min-w-0">
            <p className={cn('truncate text-sm', isPrimary ? 'font-medium' : 'font-normal')}>
              {item.email}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge
                variant={getSourceBadgeVariant(item.source)}
                className="h-5 px-1.5 text-[11px] font-medium"
              >
                {sourceLabel}
              </Badge>
              {item.verified ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                  <Check className="h-3 w-3" aria-hidden />
                  Verified
                </span>
              ) : item.clerkEmailId ? (
                <span className="text-[11px] font-medium text-muted-foreground">
                  Pending verification
                </span>
              ) : (
                <span className="text-[11px] font-medium text-muted-foreground">Not added</span>
              )}
              {isPrimary && <span className="text-[11px] font-medium text-primary">Primary</span>}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isLoading ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <>
              {item.clerkEmailId && !item.verified && !isVerifying && (
                <Button variant="outline" size="sm" onClick={onStartVerify} className="h-8">
                  Enter code
                </Button>
              )}

              {!item.clerkEmailId && (
                <Button variant="outline" size="sm" onClick={onAddAndVerify} className="h-8">
                  Add & verify
                </Button>
              )}

              {!isPrimary && item.verified && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMakePrimary}
                  className="h-8 text-muted-foreground"
                >
                  Make primary
                </Button>
              )}

              {!isPrimary && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDelete}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  title="Delete email"
                  aria-label="Delete email"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {isVerifying && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="6-digit code"
            value={verificationCode}
            onChange={(e) => onVerificationCodeChange(e.target.value)}
            className="sm:w-36"
            maxLength={6}
            aria-label="Verification code"
          />
          <div className="flex items-center gap-1">
            <Button size="sm" onClick={onVerifyCode} disabled={verificationCode.length < 6}>
              Verify
            </Button>
            <Button variant="ghost" size="sm" onClick={onResendCode}>
              Resend
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onCancelVerify}
              aria-label="Cancel verification"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Phone List Item Component
// ============================================================================

interface PhoneListItemProps {
  item: PhoneEntry;
  index: number;
  isPrimary: boolean;
  isEditing: boolean;
  editingValue: PhoneValue;
  onEditingValueChange: (value: PhoneValue) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onMakePrimary: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

function PhoneListItem({
  item,
  isPrimary,
  isEditing,
  editingValue,
  onEditingValueChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onMakePrimary,
  onDelete,
  canDelete,
}: PhoneListItemProps) {
  // Support both new and legacy format - show only numeric country code + formatted number
  const dialCode = item.countryCode
    ? item.countryCode.includes('::')
      ? item.countryCode.split('::')[0]
      : item.countryCode
    : null;
  const rawNumber = item.number || item.phone || '';
  const displayPhone =
    dialCode && rawNumber
      ? `${dialCode} ${formatStandardPhone(rawNumber, dialCode)}`
      : rawNumber
        ? formatStandardPhone(rawNumber, null)
        : '';
  const hasCountryCode = !!item.countryCode;

  if (isEditing) {
    return (
      <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-3.5">
        <PhoneInput
          value={editingValue}
          onChange={onEditingValueChange}
          placeholder="Phone number"
        />
        <div className="flex items-center justify-end gap-1 border-t border-border/60 pt-3">
          <Button variant="ghost" size="sm" onClick={onCancelEdit}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSaveEdit}>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-background p-3.5 transition-colors',
        isPrimary ? 'border-primary/30 bg-primary/5' : 'hover:bg-muted/30'
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
        <div className="min-w-0">
          <p className={cn('text-sm', isPrimary ? 'font-medium' : 'font-normal')}>{displayPhone}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {!hasCountryCode && (
              <span className="text-[11px] font-medium text-muted-foreground">No country code</span>
            )}
            <Badge
              variant={getSourceBadgeVariant(item.source)}
              className="h-5 px-1.5 text-[11px] font-medium"
            >
              {formatContactSourceLabel(item.source)}
            </Badge>
            {isPrimary && <span className="text-[11px] font-medium text-primary">Primary</span>}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onStartEdit}
          className="h-8 w-8 text-muted-foreground"
          title="Edit phone number"
          aria-label="Edit phone number"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {!isPrimary && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMakePrimary}
            className="h-8 text-muted-foreground"
          >
            Make primary
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            title="Delete phone"
            aria-label="Delete phone"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main ContactSection Component
// ============================================================================

export function ContactSection({
  initialData,
  onChange,
  showCard = true,
  title = 'Contact Information',
  description = 'Manage your email addresses and phone numbers. Emails must be verified before they can be set as primary.',
  emailPublic,
  phonePublic,
  onEmailPublicChange,
  onPhonePublicChange,
}: ContactSectionProps) {
  const { user } = useUser();

  // Use the contact manager hook
  const {
    contactData,
    emailOperationLoading,
    emailError,
    verifyingEmailId,
    verificationCode,
    addEmailToClerk,
    deleteEmailFromClerk,
    setPrimaryEmailClerk,
    verifyEmailCode,
    resendVerificationCode,
    setVerifyingEmailId,
    setVerificationCode,
    clearEmailError,
    addPhone,
    deletePhone,
    setPrimaryPhone,
    updatePhone,
  } = useContactManager({
    initialData,
    onChange,
  });

  // Local UI state
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [newPhoneInput, setNewPhoneInput] = useState<PhoneValue>({ countryCode: null, number: '' });
  const [editingPhoneIndex, setEditingPhoneIndex] = useState<number | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState<PhoneValue>({
    countryCode: null,
    number: '',
  });

  // Handlers
  const handleAddEmail = async () => {
    await addEmailToClerk(newEmailInput);
    setNewEmailInput('');
    setShowEmailInput(false);
  };

  const handleAddPhone = () => {
    addPhone(newPhoneInput);
    setNewPhoneInput({ countryCode: null, number: '' });
    setShowPhoneInput(false);
  };

  const handleStartEditPhone = (index: number) => {
    const phone = contactData.allPhones?.[index];
    if (phone) {
      setEditingPhoneIndex(index);
      setEditingPhoneValue({
        countryCode: phone.countryCode || null,
        number: phone.number || phone.phone || '',
      });
    }
  };

  const handleSaveEditPhone = () => {
    if (editingPhoneIndex !== null) {
      updatePhone(editingPhoneIndex, editingPhoneValue);
      setEditingPhoneIndex(null);
      setEditingPhoneValue({ countryCode: null, number: '' });
    }
  };

  const handleCancelEditPhone = () => {
    setEditingPhoneIndex(null);
    setEditingPhoneValue({ countryCode: null, number: '' });
  };

  const content = (
    <div className="space-y-10">
      {/* Emails Section */}
      <section>
        <div className="mb-1.5 flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-section-title">Email addresses</h3>
          {onEmailPublicChange && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onEmailPublicChange(!emailPublic);
              }}
              className={cn(
                'ml-auto rounded-md p-1.5 transition-colors hover:bg-muted',
                emailPublic ? 'text-foreground' : 'text-muted-foreground'
              )}
              title={
                emailPublic ? 'Hide primary email from resume' : 'Show primary email on resume'
              }
            >
              {emailPublic ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          )}
        </div>
        <p className="mb-4 text-sm leading-6 text-muted-foreground">
          Primary email is used for login and shown on your profile. Verify an address before
          setting it as primary.
        </p>

        {emailError && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <span className="flex-1">{emailError}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
              onClick={clearEmailError}
              aria-label="Dismiss error"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {contactData.allEmails && contactData.allEmails.length > 0 ? (
          <div className="space-y-2">
            {contactData.allEmails.map((item, idx) => {
              const isPrimary = idx === (contactData.primaryEmailIndex ?? 0);
              const isLoading =
                emailOperationLoading === item.email || emailOperationLoading === item.clerkEmailId;
              const isVerifying = verifyingEmailId === item.clerkEmailId;

              return (
                <EmailListItem
                  key={idx}
                  item={item}
                  index={idx}
                  isPrimary={isPrimary}
                  isLoading={isLoading}
                  isVerifying={isVerifying}
                  verificationCode={verificationCode}
                  sourceLabel={formatContactSourceLabel(item.source, {
                    email: item.email,
                    externalAccounts: user?.externalAccounts,
                  })}
                  onVerificationCodeChange={setVerificationCode}
                  onStartVerify={() => {
                    setVerifyingEmailId(item.clerkEmailId!);
                    setVerificationCode('');
                  }}
                  onCancelVerify={() => {
                    setVerifyingEmailId(null);
                    setVerificationCode('');
                  }}
                  onVerifyCode={() => {
                    verifyEmailCode(item.clerkEmailId!, verificationCode);
                    setVerifyingEmailId(null);
                    setVerificationCode('');
                  }}
                  onResendCode={() => resendVerificationCode(item.clerkEmailId!)}
                  onAddAndVerify={() => addEmailToClerk(item.email)}
                  onMakePrimary={() => setPrimaryEmailClerk(idx)}
                  onDelete={() => deleteEmailFromClerk(idx)}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 px-6 py-8 text-center text-sm text-muted-foreground">
            No email addresses yet. Add one below.
          </div>
        )}

        {showEmailInput ? (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border/70 bg-background p-3 sm:flex-row sm:items-center">
            <Input
              type="email"
              placeholder="name@example.com"
              value={newEmailInput}
              onChange={(e) => setNewEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddEmail();
                } else if (e.key === 'Escape') {
                  setShowEmailInput(false);
                  setNewEmailInput('');
                }
              }}
              className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
              autoFocus
              disabled={!!emailOperationLoading}
            />
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                onClick={handleAddEmail}
                disabled={!newEmailInput.trim() || !!emailOperationLoading}
              >
                {emailOperationLoading ? <Spinner className="h-4 w-4" /> : 'Add & verify'}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  setShowEmailInput(false);
                  setNewEmailInput('');
                }}
                aria-label="Cancel adding email"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setShowEmailInput(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add email
          </Button>
        )}
      </section>

      {/* Phones Section */}
      <section className="border-t border-border/60 pt-10">
        <div className="mb-1.5 flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-section-title">Phone numbers</h3>
          {onPhonePublicChange && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onPhonePublicChange(!phonePublic);
              }}
              className={cn(
                'ml-auto rounded-md p-1.5 transition-colors hover:bg-muted',
                phonePublic ? 'text-foreground' : 'text-muted-foreground'
              )}
              title={
                phonePublic ? 'Hide primary phone from resume' : 'Show primary phone on resume'
              }
            >
              {phonePublic ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          )}
        </div>
        <p className="mb-4 text-sm leading-6 text-muted-foreground">
          Choose which number appears as primary on your profile.
        </p>

        {contactData.allPhones && contactData.allPhones.length > 0 ? (
          <div className="mb-3 space-y-2">
            {contactData.allPhones.map((item, idx) => {
              const isPrimary = idx === (contactData.primaryPhoneIndex ?? 0);
              const isEditing = editingPhoneIndex === idx;

              return (
                <PhoneListItem
                  key={idx}
                  item={item}
                  index={idx}
                  isPrimary={isPrimary}
                  isEditing={isEditing}
                  editingValue={editingPhoneValue}
                  onEditingValueChange={setEditingPhoneValue}
                  onStartEdit={() => handleStartEditPhone(idx)}
                  onCancelEdit={handleCancelEditPhone}
                  onSaveEdit={handleSaveEditPhone}
                  onMakePrimary={() => setPrimaryPhone(idx)}
                  onDelete={() => {
                    deletePhone(idx);
                    if (editingPhoneIndex === idx) {
                      setEditingPhoneIndex(null);
                      setEditingPhoneValue({ countryCode: null, number: '' });
                    } else if (editingPhoneIndex !== null && editingPhoneIndex > idx) {
                      setEditingPhoneIndex(editingPhoneIndex - 1);
                    }
                  }}
                  canDelete
                />
              );
            })}
          </div>
        ) : (
          <div className="mb-3 rounded-xl border border-dashed border-border/60 bg-muted/30 px-6 py-8 text-center text-sm text-muted-foreground">
            No phone numbers yet. Add one below.
          </div>
        )}

        {showPhoneInput ? (
          <div className="space-y-3 rounded-xl border border-border/70 bg-background p-3.5">
            <PhoneInput
              value={newPhoneInput}
              onChange={setNewPhoneInput}
              placeholder="Phone number"
            />
            <div className="flex items-center justify-end gap-1 border-t border-border/60 pt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowPhoneInput(false);
                  setNewPhoneInput({ countryCode: null, number: '' });
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleAddPhone} disabled={!newPhoneInput.number.trim()}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowPhoneInput(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add phone
          </Button>
        )}
      </section>
    </div>
  );

  if (showCard) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{content}</CardContent>
      </Card>
    );
  }

  return content;
}
