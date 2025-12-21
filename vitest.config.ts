import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        '.next/',
        'coverage/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        '__tests__/utils/**',
        'prisma/**',
        'public/**',
        '*.config.*',
      ],
      thresholds: {
        // Start with lower thresholds, increase as coverage improves
        lines: 20,
        functions: 20,
        branches: 20,
        statements: 20,
      },
    },
    setupFiles: ['__tests__/utils/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
