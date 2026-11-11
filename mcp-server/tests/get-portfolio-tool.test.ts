import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_PORTFOLIO_HANDLE } from '../src/portfolio/repository.js';
import {
  GET_PORTFOLIO_TOOL_NAME,
  getPortfolioInputSchema,
  resolvePortfolioRequest,
} from '../src/tools/get-portfolio.js';
import {
  HELLO_FOLLIO_TOOL_NAME,
  helloFollioInputSchema,
  helloFollioMessage,
} from '../src/tools/hello-follio.js';
import { TOOL_NAMES } from '../src/server.js';

describe('get_portfolio input validation', () => {
  it('accepts an omitted handle', () => {
    const parsed = getPortfolioInputSchema.safeParse({});
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.handle, undefined);
  });

  it('accepts a valid handle and trims it', () => {
    const parsed = getPortfolioInputSchema.safeParse({ handle: '  riley-chen  ' });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.handle, 'riley-chen');
  });

  it('rejects an empty or whitespace-only handle', () => {
    // Distinct from omitting it: sending `handle: ""` is a malformed call,
    // not a request for the default.
    for (const handle of ['', '   ']) {
      const parsed = getPortfolioInputSchema.safeParse({ handle });
      assert.equal(parsed.success, false, `expected ${JSON.stringify(handle)} to be rejected`);
    }
  });

  it('rejects a handle that is too long', () => {
    const parsed = getPortfolioInputSchema.safeParse({ handle: 'x'.repeat(81) });
    assert.equal(parsed.success, false);
  });

  it('rejects a non-string handle', () => {
    for (const handle of [42, true, null, {}, []]) {
      const parsed = getPortfolioInputSchema.safeParse({ handle });
      assert.equal(parsed.success, false, `expected ${JSON.stringify(handle)} to be rejected`);
    }
  });
});

describe('get_portfolio resolution', () => {
  it('returns the default portfolio when no handle is given', () => {
    const result = resolvePortfolioRequest({});
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.equal(result.portfolio.profile.handle, DEFAULT_PORTFOLIO_HANDLE);
  });

  it('returns the named portfolio', () => {
    const result = resolvePortfolioRequest({ handle: 'morgan-patel' });
    assert.ok(result.ok);
    assert.equal(result.portfolio.profile.handle, 'morgan-patel');
    assert.equal(result.portfolio.profile.fullName, 'Morgan Patel');
  });

  it('returns every portfolio section for a successful lookup', () => {
    const result = resolvePortfolioRequest({ handle: DEFAULT_PORTFOLIO_HANDLE });
    assert.ok(result.ok);
    assert.deepEqual(Object.keys(result.portfolio).sort(), [
      'education',
      'experience',
      'meta',
      'profile',
      'projects',
      'skills',
    ]);
  });

  it('reports an unknown handle without throwing, and lists what is available', () => {
    const result = resolvePortfolioRequest({ handle: 'not-a-real-handle' });
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.match(result.message, /No portfolio found for handle "not-a-real-handle"/);
    assert.match(result.message, /Available handles:/);
    assert.match(result.message, new RegExp(DEFAULT_PORTFOLIO_HANDLE));
  });

  it('does not leak a prototype property as a portfolio', () => {
    const result = resolvePortfolioRequest({ handle: 'constructor' });
    assert.equal(result.ok, false);
  });

  it('is pure: repeated calls give an identical answer', () => {
    const first = resolvePortfolioRequest({ handle: DEFAULT_PORTFOLIO_HANDLE });
    const second = resolvePortfolioRequest({ handle: DEFAULT_PORTFOLIO_HANDLE });
    assert.ok(first.ok && second.ok);
    assert.equal(first.portfolio, second.portfolio);
    assert.deepEqual(first, second);
  });

  it('hands back frozen data, so a caller cannot change the fixture', () => {
    const result = resolvePortfolioRequest({});
    assert.ok(result.ok);
    assert.throws(() => {
      (result.portfolio.profile as { fullName: string }).fullName = 'tampered';
    }, TypeError);
    const after = resolvePortfolioRequest({});
    assert.ok(after.ok);
    assert.notEqual(after.portfolio.profile.fullName, 'tampered');
  });
});

describe('hello_follio is preserved', () => {
  it('keeps its tool name', () => {
    assert.equal(HELLO_FOLLIO_TOOL_NAME, 'hello_follio');
  });

  it('keeps its exact response text', () => {
    assert.equal(
      helloFollioMessage('Padmaja'),
      'Hello Padmaja! Your Follio MCP server is working successfully.'
    );
  });

  it('still requires a name', () => {
    assert.equal(helloFollioInputSchema.safeParse({ name: 'Padmaja' }).success, true);
    assert.equal(helloFollioInputSchema.safeParse({}).success, false);
    assert.equal(helloFollioInputSchema.safeParse({ name: 42 }).success, false);
  });
});

describe('server composition', () => {
  it('registers both tools', () => {
    assert.deepEqual([...TOOL_NAMES], [HELLO_FOLLIO_TOOL_NAME, GET_PORTFOLIO_TOOL_NAME]);
  });
});
