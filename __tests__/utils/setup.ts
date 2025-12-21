/**
 * Vitest Setup File
 *
 * This file runs before all tests.
 * Use it for global mocks, test setup, and configuration.
 */

import { vi } from 'vitest';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Mock Next.js server-side modules
vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    // Add any specific mocks if needed
  };
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
