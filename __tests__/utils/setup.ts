/**
 * Vitest Setup File
 *
 * This file runs before all tests.
 * Use it for global mocks, test setup, and configuration.
 */

import { afterEach, vi } from 'vitest';

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
