/**
 * Capture a Playwright storage state for Live QA.
 *
 * Uses Clerk sign-in tokens + window.Clerk ticket strategy when possible.
 * Falls back to headed manual sign-in.
 *
 * Usage:
 *   npm run live-qa:auth
 *   LIVE_QA_CLERK_USER_ID=user_xxx npm run live-qa:auth
 *   LIVE_QA_CLERK_EMAIL=you@example.com npm run live-qa:auth
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const envPath = path.join(cwd, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

const BASE_URL = (process.env.LIVE_QA_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const OUT = path.isAbsolute(process.env.LIVE_QA_STORAGE_STATE || '')
  ? /** @type {string} */ (process.env.LIVE_QA_STORAGE_STATE)
  : path.join(
      cwd,
      process.env.LIVE_QA_STORAGE_STATE || '_admin-panel/modules/developer/live-qa/.auth/user.json'
    );

async function clerkFetch(pathname, init) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error('CLERK_SECRET_KEY missing');
  const response = await fetch(`https://api.clerk.com/v1${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Clerk ${pathname} failed (${response.status})`);
  }
  return text ? JSON.parse(text) : null;
}

async function resolveUserId() {
  if (process.env.LIVE_QA_CLERK_USER_ID) return process.env.LIVE_QA_CLERK_USER_ID;
  const email = process.env.LIVE_QA_CLERK_EMAIL;
  if (email) {
    const users = await clerkFetch(`/users?email_address=${encodeURIComponent(email)}&limit=1`);
    const id = Array.isArray(users) ? users[0]?.id : users?.data?.[0]?.id;
    if (!id) throw new Error(`No Clerk user for email ${email}`);
    return id;
  }
  const users = await clerkFetch('/users?limit=20&order_by=-last_sign_in_at');
  const list = Array.isArray(users) ? users : users?.data || [];
  const pick =
    list.find(
      (u) => u.id && !String(u.id).includes('demo') && (u.email_addresses?.length || 0) > 0
    ) || list[0];
  if (!pick?.id) throw new Error('No Clerk users available for sign-in token');
  return pick.id;
}

function hasSessionCookie(cookies) {
  return cookies.some(
    (cookie) =>
      cookie.name.includes('session') ||
      cookie.name.startsWith('__session') ||
      cookie.name.startsWith('__client')
  );
}

async function trySignInToken() {
  const userId = await resolveUserId();
  const token = await clerkFetch('/sign_in_tokens', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
  });
  if (!token?.token) throw new Error('Clerk did not return a sign-in token');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(
    () => Boolean(window.Clerk && (window.Clerk.loaded || window.Clerk.client)),
    null,
    { timeout: 30_000 }
  );

  const result = await page.evaluate(async (ticket) => {
    const clerk = window.Clerk;
    if (!clerk?.client?.signIn) {
      return { ok: false, error: 'window.Clerk.client.signIn unavailable' };
    }
    try {
      const signIn = await clerk.client.signIn.create({
        strategy: 'ticket',
        ticket,
      });
      const sessionId = signIn.createdSessionId;
      if (!sessionId) {
        return {
          ok: false,
          error: `No session created (status=${signIn.status})`,
        };
      }
      await clerk.setActive({ session: sessionId });
      return { ok: true, sessionId };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, token.token);

  if (!result.ok) {
    await browser.close();
    throw new Error(result.error || 'Clerk ticket sign-in failed');
  }

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(1000);

  const cookies = await context.cookies();
  if (!hasSessionCookie(cookies)) {
    await browser.close();
    throw new Error('Ticket sign-in succeeded but no session cookie was set');
  }

  await context.storageState({ path: OUT });
  await browser.close();
  return userId;
}

async function manualSignIn() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'domcontentloaded' });
  console.log('\n>>> Sign in in the opened Chrome window, then return here.\n');
  console.log('Waiting up to 5 minutes for a signed-in app URL…\n');
  await page.waitForURL(
    (url) => {
      const href = url.toString();
      const onAuth =
        href.includes('sign-in') ||
        href.includes('sign-up') ||
        href.includes('accounts.') ||
        href.includes('clerk.');
      return !onAuth && href.startsWith(BASE_URL);
    },
    { timeout: 300_000 }
  );
  await context.storageState({ path: OUT });
  await browser.close();
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  if (process.env.CLERK_SECRET_KEY) {
    try {
      const userId = await trySignInToken();
      console.log(`Saved storage state → ${OUT} (token:${userId})`);
      return;
    } catch (error) {
      console.warn(`Automated Clerk token sign-in failed: ${error.message}`);
      if (process.env.LIVE_QA_AUTH_MANUAL === 'false') {
        throw error;
      }
      console.warn('Falling back to manual sign-in…');
    }
  }

  await manualSignIn();
  console.log(`Saved storage state → ${OUT} (manual)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
