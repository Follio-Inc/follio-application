import type { ContactDraft } from '@/lib/stores/builder-store';
import type { FullProfile } from '@/types';

interface SaveProfileDraftParams {
  draftProfile: FullProfile;
  contactDraft: ContactDraft;
  shouldSaveProfile: boolean;
  shouldSaveContact: boolean;
}

export async function saveProfileDraft({
  draftProfile,
  contactDraft,
  shouldSaveProfile,
  shouldSaveContact,
}: SaveProfileDraftParams): Promise<void> {
  if (shouldSaveProfile) {
    const response = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: draftProfile.firstName,
        lastName: draftProfile.lastName,
        headline: draftProfile.headline,
        summary: draftProfile.summary,
        location: draftProfile.location,
        avatarUrl: draftProfile.avatarUrl,
        status: draftProfile.status,
        syncAvatarToClerk: false,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to save profile');
    }
  }

  if (shouldSaveContact) {
    const contactResponse = await fetch('/api/profile/contact', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contactDraft),
    });

    if (!contactResponse.ok) {
      throw new Error('Failed to save contact info');
    }
  }
}
