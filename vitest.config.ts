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
    // Cap the worker pool. The default is one worker per core, and each one
    // loads Vite plus the TypeScript compiler; the Developer Platform's
    // drift-scan tests additionally parse the ~670-file source tree inside
    // their worker (PLATFORM_TODO items 5–8). On a many-core machine that put
    // the run over the OS memory limit and killed unrelated workers at
    // startup, so the pool is bounded rather than sized by core count. Four
    // fits an 8 GB machine with other applications open and costs a few
    // seconds; CI runners have fewer cores than this, so it changes nothing
    // there.
    maxWorkers: 4,
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // Supplying `exclude` replaces Vitest's defaults rather than adding to
    // them, so these have to be real globs. Bare strings like `node_modules`
    // match only a path equal to that name, which lets a nested package's
    // `node_modules` stay in scope — Vitest then collects a dependency's own
    // vendored test suite and reports its failures as if they were this
    // application's.
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '_experiments/**',
      '_admin-panel/modules/developer/live-qa/pathways/**',
      '_admin-panel/modules/developer/live-qa/.artifacts/**',
    ],
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
