import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_PORTFOLIO_HANDLE, SYNTHETIC_PORTFOLIOS } from '../src/portfolio/data.js';
import {
  getDefaultPortfolio,
  getPortfolioByHandle,
  listPortfolioHandles,
  normalizePortfolioHandle,
} from '../src/portfolio/repository.js';
import type { Portfolio } from '../src/portfolio/types.js';

describe('portfolio fixtures', () => {
  it('ships more than one portfolio, including the default', () => {
    const handles = listPortfolioHandles();
    assert.ok(handles.length >= 2, 'expected at least two fixtures');
    assert.ok(handles.includes(DEFAULT_PORTFOLIO_HANDLE));
  });

  it('returns handles in a stable order', () => {
    assert.deepEqual(listPortfolioHandles(), [...listPortfolioHandles()].sort());
  });

  it('keys every fixture by its own profile handle', () => {
    for (const [key, portfolio] of Object.entries(SYNTHETIC_PORTFOLIOS)) {
      assert.equal(portfolio.profile.handle, key);
    }
  });

  it('marks every fixture as synthetic', () => {
    for (const portfolio of Object.values(SYNTHETIC_PORTFOLIOS)) {
      assert.equal(portfolio.meta.dataSource, 'synthetic-fixture');
    }
  });

  it('contains no real contact details', () => {
    // Every address and URL in the fixtures must stay on example.com, so a
    // demo response can never point at a real person or site.
    for (const portfolio of Object.values(SYNTHETIC_PORTFOLIOS)) {
      assert.match(portfolio.profile.contact.email, /@example\.com$/);
      for (const url of [
        portfolio.profile.contact.website,
        ...portfolio.projects.flatMap((project) => [project.url, project.repoUrl]),
      ]) {
        if (url !== null) assert.match(url, /^https:\/\/example\.com\//);
      }
    }
  });
});

describe('portfolio response structure', () => {
  function assertIsPortfolio(portfolio: Portfolio): void {
    const { profile, experience, education, projects, skills, meta } = portfolio;

    assert.ok(profile.handle.length > 0);
    assert.ok(profile.fullName.length > 0);
    assert.ok(profile.headline.length > 0);
    assert.ok(profile.summary.length > 0);
    assert.ok(profile.contact.email.length > 0);

    assert.ok(experience.length > 0, 'expected work experience');
    assert.ok(education.length > 0, 'expected education');
    assert.ok(projects.length > 0, 'expected projects');
    assert.ok(skills.length > 0, 'expected skill groups');
    assert.ok(meta.lastUpdated.length > 0);
  }

  it('gives every fixture all five portfolio sections', () => {
    for (const portfolio of Object.values(SYNTHETIC_PORTFOLIOS)) {
      assertIsPortfolio(portfolio);
    }
  });

  it('uses ISO dates and a consistent current-role convention', () => {
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    for (const portfolio of Object.values(SYNTHETIC_PORTFOLIOS)) {
      for (const role of portfolio.experience) {
        assert.match(role.startDate, isoDate);
        if (role.isCurrent) {
          assert.equal(role.endDate, null, 'a current role must have no end date');
        } else {
          assert.ok(role.endDate !== null, 'a past role must have an end date');
          assert.match(role.endDate, isoDate);
          assert.ok(role.endDate > role.startDate, 'end date must follow start date');
        }
        assert.ok(role.bullets.length > 0);
      }
      assert.equal(
        portfolio.experience.filter((role) => role.isCurrent).length <= 1,
        true,
        'at most one current role per portfolio'
      );
      assert.match(portfolio.meta.lastUpdated, isoDate);
    }
  });

  it('gives every item a unique id', () => {
    for (const portfolio of Object.values(SYNTHETIC_PORTFOLIOS)) {
      const ids = [
        ...portfolio.experience.map((item) => item.id),
        ...portfolio.education.map((item) => item.id),
        ...portfolio.projects.map((item) => item.id),
      ];
      assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
    }
  });

  it('survives a JSON round trip unchanged', () => {
    // The tool serialises portfolios onto the wire, so nothing in a fixture
    // may be lost or rewritten by JSON.
    for (const portfolio of Object.values(SYNTHETIC_PORTFOLIOS)) {
      assert.deepEqual(JSON.parse(JSON.stringify(portfolio)), portfolio);
    }
  });
});

describe('handle lookup', () => {
  it('finds a portfolio by its exact handle', () => {
    const portfolio = getPortfolioByHandle(DEFAULT_PORTFOLIO_HANDLE);
    assert.ok(portfolio);
    assert.equal(portfolio.profile.handle, DEFAULT_PORTFOLIO_HANDLE);
  });

  it('tolerates case, whitespace and a leading @', () => {
    for (const variant of [
      '  riley-chen  ',
      'Riley-Chen',
      'RILEY-CHEN',
      '@riley-chen',
      ' @Riley-Chen ',
    ]) {
      const portfolio = getPortfolioByHandle(variant);
      assert.ok(portfolio, `expected ${JSON.stringify(variant)} to resolve`);
      assert.equal(portfolio.profile.handle, 'riley-chen');
    }
  });

  it('normalises a handle without looking it up', () => {
    assert.equal(normalizePortfolioHandle(' @Riley-Chen '), 'riley-chen');
    assert.equal(normalizePortfolioHandle('   '), '');
  });

  it('returns null for an unknown handle', () => {
    assert.equal(getPortfolioByHandle('nobody-here'), null);
    assert.equal(getPortfolioByHandle(''), null);
    assert.equal(getPortfolioByHandle('   '), null);
  });

  it('does not resolve inherited object properties', () => {
    // A prototype-chain hit would otherwise return a function as a portfolio.
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.equal(getPortfolioByHandle(key), null, `${key} must not resolve`);
    }
  });

  it('returns the default portfolio when no handle is given', () => {
    const portfolio = getDefaultPortfolio();
    assert.ok(portfolio);
    assert.equal(portfolio.profile.handle, DEFAULT_PORTFOLIO_HANDLE);
  });
});

describe('read-only behaviour', () => {
  it('exposes no write function', async () => {
    // Guards against a create/update/delete helper being added to the data
    // seam later without a deliberate decision.
    const repository = await import('../src/portfolio/repository.js');
    const writeVerbs = /^(create|update|delete|remove|set|save|write|insert|upsert|patch)/i;
    const offenders = Object.keys(repository).filter((name) => writeVerbs.test(name));
    assert.deepEqual(offenders, [], 'repository must stay read-only');
  });

  it('freezes the fixture set', () => {
    assert.ok(Object.isFrozen(SYNTHETIC_PORTFOLIOS));
    assert.throws(() => {
      (SYNTHETIC_PORTFOLIOS as Record<string, unknown>)['injected'] = {};
    }, TypeError);
  });

  it('freezes nested portfolio data', () => {
    const portfolio = getPortfolioByHandle(DEFAULT_PORTFOLIO_HANDLE);
    assert.ok(portfolio);
    assert.ok(Object.isFrozen(portfolio));
    assert.ok(Object.isFrozen(portfolio.profile));
    assert.ok(Object.isFrozen(portfolio.profile.contact));
    assert.ok(Object.isFrozen(portfolio.experience));
    assert.ok(Object.isFrozen(portfolio.experience[0]));
    assert.ok(Object.isFrozen(portfolio.experience[0]?.bullets));
  });

  it('rejects a write through a returned portfolio', () => {
    const portfolio = getPortfolioByHandle(DEFAULT_PORTFOLIO_HANDLE);
    assert.ok(portfolio);
    assert.throws(() => {
      (portfolio.profile as { headline: string }).headline = 'tampered';
    }, TypeError);
    assert.throws(() => {
      (portfolio.experience as PortfolioMutable[]).push({} as PortfolioMutable);
    }, TypeError);
    assert.notEqual(portfolio.profile.headline, 'tampered');
  });

  it('hands every caller the same unmodified object', () => {
    const first = getPortfolioByHandle(DEFAULT_PORTFOLIO_HANDLE);
    const second = getPortfolioByHandle('  RILEY-CHEN ');
    assert.equal(first, second, 'repeated reads must return the same frozen fixture');
  });
});

/** Local alias used only to write an illegal push in the test above. */
type PortfolioMutable = Portfolio['experience'][number];
