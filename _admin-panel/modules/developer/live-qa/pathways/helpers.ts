import fs from 'node:fs';

import { test as base, expect, type Page } from '@playwright/test';

export type LiveQaPersona = {
  firstName: string;
  lastName: string;
  headline?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
};

export function liveQaBaseUrl(): string {
  return (process.env.LIVE_QA_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function liveQaResumePdf(): string | null {
  const value = process.env.LIVE_QA_RESUME_PDF;
  return value && fs.existsSync(value) ? value : null;
}

export function liveQaPersona(): LiveQaPersona | null {
  const value = process.env.LIVE_QA_PERSONA_PATH;
  if (!value || !fs.existsSync(value)) return null;
  return JSON.parse(fs.readFileSync(value, 'utf8')) as LiveQaPersona;
}

export function liveQaLinksHandle(): string {
  return process.env.LIVE_QA_LINKS_HANDLE || 'alexchen';
}

/** Soft assert that the page is not an obvious Next/server error shell. */
export async function assertNotErrorShell(page: Page): Promise<void> {
  const body = (await page.locator('body').innerText()).toLowerCase();
  expect(body).not.toMatch(/application error|internal server error|uncaught|something went wrong/);
}

export async function gotoPath(page: Page, pathname: string): Promise<void> {
  const url = `${liveQaBaseUrl()}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}

/**
 * Prefer role/name intents. Fall back carefully — product must stay free of testids.
 */
export async function clickByName(page: Page, name: RegExp | string): Promise<void> {
  await page.getByRole('button', { name }).first().click();
}

export const test = base;

export { expect };
