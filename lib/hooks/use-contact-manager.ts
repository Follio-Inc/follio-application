'use client';

import { formatPhoneValue, type PhoneValue } from '@/components/ui/phone-input';
import { useReverification, useUser } from '@clerk/nextjs';
import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface EmailEntry {
  email: string;
  source: string;
  clerkEmailId?: string;
  verified: boolean;
}

export interface PhoneEntry {
  phone?: string; // Legacy: full phone string
  countryCode?: string | null | undefined;
  number?: string;
  source: string;
}

export interface ContactData {
  email?: string;
  phone?: string;
  allEmails?: EmailEntry[];
  allPhones?: PhoneEntry[];
  primaryEmailIndex?: number;
  primaryPhoneIndex?: number;
}

export interface UseContactManagerOptions {
  /**
   * Initial contact data (from imported resume, existing profile, etc.)
   */
  initialData?: ContactData;
  /**
   * Callback when contact data changes
   */
  onChange?: (data: ContactData) => void;
}

export interface UseContactManagerReturn {
  // State
  contactData: ContactData;
  isLoading: boolean;
  emailOperationLoading: string | null;
  emailError: string | null;
  verifyingEmailId: string | null;
  verificationCode: string;

  // Email operations
  addEmailToClerk: (email: string) => Promise<void>;
  deleteEmailFromClerk: (index: number) => Promise<void>;
  setPrimaryEmailClerk: (index: number) => Promise<void>;
  verifyEmailCode: (clerkEmailId: string, code: string) => Promise<void>;
  resendVerificationCode: (clerkEmailId: string) => Promise<void>;
  setVerifyingEmailId: (id: string | null) => void;
  setVerificationCode: (code: string) => void;
  clearEmailError: () => void;

  // Phone operations
  addPhone: (phoneValue: PhoneValue) => void;
  deletePhone: (index: number) => void;
  setPrimaryPhone: (index: number) => void;
  updatePhone: (index: number, phoneValue: PhoneValue) => void;

  // Utility
  setContactData: React.Dispatch<React.SetStateAction<ContactData>>;
  refreshFromClerk: () => Promise<void>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build emails list combining Clerk emails (verified) and imported emails (unverified).
 * Clerk emails are the source of truth for verified emails.
 */
export function buildEmailsList(
  clerkEmails: Array<{
    id: string;
    email: string;
    verified: boolean;
    isPrimary: boolean;
  }>,
  importedEmails: Array<{ email: string; source: string }>
): EmailEntry[] {
  const result: EmailEntry[] = [];
  const seen = new Set<string>();

  // Add Clerk emails first (these are verified or pending verification)
  for (const clerkEmail of clerkEmails) {
    result.push({
      email: clerkEmail.email,
      source: clerkEmail.isPrimary ? 'SIGNUP' : 'MANUAL',
      clerkEmailId: clerkEmail.id,
      verified: clerkEmail.verified,
    });
    seen.add(clerkEmail.email.toLowerCase());
  }

  // Add imported emails that aren't already in Clerk (these will need to be added/verified)
  for (const entry of importedEmails) {
    const normalized = entry.email.toLowerCase().trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push({
        email: entry.email,
        source: entry.source,
        clerkEmailId: undefined,
        verified: false,
      });
    }
  }

  return result;
}

/**
 * Remove an email by identity (Clerk id and/or address), not by list index.
 * Index-based removal is unsafe after async Clerk destroy/reload, because a sync
 * effect may rebuild `allEmails` before local state is updated — filtering by the
 * stale index can delete a different email (e.g. the verified primary).
 */
export function removeEmailFromList<T extends { email: string; clerkEmailId?: string }>(
  emails: T[],
  primaryEmailIndex: number,
  target: { email: string; clerkEmailId?: string }
): { emails: T[]; primaryEmailIndex: number; email: string | undefined } {
  const targetId = target.clerkEmailId;
  const targetEmail = target.email.toLowerCase();
  const primaryEmail = emails[primaryEmailIndex]?.email?.toLowerCase();

  const nextEmails = emails.filter((entry) => {
    if (targetId && entry.clerkEmailId === targetId) return false;
    if (entry.email.toLowerCase() === targetEmail) return false;
    return true;
  });

  let nextPrimaryIndex = primaryEmail
    ? nextEmails.findIndex((entry) => entry.email.toLowerCase() === primaryEmail)
    : 0;
  if (nextPrimaryIndex < 0) nextPrimaryIndex = 0;

  return {
    emails: nextEmails,
    primaryEmailIndex: nextPrimaryIndex,
    email: nextEmails[nextPrimaryIndex]?.email,
  };
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useContactManager(options: UseContactManagerOptions = {}): UseContactManagerReturn {
  const { initialData, onChange } = options;
  const { user } = useUser();

  // Stable refs to avoid infinite re-render loops
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const contactDataRef = useRef<ContactData | null>(null);

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [contactData, setContactData] = useState<ContactData>(() => ({
    email: initialData?.email,
    phone: initialData?.phone,
    allEmails: initialData?.allEmails || [],
    allPhones: initialData?.allPhones || [],
    primaryEmailIndex: initialData?.primaryEmailIndex ?? 0,
    primaryPhoneIndex: initialData?.primaryPhoneIndex ?? 0,
  }));

  // Keep ref in sync with state
  contactDataRef.current = contactData;

  const [isLoading, setIsLoading] = useState(false);
  const [emailOperationLoading, setEmailOperationLoading] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [verifyingEmailId, setVerifyingEmailId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  // -------------------------------------------------------------------------
  // Clerk Reverification Wrappers
  // -------------------------------------------------------------------------

  // Wrap Clerk email operations with reverification to handle step-up auth automatically
  // This will show a modal asking user to re-enter password if needed
  const createEmailWithReverification = useReverification(async (email: string) => {
    if (!user) throw new Error('User not found');
    const newEmail = await user.createEmailAddress({ email });
    await newEmail.prepareVerification({ strategy: 'email_code' });
    return newEmail;
  });

  // Wrap setting primary email with reverification
  const setPrimaryEmailWithReverification = useReverification(async (emailId: string) => {
    if (!user) throw new Error('User not found');
    await user.update({ primaryEmailAddressId: emailId });
    return true;
  });

  // -------------------------------------------------------------------------
  // Sync with Clerk on mount and user change
  // -------------------------------------------------------------------------

  const refreshFromClerk = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Get Clerk emails with verification status
      const clerkEmails = user.emailAddresses.map((emailAddr) => ({
        id: emailAddr.id,
        email: emailAddr.emailAddress,
        verified: emailAddr.verification?.status === 'verified',
        isPrimary: emailAddr.id === user.primaryEmailAddressId,
      }));

      // Get imported emails from current data (excluding any that match Clerk emails)
      // Use ref to avoid dependency cycle
      const currentEmails: EmailEntry[] = contactDataRef.current?.allEmails || [];
      const importedEmails = currentEmails.filter(
        (e: EmailEntry) =>
          !e.clerkEmailId &&
          !clerkEmails.some((c) => c.email.toLowerCase() === e.email.toLowerCase())
      );

      // Build combined list
      const combinedEmails = buildEmailsList(clerkEmails, importedEmails);

      // Find the primary email index (the one that matches Clerk's primary)
      const primaryClerkEmail = clerkEmails.find((e) => e.isPrimary);
      const primaryIndex = primaryClerkEmail
        ? combinedEmails.findIndex(
            (e) => e.email.toLowerCase() === primaryClerkEmail.email.toLowerCase()
          )
        : 0;

      setContactData((prev) => ({
        ...prev,
        allEmails: combinedEmails,
        primaryEmailIndex: primaryIndex >= 0 ? primaryIndex : 0,
        email: combinedEmails[primaryIndex >= 0 ? primaryIndex : 0]?.email,
      }));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Initial sync with Clerk
  useEffect(() => {
    if (user) {
      refreshFromClerk();
    }
    // Only run on mount and when user changes, not when contactData changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Notify parent of changes (uses ref to avoid infinite loop)
  useEffect(() => {
    onChangeRef.current?.(contactData);
  }, [contactData]);

  // -------------------------------------------------------------------------
  // Email Operations
  // -------------------------------------------------------------------------

  /**
   * Add email to Clerk (triggers verification)
   * Uses reverification wrapper which will show password prompt if needed
   */
  const addEmailToClerk = useCallback(
    async (email: string) => {
      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedEmail || !user) return;

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setEmailError('Please enter a valid email address');
        return;
      }

      // Check for duplicates
      const allEmails = contactData.allEmails || [];
      const isDuplicate = allEmails.some((e) => e.email.toLowerCase() === trimmedEmail);
      if (isDuplicate) {
        setEmailError('This email is already in your list');
        return;
      }

      setEmailOperationLoading(trimmedEmail);
      setEmailError(null);

      try {
        // Use reverification-wrapped function - this will show password modal if needed
        await createEmailWithReverification(trimmedEmail);

        // Reload user to get updated state
        await user.reload();

        // Refresh our state from Clerk
        await refreshFromClerk();

        setEmailError('Verification email sent! Check your inbox and enter the code.');
      } catch (err) {
        console.error('Failed to add email:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to add email';
        // Handle cancellation (user closed the reverification modal)
        if (errorMessage.includes('cancelled') || errorMessage.includes('canceled')) {
          setEmailError(null); // User cancelled, no error
        } else if (errorMessage.includes('already exists') || errorMessage.includes('taken')) {
          setEmailError('This email is already associated with another account.');
        } else {
          setEmailError(errorMessage);
        }
      } finally {
        setEmailOperationLoading(null);
      }
    },
    [user, contactData.allEmails, createEmailWithReverification, refreshFromClerk]
  );

  /**
   * Delete email from Clerk
   */
  const deleteEmailFromClerk = useCallback(
    async (index: number) => {
      const allEmails = contactData.allEmails || [];
      const emailEntry = allEmails[index];
      if (!emailEntry || !user) return;

      // Don't allow deleting the primary email
      const currentPrimaryIndex = contactData.primaryEmailIndex ?? 0;
      if (index === currentPrimaryIndex) {
        setEmailError('Cannot delete primary email. Set another email as primary first.');
        return;
      }

      setEmailOperationLoading(emailEntry.email);
      setEmailError(null);

      try {
        // If it's a Clerk email, delete from Clerk
        if (emailEntry.clerkEmailId) {
          const clerkEmailAddr = user.emailAddresses.find((e) => e.id === emailEntry.clerkEmailId);
          if (clerkEmailAddr) {
            await clerkEmailAddr.destroy();
          }
          await user.reload();
        }

        // Update local state by identity — index can be stale after reload/sync
        setContactData((prev) => {
          const removed = removeEmailFromList(
            prev.allEmails || [],
            prev.primaryEmailIndex ?? 0,
            emailEntry
          );

          return {
            ...prev,
            allEmails: removed.emails,
            primaryEmailIndex: removed.primaryEmailIndex,
            email: removed.email,
          };
        });
      } catch (err) {
        console.error('Failed to delete email:', err);
        setEmailError(err instanceof Error ? err.message : 'Failed to delete email');
      } finally {
        setEmailOperationLoading(null);
      }
    },
    [user, contactData.allEmails, contactData.primaryEmailIndex]
  );

  /**
   * Set primary email - must be verified in Clerk
   * Uses reverification wrapper which will show password prompt if needed
   */
  const setPrimaryEmailClerk = useCallback(
    async (index: number) => {
      const allEmails = contactData.allEmails || [];
      const emailEntry = allEmails[index];
      if (!emailEntry) return;

      // Check if verified
      if (!emailEntry.verified) {
        setEmailError('Email must be verified before setting as primary. Click "Verify" first.');
        return;
      }

      // Check if it's a Clerk email
      if (!emailEntry.clerkEmailId) {
        setEmailError('This email needs to be added to your account first. Click "Add & Verify".');
        return;
      }

      setEmailOperationLoading(emailEntry.email);
      setEmailError(null);

      try {
        // Set as primary in Clerk using reverification wrapper
        await setPrimaryEmailWithReverification(emailEntry.clerkEmailId);

        // Reload user to get updated state
        await user?.reload();

        // Update local state
        setContactData((prev) => ({
          ...prev,
          primaryEmailIndex: index,
          email: emailEntry.email,
        }));
      } catch (err) {
        console.error('Failed to set primary email:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to set primary email';
        // Handle cancellation (user closed the reverification modal)
        if (errorMessage.includes('cancelled') || errorMessage.includes('canceled')) {
          setEmailError(null); // User cancelled, no error
        } else {
          setEmailError(errorMessage);
        }
      } finally {
        setEmailOperationLoading(null);
      }
    },
    [user, contactData.allEmails, setPrimaryEmailWithReverification]
  );

  /**
   * Verify email with code
   */
  const verifyEmailCode = useCallback(
    async (clerkEmailId: string, code: string) => {
      if (!user) return;

      setEmailOperationLoading(clerkEmailId);
      setEmailError(null);

      try {
        const emailAddr = user.emailAddresses.find((e) => e.id === clerkEmailId);
        if (!emailAddr) throw new Error('Email not found');

        await emailAddr.attemptVerification({ code });

        // Reload user to get updated state
        await user.reload();

        // Refresh our state from Clerk
        await refreshFromClerk();

        setEmailError(null);
      } catch (err) {
        console.error('Failed to verify email:', err);
        setEmailError(err instanceof Error ? err.message : 'Invalid verification code');
      } finally {
        setEmailOperationLoading(null);
      }
    },
    [user, refreshFromClerk]
  );

  /**
   * Resend verification code
   */
  const resendVerificationCode = useCallback(
    async (clerkEmailId: string) => {
      if (!user) return;

      setEmailOperationLoading(clerkEmailId);
      setEmailError(null);

      try {
        const emailAddr = user.emailAddresses.find((e) => e.id === clerkEmailId);
        if (!emailAddr) throw new Error('Email not found');

        await emailAddr.prepareVerification({ strategy: 'email_code' });

        setEmailError('Verification code sent! Check your inbox.');
      } catch (err) {
        console.error('Failed to resend verification:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to resend verification code';
        if (errorMessage.includes('additional verification')) {
          setEmailError(
            'Clerk requires session verification. Please sign out and sign back in, then try again.'
          );
        } else {
          setEmailError(errorMessage);
        }
      } finally {
        setEmailOperationLoading(null);
      }
    },
    [user]
  );

  const clearEmailError = useCallback(() => {
    setEmailError(null);
  }, []);

  // -------------------------------------------------------------------------
  // Phone Operations
  // -------------------------------------------------------------------------

  /**
   * Set primary phone by index
   */
  const setPrimaryPhone = useCallback((index: number) => {
    setContactData((prev) => {
      const allPhones = prev.allPhones || [];
      if (index < 0 || index >= allPhones.length) return prev;

      return {
        ...prev,
        primaryPhoneIndex: index,
        phone:
          allPhones[index].phone ||
          formatPhoneValue({
            countryCode: allPhones[index].countryCode || null,
            number: allPhones[index].number || '',
          }),
      };
    });
  }, []);

  /**
   * Delete phone from list
   */
  const deletePhone = useCallback((index: number) => {
    setContactData((prev) => {
      const allPhones = prev.allPhones || [];
      if (index < 0 || index >= allPhones.length) return prev;

      const currentPrimaryIndex = prev.primaryPhoneIndex ?? 0;
      // Don't allow deleting primary phone if there are other phones
      if (index === currentPrimaryIndex && allPhones.length > 1) {
        return prev;
      }

      const newPhones = allPhones.filter((_, i) => i !== index);

      // Adjust primary index if needed
      let newPrimaryIndex = currentPrimaryIndex;
      if (index < currentPrimaryIndex) {
        newPrimaryIndex = currentPrimaryIndex - 1;
      } else if (index === currentPrimaryIndex) {
        newPrimaryIndex = 0;
      }

      return {
        ...prev,
        allPhones: newPhones,
        primaryPhoneIndex: newPrimaryIndex,
        phone: newPhones[newPrimaryIndex]?.phone,
      };
    });
  }, []);

  /**
   * Add phone manually
   */
  const addPhone = useCallback((phoneValue: PhoneValue) => {
    if (!phoneValue.number.trim()) return;

    setContactData((prev) => {
      const allPhones = prev.allPhones || [];

      // Check for duplicates
      const normalizePhone = (p: string) => p.replace(/\D/g, '');
      const newPhoneNormalized = normalizePhone(phoneValue.number);
      const isDuplicate = allPhones.some((p) => {
        const existingNumber = p.number || p.phone || '';
        return normalizePhone(existingNumber) === newPhoneNormalized;
      });
      if (isDuplicate) return prev;

      return {
        ...prev,
        allPhones: [
          ...allPhones,
          {
            countryCode: phoneValue.countryCode,
            number: phoneValue.number,
            phone: formatPhoneValue(phoneValue), // Legacy field for backward compat
            source: 'MANUAL',
          },
        ],
      };
    });
  }, []);

  /**
   * Update phone at index
   */
  const updatePhone = useCallback((index: number, phoneValue: PhoneValue) => {
    setContactData((prev) => {
      const allPhones = [...(prev.allPhones || [])];
      if (index >= 0 && index < allPhones.length) {
        allPhones[index] = {
          ...allPhones[index],
          countryCode: phoneValue.countryCode,
          number: phoneValue.number,
          phone: formatPhoneValue(phoneValue),
        };
      }
      return {
        ...prev,
        allPhones,
      };
    });
  }, []);

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    // State
    contactData,
    isLoading,
    emailOperationLoading,
    emailError,
    verifyingEmailId,
    verificationCode,

    // Email operations
    addEmailToClerk,
    deleteEmailFromClerk,
    setPrimaryEmailClerk,
    verifyEmailCode,
    resendVerificationCode,
    setVerifyingEmailId,
    setVerificationCode,
    clearEmailError,

    // Phone operations
    addPhone,
    deletePhone,
    setPrimaryPhone,
    updatePhone,

    // Utility
    setContactData,
    refreshFromClerk,
  };
}
