/**
 * Engine selection and its feature flag.
 *
 * The route tests mock `@/lib/features`, so nothing there proves the flag is
 * actually read from the environment. This file uses the real modules, which
 * matters because this one boolean decides whether a request runs the cheap
 * single-agent path or the orchestrated one that costs roughly twice as much.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isMultiAgentResumeEnabled } from '@/lib/features';
import { selectAnalysisEngine } from '@/services/agents/resume/engine';

const FLAG = 'FOLLIO_MULTI_AGENT_ENABLED';

let original: string | undefined;

beforeEach(() => {
  original = process.env[FLAG];
});

afterEach(() => {
  if (original === undefined) delete process.env[FLAG];
  else process.env[FLAG] = original;
});

describe('isMultiAgentResumeEnabled', () => {
  it('is off when the variable is unset', () => {
    delete process.env[FLAG];
    expect(isMultiAgentResumeEnabled()).toBe(false);
  });

  it('is on only for the exact string "true"', () => {
    process.env[FLAG] = 'true';
    expect(isMultiAgentResumeEnabled()).toBe(true);
  });

  it('treats anything else as off', () => {
    for (const value of ['', 'false', '1', 'TRUE', 'yes', 'on']) {
      process.env[FLAG] = value;
      expect(isMultiAgentResumeEnabled()).toBe(false);
    }
  });

  it('is server-side only — no NEXT_PUBLIC_ prefix', () => {
    // A NEXT_PUBLIC_ name would be inlined into the client bundle, which
    // would let the browser see, and a fork of the app set, which engine runs.
    expect(FLAG.startsWith('NEXT_PUBLIC_')).toBe(false);
    expect(process.env.NEXT_PUBLIC_MULTI_AGENT_ENABLED).toBeUndefined();
  });
});

describe('selectAnalysisEngine', () => {
  it('defaults to the single-agent engine', () => {
    delete process.env[FLAG];
    expect(selectAnalysisEngine()).toBe('single-agent');
  });

  it('selects the orchestrator when the flag is on', () => {
    process.env[FLAG] = 'true';
    expect(selectAnalysisEngine()).toBe('multi-agent');
  });

  it('falls back to single-agent for a malformed value', () => {
    process.env[FLAG] = 'maybe';
    expect(selectAnalysisEngine()).toBe('single-agent');
  });

  it('takes no argument, so no caller can ask for an engine', () => {
    // The engine is a property of the deployment, not of a request. If this
    // ever grows a parameter, a client-controlled value could reach it.
    expect(selectAnalysisEngine).toHaveLength(0);
  });
});
