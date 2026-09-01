import { apiFetch } from './api.js';

chrome.runtime.onInstalled.addListener(() => {
  // Default API base for local development; change in Options for production.
  chrome.storage.sync.get({ apiBase: null }, (data) => {
    if (!data.apiBase) {
      chrome.storage.sync.set({ apiBase: 'http://localhost:3000' });
    }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'FOLLIO_FETCH_RESUMES') {
    apiFetch('/api/extension/resumes')
      .then(async (res) => {
        if (res.status === 401) {
          sendResponse({ ok: false, status: 401, error: 'Unauthorized' });
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          sendResponse({ ok: false, status: res.status, error: data.error || 'Request failed' });
          return;
        }
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err?.message || 'Network error' });
      });
    return true;
  }

  if (message?.type === 'FOLLIO_MATCH_JD') {
    apiFetch('/api/extension/match-jd', {
      method: 'POST',
      body: JSON.stringify({
        jobDescription: message.jobDescription,
        pageUrl: message.pageUrl || null,
      }),
    })
      .then(async (res) => {
        if (res.status === 401) {
          sendResponse({ ok: false, status: 401, error: 'Unauthorized' });
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          sendResponse({
            ok: false,
            status: res.status,
            error: data.error || 'Match failed',
            details: data.details,
          });
          return;
        }
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err?.message || 'Network error' });
      });
    return true;
  }

  return false;
});
