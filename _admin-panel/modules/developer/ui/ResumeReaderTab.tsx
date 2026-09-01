'use client';

import { useCallback, useEffect, useState } from 'react';

import type { ResumeReaderCatalog, ResumeReaderRunResult } from '../ai';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function ResumeReaderTab() {
  const [catalog, setCatalog] = useState<ResumeReaderCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixtureId, setFixtureId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ResumeReaderRunResult | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchJson<ResumeReaderCatalog>('/api/admin/developer/ai/resume-reader');
      setCatalog(next);
      setFixtureId((id) => id || next.defaults.fixtureId || next.fixtures[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load resume reader catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async () => {
    if (!catalog) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      if (file) {
        form.append('file', file);
      } else if (fixtureId) {
        form.append('fixtureId', fixtureId);
      } else {
        throw new Error('Upload a PDF or choose a fixture.');
      }
      const next = await fetchJson<ResumeReaderRunResult>('/api/admin/developer/ai/resume-reader', {
        method: 'POST',
        body: form,
      });
      setResult(next);
      if (!next.ok) {
        setError(next.error || 'Resume read failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resume read failed');
    } finally {
      setRunning(false);
    }
  };

  if (loading && !catalog) {
    return <p className="fdx-muted">Loading resume reader…</p>;
  }

  const summary = result?.summary;

  return (
    <div>
      <p className="fdx-muted" style={{ marginTop: 0 }}>
        Calls the same Follio service as onboarding / builder import (
        <code>importResumeWithAI</code>). Parse only — never writes a profile. Local only (
        <code>DEVTOOLS_ENABLED=true</code> + <code>OPENAI_API_KEY</code>).
      </p>

      {catalog ? (
        <div className="fdx-group">
          <div className="fdx-group-title">Input</div>
          <div className="fdx-row">
            <div>
              <div className="fdx-label">AI parser</div>
              <div className="fdx-detail">
                {catalog.defaults.aiAvailable ? 'OPENAI_API_KEY present' : 'OPENAI_API_KEY missing'}
              </div>
            </div>
            <span className="fdx-badge" data-status={catalog.defaults.aiAvailable ? 'ok' : 'fail'}>
              {catalog.defaults.aiAvailable ? 'ready' : 'unavailable'}
            </span>
          </div>
          <div className="fdx-row">
            <div>
              <div className="fdx-label">Save to profile</div>
              <div className="fdx-detail">Disabled in this lab</div>
            </div>
            <span className="fdx-badge" data-status="ok">
              off
            </span>
          </div>
          <div className="fdx-row">
            <label className="fdx-check">
              <span className="fdx-label">Fixture PDF</span>
              <select
                className="fdx-select"
                value={fixtureId}
                disabled={running || Boolean(file)}
                onChange={(event) => setFixtureId(event.target.value)}
              >
                {catalog.fixtures.map((fixture) => (
                  <option key={fixture.id} value={fixture.id}>
                    {fixture.label} ({fixture.source})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="fdx-row">
            <label className="fdx-check">
              <span className="fdx-label">Or upload PDF</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={running}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {file ? (
            <div className="fdx-row">
              <div className="fdx-detail">
                Using upload: {file.name} ({Math.round(file.size / 1024)} KB). Clear to use the
                fixture instead.
              </div>
              <button
                type="button"
                className="fdx-btn"
                disabled={running}
                onClick={() => setFile(null)}
              >
                Clear file
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="fdx-actions">
        <button
          type="button"
          className="fdx-btn fdx-btn-primary"
          disabled={running || !catalog?.defaults.aiAvailable || (!file && !fixtureId)}
          onClick={() => void run()}
        >
          {running ? 'Reading…' : 'Read resume'}
        </button>
        <button type="button" className="fdx-btn" disabled={running} onClick={() => void refresh()}>
          Refresh catalog
        </button>
      </div>

      {error ? <div className="fdx-error">{error}</div> : null}

      {result ? (
        <div className="fdx-group" style={{ marginTop: 12 }}>
          <div className="fdx-actions">
            <span className="fdx-badge" data-status={result.ok ? 'ok' : 'fail'}>
              {result.ok ? 'ok' : 'fail'}
            </span>
            <span className="fdx-muted">
              {result.source.label} · {(result.durationMs / 1000).toFixed(1)}s
              {summary ? ` · confidence ${Math.round(summary.confidence * 100)}%` : ''}
            </span>
          </div>

          {summary ? (
            <div className="fdx-group">
              <div className="fdx-group-title">Extracted</div>
              <div className="fdx-row">
                <div>
                  <div className="fdx-label">{summary.name || 'No name'}</div>
                  <div className="fdx-detail">
                    {[summary.headline, summary.email, summary.location]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </div>
                </div>
              </div>
              <div className="fdx-row">
                <div className="fdx-detail">
                  {summary.experiences} experiences · {summary.educations} education ·{' '}
                  {summary.skills} skills · {summary.projects} projects · {summary.links} links ·{' '}
                  {summary.certifications} certs
                </div>
                <span className="fdx-muted">{summary.model}</span>
              </div>
            </div>
          ) : null}

          <pre className="fdx-pre" style={{ maxHeight: 480 }}>
            {JSON.stringify(
              {
                ok: result.ok,
                message: result.message,
                error: result.error,
                source: result.source,
                savedToProfile: result.savedToProfile,
                summary: result.summary,
                data: result.data,
              },
              null,
              2
            )}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
