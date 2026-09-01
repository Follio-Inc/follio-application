/**
 * Extension ↔ Follio API helpers.
 * Default API base is localhost in unpacked/dev; override in Options.
 */

const DEFAULT_API_BASE = 'http://localhost:3000';

export async function getApiBase() {
  const { apiBase } = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
  return String(apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
}

export async function apiFetch(path, options = {}) {
  const base = await getApiBase();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  return res;
}

export async function openSignIn() {
  const base = await getApiBase();
  await chrome.tabs.create({ url: `${base}/sign-in` });
}
