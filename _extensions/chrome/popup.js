import { getApiBase, openSignIn } from './api.js';

const els = {
  authGate: document.getElementById('auth-gate'),
  status: document.getElementById('status'),
  resumeList: document.getElementById('resume-list'),
  matchResults: document.getElementById('match-results'),
  jdMeta: document.getElementById('jd-meta'),
  btnMatch: document.getElementById('btn-match'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnSignIn: document.getElementById('btn-signin'),
  openFollio: document.getElementById('open-follio'),
};

let resumeCache = null;

function setStatus(text) {
  els.status.textContent = text || '';
}

function showAuth(show) {
  els.authGate.classList.toggle('hidden', !show);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendRuntime(message) {
  return chrome.runtime.sendMessage(message);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function extractJdFromActiveTab() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return { ok: false, error: 'No active tab' };
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'FOLLIO_EXTRACT_JD' });
    if (response?.ok) return { ok: true, data: response.data, tab };
  } catch {
    // Content script may not be injected yet (e.g. chrome:// pages or fresh load).
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'FOLLIO_EXTRACT_JD' });
    if (response?.ok) return { ok: true, data: response.data, tab };
    return { ok: false, error: response?.error || 'Could not read page' };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'This page cannot be read (try a normal http/https job posting).',
    };
  }
}

function renderResumes(data) {
  resumeCache = data;
  const resumes = data?.resumes || [];
  els.openFollio.href = data?.appUrl || '#';

  if (resumes.length === 0) {
    els.resumeList.innerHTML =
      '<p class="empty">No resumes yet. Create one in Follio, then refresh.</p>';
    return;
  }

  els.resumeList.innerHTML = resumes
    .map((r) => {
      const title = escapeHtml(r.resumeTitle || 'Untitled Resume');
      const headline = escapeHtml(r.headline || '');
      const badges = [r.isActive ? 'Active' : null, r.isPrimary ? 'Portfolio' : null]
        .filter(Boolean)
        .join(' · ');

      return `<article class="card" data-id="${escapeHtml(r.id)}">
        <h3 class="card-title">${title}</h3>
        <p class="card-sub">${badges ? `${escapeHtml(badges)} · ` : ''}${headline || escapeHtml(r.handle)}</p>
        <div class="card-actions">
          <a class="primary" href="${escapeHtml(r.viewUrl)}" target="_blank" rel="noreferrer">View PDF</a>
          <a href="${escapeHtml(r.downloadUrl)}" target="_blank" rel="noreferrer" download>Download</a>
          <a href="${escapeHtml(r.openInFollioUrl)}" target="_blank" rel="noreferrer">Manage</a>
        </div>
      </article>`;
    })
    .join('');
}

function renderMatches(payload) {
  const results = payload?.results || [];
  const hint = payload?.jobTitleHint;
  els.jdMeta.textContent = hint
    ? `Scored against: ${hint}`
    : payload?.jdPreview
      ? `Scored against page text (${payload.jdPreview.slice(0, 80)}…)`
      : '';

  if (results.length === 0) {
    els.matchResults.innerHTML =
      '<p class="empty">No resumes to score. Add a resume in Follio first.</p>';
    return;
  }

  els.matchResults.innerHTML = results
    .map((r) => {
      const matched = (r.matchedSkills || [])
        .slice(0, 6)
        .map((s) => `<span class="chip">${escapeHtml(s)}</span>`)
        .join('');
      const missing = (r.missingKeywords || [])
        .slice(0, 5)
        .map((s) => `<span class="chip missing">${escapeHtml(s)}</span>`)
        .join('');

      const resume = (resumeCache?.resumes || []).find((x) => x.id === r.resumeId);
      const view = resume?.viewUrl
        ? `<a href="${escapeHtml(resume.viewUrl)}" target="_blank" rel="noreferrer">View PDF</a>`
        : '';

      return `<article class="card">
        <div class="row between">
          <h3 class="card-title">${escapeHtml(r.resumeTitle)}</h3>
          <span class="band ${escapeHtml(r.band)}"><span class="score">${r.score}</span> · ${escapeHtml(r.label)}</span>
        </div>
        <p class="card-sub">${escapeHtml(r.summary)}</p>
        ${matched || missing ? `<div class="chips">${matched}${missing}</div>` : ''}
        <div class="card-actions">${view}</div>
      </article>`;
    })
    .join('');
}

async function loadResumes() {
  setStatus('Loading resumes…');
  const res = await sendRuntime({ type: 'FOLLIO_FETCH_RESUMES' });
  if (!res?.ok) {
    if (res?.status === 401) {
      showAuth(true);
      setStatus('Sign in required.');
      els.resumeList.innerHTML = '';
      return;
    }
    showAuth(false);
    setStatus(res?.error || 'Could not load resumes.');
    return;
  }

  showAuth(false);
  renderResumes(res.data);
  setStatus(`${res.data.resumes.length} resume${res.data.resumes.length === 1 ? '' : 's'}`);
}

async function runMatch() {
  els.btnMatch.disabled = true;
  setStatus('Reading job description on this page…');

  const extracted = await extractJdFromActiveTab();
  if (!extracted.ok) {
    setStatus(extracted.error);
    els.btnMatch.disabled = false;
    return;
  }

  const { text, looksLikeJd, pageUrl, pageTitle } = extracted.data;
  if (!text || text.length < 40) {
    setStatus('Not enough text on this page to score against.');
    els.btnMatch.disabled = false;
    return;
  }

  if (!looksLikeJd) {
    setStatus('This page may not be a job posting — scoring with best-effort page text…');
  } else {
    setStatus(`Scoring resumes against “${pageTitle || 'this page'}”…`);
  }

  const res = await sendRuntime({
    type: 'FOLLIO_MATCH_JD',
    jobDescription: text,
    pageUrl,
  });

  els.btnMatch.disabled = false;

  if (!res?.ok) {
    if (res?.status === 401) {
      showAuth(true);
      setStatus('Sign in required.');
      return;
    }
    setStatus(res?.error || 'Match failed.');
    return;
  }

  renderMatches(res.data);
  const top = res.data.results?.[0];
  setStatus(
    top ? `Best fit: ${top.resumeTitle} (${top.label.toLowerCase()}, ${top.score})` : 'Done.'
  );
}

els.btnSignIn.addEventListener('click', () => openSignIn());
els.btnRefresh.addEventListener('click', () => loadResumes());
els.btnMatch.addEventListener('click', () => runMatch());

(async function init() {
  const base = await getApiBase();
  els.openFollio.href = base;
  await loadResumes();
})();
