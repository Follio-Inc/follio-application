import type { FollioIdentity } from './types';

export type FollioCardAction = 'Call' | 'Email' | 'Save';

export type FollioCardFact = {
  label: string;
  value: string;
};

export type FollioCardDoorAction = 'Open' | 'Download';

export type FollioCardDoor = {
  label: string;
  actions?: FollioCardDoorAction[];
};

/**
 * The verbs on a Follio card — call, email, save — shown only when the
 * person actually left a way to reach them.
 */
export function follioCardActions(identity: FollioIdentity): FollioCardAction[] {
  const actions: FollioCardAction[] = [];
  if (identity.contact.phone) actions.push('Call');
  if (identity.contact.email) actions.push('Email');
  if (identity.contact.phone || identity.contact.email) actions.push('Save');
  return actions;
}

/**
 * A few facts that belong on a card, not a page: where they work, where they
 * are, where they studied. Capped so the snap stays glanceable.
 */
export function follioCardFacts(identity: FollioIdentity): FollioCardFact[] {
  const facts: FollioCardFact[] = [];
  const currentCompany = identity.currentRole?.company ?? null;

  if (currentCompany) {
    facts.push({ label: 'Now', value: currentCompany });
  }

  const previous = identity.experience.find(
    (item) => item.company !== currentCompany && Boolean(item.company)
  );
  if (previous) {
    facts.push({ label: 'Previously', value: previous.company });
  }

  if (identity.contact.location) {
    facts.push({ label: 'Based in', value: identity.contact.location });
  }

  const school = identity.education[0]?.institution;
  if (school) {
    facts.push({ label: 'Studied', value: school });
  }

  return facts.slice(0, 4);
}

/** Resume and work as doors off the card — labels only, no website chrome. */
export function follioCardDoors(identity: FollioIdentity): FollioCardDoor[] {
  const doors: FollioCardDoor[] = [];
  if (identity.doors.resume) {
    doors.push({ label: 'Résumé', actions: ['Open', 'Download'] });
  }
  if (identity.doors.work) doors.push({ label: 'Work' });
  return doors;
}
