import { describe, expect, it } from 'vitest';

import { removePhoneFromList, type PhoneEntry } from '@/lib/hooks/use-contact-manager';

function phone(number: string, source = 'MANUAL'): PhoneEntry {
  return {
    countryCode: '+1::US',
    number,
    phone: `+1 ${number}`,
    source,
  };
}

describe('removePhoneFromList', () => {
  it('returns unchanged state for out-of-range index', () => {
    const phones = [phone('555-1111')];
    const result = removePhoneFromList(phones, 0, 3);

    expect(result.phones).toEqual(phones);
    expect(result.primaryPhoneIndex).toBe(0);
    expect(result.phone).toBe('+1 555-1111');
  });

  it('clears list and primary when deleting the only phone', () => {
    const phones = [phone('555-1111')];
    const result = removePhoneFromList(phones, 0, 0);

    expect(result.phones).toEqual([]);
    expect(result.primaryPhoneIndex).toBe(0);
    expect(result.phone).toBeUndefined();
  });

  it('promotes the remaining phone when primary is deleted', () => {
    const phones = [phone('555-1111'), phone('555-2222')];
    const result = removePhoneFromList(phones, 0, 0);

    expect(result.phones).toHaveLength(1);
    expect(result.phones[0]?.number).toBe('555-2222');
    expect(result.primaryPhoneIndex).toBe(0);
    expect(result.phone).toBe('+1 555-2222');
  });

  it('promotes another remaining phone when non-first primary is deleted', () => {
    const phones = [phone('555-1111'), phone('555-2222'), phone('555-3333')];
    const result = removePhoneFromList(phones, 1, 1);

    expect(result.phones.map((p) => p.number)).toEqual(['555-1111', '555-3333']);
    expect(result.primaryPhoneIndex).toBe(0);
    expect(result.phone).toBe('+1 555-1111');
  });

  it('keeps primary when a later non-primary is deleted', () => {
    const phones = [phone('555-1111'), phone('555-2222')];
    const result = removePhoneFromList(phones, 0, 1);

    expect(result.phones).toHaveLength(1);
    expect(result.phones[0]?.number).toBe('555-1111');
    expect(result.primaryPhoneIndex).toBe(0);
    expect(result.phone).toBe('+1 555-1111');
  });

  it('decrements primary index when an earlier non-primary is deleted', () => {
    const phones = [phone('555-1111'), phone('555-2222'), phone('555-3333')];
    const result = removePhoneFromList(phones, 2, 0);

    expect(result.phones.map((p) => p.number)).toEqual(['555-2222', '555-3333']);
    expect(result.primaryPhoneIndex).toBe(1);
    expect(result.phone).toBe('+1 555-3333');
  });

  it('clamps a stale primary index before deleting a non-primary', () => {
    const phones = [phone('555-1111'), phone('555-2222')];
    const result = removePhoneFromList(phones, 9, 1);

    expect(result.phones).toHaveLength(1);
    expect(result.phones[0]?.number).toBe('555-1111');
    expect(result.primaryPhoneIndex).toBe(0);
    expect(result.phone).toBe('+1 555-1111');
  });

  it('resolves legacy phone display from countryCode/number when phone is missing', () => {
    const phones: PhoneEntry[] = [
      { countryCode: '+1::US', number: '555-1111', source: 'MANUAL' },
      { countryCode: '+1::US', number: '555-2222', source: 'MANUAL' },
    ];
    const result = removePhoneFromList(phones, 0, 0);

    expect(result.phones).toHaveLength(1);
    expect(result.primaryPhoneIndex).toBe(0);
    expect(result.phone).toContain('555');
    expect(result.phone).toContain('2222');
  });
});
