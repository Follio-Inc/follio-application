/**
 * vCard 3.0 builder for the Follio connect action.
 *
 * This is the payload that survives the career fair: whatever lands in the
 * other person's address book is what they still have in three months. Only
 * fields already visible on the Follio are included — never hidden contact.
 */

export type FollioVCardInput = {
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  url?: string | null;
  org?: string | null;
  title?: string | null;
  location?: string | null;
  /** Profile links, saved so the contact keeps its GitHub/LinkedIn trail. */
  socials?: { label: string; url: string }[];
};

function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildVCard(input: FollioVCardInput): string {
  const fullName = clean(input.fullName) ?? 'Follio';
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVCard(fullName)}`];

  // Structured name lets address books sort and search correctly.
  const last = clean(input.lastName);
  const first = clean(input.firstName);
  if (last || first) {
    lines.push(`N:${escapeVCard(last ?? '')};${escapeVCard(first ?? '')};;;`);
  }

  const title = clean(input.title);
  if (title) lines.push(`TITLE:${escapeVCard(title)}`);

  const org = clean(input.org);
  if (org) lines.push(`ORG:${escapeVCard(org)}`);

  const phone = clean(input.phone);
  if (phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(phone)}`);

  const email = clean(input.email);
  if (email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(email)}`);

  const url = clean(input.url);
  if (url) lines.push(`URL:${escapeVCard(url)}`);

  // Location is free text (e.g. "Austin, TX"), so it goes in the locality slot.
  const location = clean(input.location);
  if (location) lines.push(`ADR;TYPE=WORK:;;;${escapeVCard(location)};;;`);

  for (const social of input.socials ?? []) {
    const socialUrl = clean(social.url);
    if (!socialUrl) continue;
    const label = clean(social.label) ?? 'Link';
    lines.push(`X-SOCIALPROFILE;TYPE=${escapeVCard(label)}:${escapeVCard(socialUrl)}`);
  }

  if (url) lines.push(`NOTE:${escapeVCard(`Follio: ${url}`)}`);

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function vcardFilename(fullName: string): string {
  const slug = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'contact'}.vcf`;
}
