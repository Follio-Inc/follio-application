'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  buildVCard,
  unveilContactValue,
  vcardFilename,
  type FollioIdentity,
} from '@/lib/follio-identity';

const CONFIRMATION_MS = 2200;

/**
 * Downloads the Follio as a vCard. Built entirely in the browser so a visitor
 * saving a contact makes no network request and leaves no trace.
 */
export function useSaveContact(identity: FollioIdentity) {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const save = useCallback(() => {
    const contents = buildVCard({
      fullName: identity.fullName,
      email: identity.contact.email ? unveilContactValue(identity.contact.email) : null,
      phone: identity.contact.phone ? unveilContactValue(identity.contact.phone) : null,
      url: identity.follioUrl,
      title: identity.headline ?? identity.currentRole?.role,
      org: identity.currentRole?.company,
      location: identity.contact.location,
      socials: identity.links.map((link) => ({ label: link.label, url: link.url })),
    });

    const objectUrl = URL.createObjectURL(
      new Blob([contents], { type: 'text/vcard;charset=utf-8' })
    );
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = vcardFilename(identity.fullName);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);

    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), CONFIRMATION_MS);
  }, [identity]);

  return { save, saved };
}
