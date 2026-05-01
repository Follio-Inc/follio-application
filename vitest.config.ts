import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite 8 (used by Vitest 4) needs an explicit JSX transformer for the
  // .tsx files our tests pull in transitively. The Next.js tsconfig sets
  // `jsx: "preserve"` (required by the Next compiler), so esbuild/oxc
  // refuses to handle JSX on its own. The official React plugin provides
  // the automatic-runtime transform without altering the project tsconfig.
  plugins: [react()],
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
      // Coverage thresholds - start low, increase as we add more tests
      // Current: ~3.5% | Target: gradually increase to 50%+
      thresholds: {
        lines: 3,
        functions: 3,
        branches: 3,
        statements: 3,
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
