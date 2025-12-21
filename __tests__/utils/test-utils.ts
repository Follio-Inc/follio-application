/**
 * Test Utilities
 *
 * Common utilities and helpers for writing tests.
 * Import these in your test files to reduce boilerplate.
 */

import { vi } from 'vitest';

/**
 * Create a mock for Next.js Request
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Request {
  const { method = 'GET', body, headers = {} } = options;

  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body && { body: JSON.stringify(body) }),
  });
}

/**
 * Create a mock for URL with searchParams
 */
export function createMockUrl(baseUrl: string, params: Record<string, string> = {}): URL {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
}

/**
 * Create a mock for Clerk auth context
 */
export function createMockAuth(userId: string | null = 'user_123') {
  return {
    userId,
    sessionId: userId ? 'session_123' : null,
    getToken: vi.fn().mockResolvedValue('mock_token'),
  };
}

/**
 * Create a mock Prisma client
 */
export function createMockPrisma() {
  return {
    profile: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    experience: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    education: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    skill: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    link: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(createMockPrisma())),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  };
}

/**
 * Create a sample profile object for testing
 */
export function createMockProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile_123',
    userId: 'user_123',
    handle: 'johndoe',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    headline: 'Software Engineer',
    summary: 'Experienced developer',
    location: 'San Francisco, CA',
    avatarUrl: 'https://example.com/avatar.jpg',
    isPublic: true,
    isDraft: false,
    source: 'MANUAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a sample experience object for testing
 */
export function createMockExperience(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exp_123',
    profileId: 'profile_123',
    company: 'Acme Inc',
    title: 'Software Engineer',
    location: 'San Francisco, CA',
    description: 'Built amazing things',
    startDate: new Date('2020-01-01'),
    endDate: null,
    isCurrent: true,
    source: 'MANUAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a sample education object for testing
 */
export function createMockEducation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'edu_123',
    profileId: 'profile_123',
    school: 'University of Example',
    degree: 'Bachelor of Science',
    field: 'Computer Science',
    startDate: new Date('2016-09-01'),
    endDate: new Date('2020-05-01'),
    description: 'Studied CS',
    source: 'MANUAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a sample project object for testing
 */
export function createMockProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj_123',
    profileId: 'profile_123',
    name: 'My Project',
    description: 'An awesome project',
    url: 'https://example.com/project',
    repoUrl: 'https://github.com/user/project',
    imageUrl: null,
    technologies: ['React', 'TypeScript', 'Node.js'],
    startDate: new Date('2021-01-01'),
    endDate: null,
    source: 'GITHUB',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a sample skill object for testing
 */
export function createMockSkill(overrides: Record<string, unknown> = {}) {
  return {
    id: 'skill_123',
    profileId: 'profile_123',
    name: 'TypeScript',
    category: 'Programming Language',
    level: 'Advanced',
    source: 'MANUAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Wait for all promises to resolve (useful for testing async code)
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Create a deferred promise for controlling async test flow
 */
export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Mock console methods and capture output
 */
export function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => errors.push(args.join(' '));
  console.warn = (...args) => warns.push(args.join(' '));

  return {
    logs,
    errors,
    warns,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}
