'use client';

import { Check, Edit2, Eye, EyeOff, Mail, Phone, Plus, Star, X } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PhoneInput, formatStandardPhone, type PhoneValue } from '@/components/ui/phone-input';
import { Spinner } from '@/components/ui/spinner';
import {
  useContactManager,
  type ContactData,
  type EmailEntry,
  type PhoneEntry,
} from '@/lib/hooks/use-contact-manager';

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
      className={`rounded-xl border p-3.5 transition-colors ${
        isPrimary ? 'border-primary/30 bg-primary/5' : 'border-border bg-background'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isPrimary && <Star className="h-4 w-4 fill-primary text-primary" />}
          <div>
            <p className={`text-sm ${isPrimary ? 'font-medium' : ''}`}>{item.email}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <Badge variant={getSourceBadgeVariant(item.source)} className="text-xs">
                {item.source.toLowerCase()}
              </Badge>
              {item.verified ? (
                <Badge variant="outline" className="text-xs text-primary">
                  <Check className="mr-1 h-3 w-3" />
                  Verified
                </Badge>
              ) : item.clerkEmailId ? (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Pending Verification
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Not Added
                </Badge>
              )}
              {isPrimary && <span className="text-xs font-medium text-primary">Primary</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isLoading ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <>
              {/* For unverified Clerk emails: show verify button */}
              {item.clerkEmailId && !item.verified && !isVerifying && (
                <Button variant="outline" size="sm" onClick={onStartVerify} className="h-7 text-xs">
                  Enter Code
                </Button>
              )}

              {/* For imported emails not in Clerk: show add & verify button */}
              {!item.clerkEmailId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddAndVerify}
                  className="h-7 text-xs"
                >
                  Add & Verify
                </Button>
              )}

              {/* Make primary - only for verified emails */}
              {!isPrimary && item.verified && (
                <Button variant="ghost" size="sm" onClick={onMakePrimary} className="h-7 text-xs">
                  <Star className="mr-1 h-3 w-3" />
                  Make Primary
                </Button>
              )}

              {/* Delete - not for primary */}
              {!isPrimary && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDelete}
                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Verification code input */}
      {isVerifying && (
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          <Input
            type="text"
            placeholder="Enter 6-digit code"
            value={verificationCode}
            onChange={(e) => onVerificationCodeChange(e.target.value)}
            className="w-32"
            maxLength={6}
          />
          <Button size="sm" onClick={onVerifyCode} disabled={verificationCode.length < 6}>
            Verify
          </Button>
          <Button variant="ghost" size="sm" onClick={onResendCode}>
            Resend
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancelVerify}>
            <X className="h-4 w-4" />
          </Button>
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
      <div className="rounded-xl border border-primary p-3.5">
        <div className="space-y-2">
          <PhoneInput
            value={editingValue}
            onChange={onEditingValueChange}
            placeholder="Phone number"
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancelEdit} className="h-7 text-xs">
              <X className="mr-1 h-3 w-3" />
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={onSaveEdit} className="h-7 text-xs">
              <Check className="mr-1 h-3 w-3" />
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between rounded-xl border p-3.5 transition-colors ${
        isPrimary
          ? 'border-primary/30 bg-primary/5'
          : 'border-border bg-background hover:bg-muted/30'
      }`}
    >
      <div className="flex items-center gap-3">
        {isPrimary && <Star className="h-4 w-4 fill-primary text-primary" />}
        <div>
          <p className={`text-sm ${isPrimary ? 'font-medium' : ''}`}>{displayPhone}</p>
          <div className="mt-0.5 flex items-center gap-2">
            {!hasCountryCode && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                No country code
              </Badge>
            )}
            <Badge variant={getSourceBadgeVariant(item.source)} className="text-xs">
              {item.source.toLowerCase()}
            </Badge>
            {isPrimary && <span className="text-xs font-medium text-primary">Primary</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onStartEdit}
          className="h-7 text-xs"
          title="Edit phone number and country code"
        >
          <Edit2 className="mr-1 h-3 w-3" />
          Edit
        </Button>
        {!isPrimary && (
          <Button variant="ghost" size="sm" onClick={onMakePrimary} className="h-7 text-xs">
            <Star className="mr-1 h-3 w-3" />
            Make Primary
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-7 text-xs text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" />
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
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-section-title">Email addresses</span>
          {onEmailPublicChange && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onEmailPublicChange(!emailPublic);
              }}
              className={`ml-auto rounded-md p-1.5 transition-colors hover:bg-muted ${
                emailPublic ? 'text-foreground' : 'text-muted-foreground'
              }`}
              title={
                emailPublic ? 'Hide primary email from resume' : 'Show primary email on resume'
              }
            >
              {emailPublic ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          )}
        </div>
        <p className="mb-4 text-sm leading-6 text-muted-foreground">
          The primary email is used for login and shown on your profile. Emails must be verified
          before they can be set as primary.
        </p>

        {/* Error message */}
        {emailError && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <span className="flex-1">{emailError}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 shrink-0 px-1 text-destructive hover:text-destructive"
              onClick={clearEmailError}
            >
              <X className="h-3 w-3" />
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
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No email addresses yet. Add one below.
          </div>
        )}

        {/* Add Email Input */}
        {showEmailInput ? (
          <div className="mt-3 flex items-center gap-2">
            <Input
              type="email"
              placeholder="Enter email address"
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
              className="flex-1"
              autoFocus
              disabled={!!emailOperationLoading}
            />
            <Button
              size="sm"
              onClick={handleAddEmail}
              disabled={!newEmailInput.trim() || !!emailOperationLoading}
            >
              {emailOperationLoading ? <Spinner className="h-4 w-4" /> : 'Add & Verify'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowEmailInput(false);
                setNewEmailInput('');
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setShowEmailInput(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Email
          </Button>
        )}
      </div>

      {/* Phones Section */}
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span className="text-section-title">Contact phone</span>
          {onPhonePublicChange && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onPhonePublicChange(!phonePublic);
              }}
              className={`ml-auto rounded-md p-1.5 transition-colors hover:bg-muted ${
                phonePublic ? 'text-foreground' : 'text-muted-foreground'
              }`}
              title={
                phonePublic ? 'Hide primary phone from resume' : 'Show primary phone on resume'
              }
            >
              {phonePublic ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          )}
        </div>
        <p className="mb-4 text-sm leading-6 text-muted-foreground">
          Choose which phone number to display on your public profile.
        </p>

        {contactData.allPhones && contactData.allPhones.length > 0 ? (
          <div className="space-y-2">
            {contactData.allPhones.map((item, idx) => {
              const isPrimary = idx === (contactData.primaryPhoneIndex ?? 0);
              const isEditing = editingPhoneIndex === idx;
              const canDelete = !isPrimary && contactData.allPhones!.length > 1;

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
                  onDelete={() => deletePhone(idx)}
                  canDelete={canDelete}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No phone numbers yet. Add one below.
          </div>
        )}

        {/* Add Phone Input */}
        {showPhoneInput ? (
          <div className="mt-3 space-y-2">
            <PhoneInput
              value={newPhoneInput}
              onChange={setNewPhoneInput}
              placeholder="Phone number"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleAddPhone} disabled={!newPhoneInput.number.trim()}>
                Add
              </Button>
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
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setShowPhoneInput(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Phone
          </Button>
        )}
      </div>
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
