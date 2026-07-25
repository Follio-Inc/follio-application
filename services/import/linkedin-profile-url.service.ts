/**
 * Legal LinkedIn profile fetch by vanity name / profile URL.
 *
 * Sources (in order):
 * 1. LinkedIn Partner "Find Profile by VanityName" API when LINKEDIN_API_ACCESS_TOKEN
 *    is configured (requires LinkedIn partner approval — no HTML scraping).
 * 2. Otherwise: normalize the user's pasted URL/username into a canonical profile
 *    link only. Full name/photo/experience still require OAuth consent or a
 *    LinkedIn data-export upload (both already supported elsewhere).
 *
 * We intentionally do not scrape linkedin.com HTML — that violates LinkedIn's ToS.
 */

import {
  buildLinkedInProfileUrl,
  extractLinkedInSlug,
  isValidLinkedInSlug,
} from '@/lib/import/profile-url';
import type { NormalizedLink, NormalizedProfileData } from '@/services/import/types';

export interface LinkedInProfileByUrlResult {
  profile: NormalizedProfileData;
  links: NormalizedLink[];
  fromLinkedIn: {
    username: string;
    profileUrl: string;
    firstName?: string;
    lastName?: string;
    headline?: string;
    avatarUrl?: string;
  };
  /** True when Partner API returned member fields beyond the URL. */
  fetchedFromApi: boolean;
  message: string;
}

interface LinkedInLocalizedString {
  localized?: Record<string, string>;
  preferredLocale?: { language?: string; country?: string };
}

function pickLocalized(value: LinkedInLocalizedString | string | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const localized = value.localized;
  if (!localized) return '';
  const preferred = value.preferredLocale;
  if (preferred?.language) {
    const key = preferred.country
      ? `${preferred.language}_${preferred.country}`
      : preferred.language;
    if (localized[key]) return localized[key];
  }
  return Object.values(localized)[0] || '';
}

type LinkedInImageElement = {
  identifiers?: Array<{ identifier?: string }>;
};

function extractAvatarUrl(profilePicture: unknown): string {
  if (!profilePicture || typeof profilePicture !== 'object') return '';
  const display = (profilePicture as Record<string, { elements?: LinkedInImageElement[] }>)[
    'displayImage~'
  ];
  const elements = display?.elements;
  if (!Array.isArray(elements) || elements.length === 0) return '';
  const last = elements[elements.length - 1];
  return last?.identifiers?.[0]?.identifier || '';
}

/**
 * Call LinkedIn's partner vanityName API when an app access token is available.
 * Docs: https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-vanity-name-api
 */
async function fetchViaPartnerApi(slug: string): Promise<{
  firstName: string;
  lastName: string;
  headline: string;
  avatarUrl: string;
} | null> {
  const token = process.env.LINKEDIN_API_ACCESS_TOKEN?.trim();
  if (!token) return null;

  const projection =
    '(id,firstName,lastName,headline,vanityName,profilePicture(displayImage~:playableStreams))';
  const url = new URL('https://api.linkedin.com/v2/people');
  url.searchParams.set('q', 'vanityName');
  url.searchParams.set('vanityName', slug);
  url.searchParams.set('projection', projection);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Restli-Protocol-Version': '2.0.0',
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.warn(
      `[LinkedIn profile] Partner API ${response.status} for vanityName=${slug}: ${body.slice(0, 200)}`
    );
    return null;
  }

  const data = (await response.json()) as {
    elements?: Array<{
      firstName?: LinkedInLocalizedString;
      lastName?: LinkedInLocalizedString;
      headline?: LinkedInLocalizedString;
      profilePicture?: unknown;
    }>;
  };

  const person = data.elements?.[0];
  if (!person) return null;

  return {
    firstName: pickLocalized(person.firstName),
    lastName: pickLocalized(person.lastName),
    headline: pickLocalized(person.headline),
    avatarUrl: extractAvatarUrl(person.profilePicture),
  };
}

/**
 * Resolve a pasted LinkedIn URL or username into importable profile data.
 * Never scrapes LinkedIn HTML.
 */
export async function importLinkedInProfileByUrl(
  input: string
): Promise<LinkedInProfileByUrlResult> {
  const slug = extractLinkedInSlug(input);
  if (!slug || !isValidLinkedInSlug(slug)) {
    throw new Error(
      'Enter a LinkedIn profile URL or username (e.g. linkedin.com/in/jane-doe or jane-doe)'
    );
  }

  const profileUrl = buildLinkedInProfileUrl(slug);
  const links: NormalizedLink[] = [
    { url: profileUrl, type: 'linkedin', label: 'LinkedIn', source: 'LINKEDIN' },
  ];

  const apiProfile = await fetchViaPartnerApi(slug);

  if (apiProfile) {
    const profile: NormalizedProfileData = {
      firstName: apiProfile.firstName || undefined,
      lastName: apiProfile.lastName || undefined,
      headline: apiProfile.headline || undefined,
      avatarUrl: apiProfile.avatarUrl || undefined,
    };

    const imported: string[] = ['LinkedIn URL'];
    if (apiProfile.firstName || apiProfile.lastName) imported.push('name');
    if (apiProfile.headline) imported.push('headline');
    if (apiProfile.avatarUrl) imported.push('photo');

    return {
      profile,
      links,
      fromLinkedIn: {
        username: slug,
        profileUrl,
        firstName: apiProfile.firstName || undefined,
        lastName: apiProfile.lastName || undefined,
        headline: apiProfile.headline || undefined,
        avatarUrl: apiProfile.avatarUrl || undefined,
      },
      fetchedFromApi: true,
      message: `Imported ${imported.join(', ')} from LinkedIn`,
    };
  }

  return {
    profile: {},
    links,
    fromLinkedIn: {
      username: slug,
      profileUrl,
    },
    fetchedFromApi: false,
    message: `Added ${profileUrl.replace(/^https:\/\/(www\.)?/, '')}`,
  };
}
