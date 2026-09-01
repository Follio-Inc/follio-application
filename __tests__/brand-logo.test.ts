import { describe, expect, it } from 'vitest';

import {
  brandLogoSrc,
  brandMonogram,
  domainCandidates,
  domainFromUrl,
  resolveBrandDomains,
  universityDomain,
} from '@/lib/brand-logo';

describe('domainFromUrl', () => {
  it('reduces a URL to a bare public hostname', () => {
    expect(domainFromUrl('https://www.MolsonCoors.com/careers')).toBe('molsoncoors.com');
    expect(domainFromUrl('stanford.edu')).toBe('stanford.edu');
    expect(domainFromUrl('http://sub.example.co.uk?a=1')).toBe('sub.example.co.uk');
  });

  it('rejects anything that is not a public http host', () => {
    // Guards the logo route against being pointed at internal addresses.
    expect(domainFromUrl('http://localhost:3000')).toBeNull();
    expect(domainFromUrl('http://127.0.0.1')).toBeNull();
    expect(domainFromUrl('http://build.internal')).toBeNull();
    expect(domainFromUrl('http://box.local')).toBeNull();
    expect(domainFromUrl('javascript:alert(1)')).toBeNull();
    expect(domainFromUrl('file:///etc/passwd')).toBeNull();
    expect(domainFromUrl('nodots')).toBeNull();
    expect(domainFromUrl('')).toBeNull();
    expect(domainFromUrl(null)).toBeNull();
  });
});

describe('domainCandidates', () => {
  it('guesses a company domain from its name', () => {
    expect(domainCandidates('Molson Coors', 'company')[0]).toBe('molsoncoors.com');
    expect(domainCandidates('Stripe, Inc.', 'company')[0]).toBe('stripe.com');
    expect(domainCandidates('Molson Coors Beverage Company', 'company')).toContain(
      'molsoncoors.com'
    );
  });

  it('drops legal suffixes and normalizes punctuation', () => {
    expect(domainCandidates('Nestlé S.A.', 'company')[0]).toBe('nestle.com');
    expect(domainCandidates('Ben & Jerry', 'company')[0]).toBe('benandjerry.com');
  });

  it('prefers .edu and ignores filler words for schools', () => {
    expect(domainCandidates('Stanford University', 'school')[0]).toBe('stanford.edu');
    expect(domainCandidates('University of California', 'school')[0]).toBe('california.edu');
  });

  it('tries the place name for schools known by a qualifier', () => {
    // "UC Berkeley" lives at berkeley.edu, not ucberkeley.edu, so both are
    // tried and every academic TLD is exhausted before any other.
    const candidates = domainCandidates('UC Berkeley', 'school');

    expect(candidates.slice(0, 2)).toEqual(['ucberkeley.edu', 'berkeley.edu']);
    expect(candidates.every((domain) => /\.(edu|ac\.uk)$/.test(domain))).toBe(true);
  });

  it('never guesses a TLD beyond .com for companies', () => {
    // google.io and techscale.io both serve real logos for unrelated
    // businesses, so speculative TLDs produce confidently wrong marks.
    expect(domainCandidates('Google', 'company')).toEqual(['google.com']);
    expect(domainCandidates('TechScale Inc.', 'company')).toEqual(['techscale.com']);
  });

  it('refuses to guess when the name is too generic to be safe', () => {
    // A wrong logo is worse than no logo, so these fall through to a monogram.
    expect(domainCandidates('X', 'company')).toEqual([]);
    expect(domainCandidates('The Company', 'company')).toEqual([]);
    expect(domainCandidates('University of', 'school')).toEqual([]);
    expect(domainCandidates('   ', 'company')).toEqual([]);
  });
});

describe('resolveBrandDomains', () => {
  it('trusts an explicit URL over any guess', () => {
    expect(
      resolveBrandDomains({
        name: 'Molson Coors',
        url: 'https://www.molsoncoors.co.uk',
        kind: 'company',
      })
    ).toEqual(['molsoncoors.co.uk']);
  });

  it('falls back to guessing when the URL is unusable', () => {
    expect(
      resolveBrandDomains({ name: 'Molson Coors', url: 'http://localhost', kind: 'company' })
    ).toContain('molsoncoors.com');
  });

  it('resolves schools whose domain cannot be derived from their name', () => {
    // These are the cases pure guessing can never reach.
    expect(resolveBrandDomains({ name: 'University of San Francisco', kind: 'school' })[0]).toBe(
      'usfca.edu'
    );
    expect(
      resolveBrandDomains({ name: 'Massachusetts Institute of Technology', kind: 'school' })[0]
    ).toBe('mit.edu');
    expect(resolveBrandDomains({ name: 'University of Oxford', kind: 'school' })[0]).toBe(
      'ox.ac.uk'
    );
  });

  it('keeps guesses as a fallback for schools missing from the dataset', () => {
    const domains = resolveBrandDomains({
      name: 'Definitely Not A Real Institution',
      kind: 'school',
    });

    expect(domains.length).toBeGreaterThan(0);
    expect(domains.every((domain) => /\.(edu|ac\.uk)$/.test(domain))).toBe(true);
  });

  it('still prefers an explicit URL over the dataset', () => {
    expect(
      resolveBrandDomains({
        name: 'University of San Francisco',
        url: 'https://law.usfca.edu',
        kind: 'school',
      })
    ).toEqual(['law.usfca.edu']);
  });

  it('reaches non-.com employers only through an explicit URL', () => {
    expect(resolveBrandDomains({ name: 'Ocado Group', kind: 'company' })).toEqual(['ocado.com']);
    expect(
      resolveBrandDomains({ name: 'Ocado Group', url: 'https://ocado.co.uk', kind: 'company' })
    ).toEqual(['ocado.co.uk']);
  });
});

describe('universityDomain', () => {
  it('looks up schools by name', () => {
    expect(universityDomain('Stanford University')).toBe('stanford.edu');
    expect(universityDomain('University of San Francisco')).toBe('usfca.edu');
  });

  it('tolerates punctuation, casing, and a leading "The"', () => {
    expect(universityDomain('the  university of  OXFORD')).toBe('ox.ac.uk');
    expect(universityDomain('University of California, Berkeley')).toBe('berkeley.edu');
  });

  it('returns null for unknown or empty names', () => {
    expect(universityDomain('Hogwarts School of Witchcraft')).toBeNull();
    expect(universityDomain('')).toBeNull();
  });
});

describe('brandLogoSrc', () => {
  it('points at our own route and passes the URL hint through', () => {
    const src = brandLogoSrc({ name: 'Molson Coors', kind: 'company' });

    expect(src).toContain('/api/brand/logo?');
    expect(src).toContain('name=Molson+Coors');
    expect(src).toContain('kind=company');

    const withUrl = brandLogoSrc({
      name: 'Stanford University',
      url: 'https://stanford.edu',
      kind: 'school',
    });
    expect(withUrl).toContain('url=https%3A%2F%2Fstanford.edu');
  });

  it('returns null when there is nothing to look up', () => {
    expect(brandLogoSrc({ name: '   ', kind: 'company' })).toBeNull();
  });
});

describe('brandMonogram', () => {
  it('uses initials from the first two words', () => {
    expect(brandMonogram('Molson Coors')).toBe('MC');
    expect(brandMonogram('Stripe')).toBe('ST');
    expect(brandMonogram('  ')).toBe('?');
  });
});
