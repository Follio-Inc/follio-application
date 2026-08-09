import fs from 'node:fs';
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const liveQaRoot = path.join(__dirname);
const artifactsDir = process.env.LIVE_QA_ARTIFACTS_DIR || path.join(liveQaRoot, '.artifacts');
const storageState = process.env.LIVE_QA_STORAGE_STATE;
const headed = process.env.LIVE_QA_HEADED === 'true';

export default defineConfig({
  testDir: path.join(liveQaRoot, 'pathways'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['json', { outputFile: path.join(artifactsDir, 'report.json') }]],
  outputDir: path.join(artifactsDir, 'test-output'),
  use: {
    baseURL: (process.env.LIVE_QA_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: !headed,
    ...(storageState && fs.existsSync(storageState) ? { storageState } : {}),
    ...devices['Desktop Chrome'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
