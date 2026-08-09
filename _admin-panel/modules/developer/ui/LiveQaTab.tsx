'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { LiveQaCatalog, LiveQaPathway, LiveQaRunResult } from '../live-qa/types';

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

export function LiveQaTab() {
  const [catalog, setCatalog] = useState<LiveQaCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [resumeFixtureId, setResumeFixtureId] = useState('alex-morgan');
  const [personaFixtureId, setPersonaFixtureId] = useState('jordan-park');
  const [headed, setHeaded] = useState(false);
  const [triageWithAi, setTriageWithAi] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LiveQaRunResult | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchJson<LiveQaCatalog>('/api/admin/developer/live-qa/catalog');
      setCatalog(next);
      setSelected((prev) => {
        const draft = { ...prev };
        for (const pathway of next.pathways) {
          if (draft[pathway.id] === undefined) {
            draft[pathway.id] = pathway.stability === 'stable';
          }
        }
        return draft;
      });
      if (next.resumes[0]) setResumeFixtureId((id) => id || next.resumes[0].id);
      if (next.personas[0]) setPersonaFixtureId((id) => id || next.personas[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Live QA catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const byArea = useMemo(() => {
    const map = new Map<string, LiveQaPathway[]>();
    for (const pathway of catalog?.pathways ?? []) {
      const list = map.get(pathway.area) ?? [];
      list.push(pathway);
      map.set(pathway.area, list);
    }
    return [...map.entries()];
  }, [catalog]);

  const selectedIds = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, on]) => on)
        .map(([id]) => id),
    [selected]
  );

  const run = async (pathwayIds: string[]) => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const next = await fetchJson<LiveQaRunResult>('/api/admin/developer/live-qa/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pathwayIds,
          resumeFixtureId,
          personaFixtureId,
          headed,
          triageWithAi,
          baseUrl: catalog?.defaults.baseUrl,
        }),
      });
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Live QA run failed');
    } finally {
      setRunning(false);
    }
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/admin/developer/live-qa/fixtures/upload', {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const fixture = (await response.json()) as { id: string };
      await refresh();
      setResumeFixtureId(fixture.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading && !catalog) {
    return <p className="fdx-muted">Loading Live QA catalog…</p>;
  }

  return (
    <div>
      <p className="fdx-muted" style={{ marginTop: 0 }}>
        Runs real browser pathways against a live Follio instance. Local only (
        <code>DEVTOOLS_ENABLED=true</code>). Auth pathways need <code>LIVE_QA_STORAGE_STATE</code>.
        AI triage uses <code>ANTHROPIC_API_KEY</code> or <code>OPENAI_API_KEY</code> when present.
      </p>

      {catalog ? (
        <div className="fdx-group">
          <div className="fdx-group-title">Run config</div>
          <div className="fdx-row">
            <div>
              <div className="fdx-label">Base URL</div>
              <div className="fdx-detail">{catalog.defaults.baseUrl}</div>
            </div>
            <span
              className="fdx-badge"
              data-status={catalog.defaults.storageStateConfigured ? 'ok' : 'warn'}
            >
              auth {catalog.defaults.storageStateConfigured ? 'ready' : 'missing'}
            </span>
          </div>
          <div className="fdx-row">
            <div>
              <div className="fdx-label">AI triage</div>
              <div className="fdx-detail">
                {catalog.defaults.aiTriageAvailable ? 'Anthropic available' : 'No API key'}
              </div>
            </div>
            <span
              className="fdx-badge"
              data-status={catalog.defaults.aiTriageAvailable ? 'ok' : 'warn'}
            >
              {catalog.defaults.aiTriageAvailable ? 'on' : 'off'}
            </span>
          </div>
          <div className="fdx-row">
            <label className="fdx-check">
              <span className="fdx-label">Resume PDF</span>
              <select
                className="fdx-select"
                value={resumeFixtureId}
                onChange={(event) => setResumeFixtureId(event.target.value)}
              >
                {catalog.resumes.map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.label} ({resume.source})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="fdx-row">
            <label className="fdx-check">
              <span className="fdx-label">Blank persona</span>
              <select
                className="fdx-select"
                value={personaFixtureId}
                onChange={(event) => setPersonaFixtureId(event.target.value)}
              >
                {catalog.personas.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {persona.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="fdx-row">
            <label className="fdx-check">
              <input
                type="checkbox"
                checked={headed}
                onChange={(event) => setHeaded(event.target.checked)}
              />
              <span className="fdx-label">Headed browser</span>
            </label>
            <label className="fdx-check">
              <input
                type="checkbox"
                checked={triageWithAi}
                onChange={(event) => setTriageWithAi(event.target.checked)}
              />
              <span className="fdx-label">AI triage on failure</span>
            </label>
          </div>
          <div className="fdx-row">
            <label className="fdx-check">
              <span className="fdx-label">Upload PDF to pool</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={uploading || running}
                onChange={(event) => void onUpload(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="fdx-actions" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="fdx-btn fdx-btn-primary"
          disabled={running || selectedIds.length === 0}
          onClick={() => void run(selectedIds)}
        >
          {running ? 'Running…' : `Run selected (${selectedIds.length})`}
        </button>
        <button
          type="button"
          className="fdx-btn"
          disabled={running}
          onClick={() => {
            const stable = (catalog?.pathways ?? [])
              .filter((pathway) => pathway.stability === 'stable')
              .map((pathway) => pathway.id);
            void run(stable);
          }}
        >
          Run stable smoke
        </button>
        <button type="button" className="fdx-btn" disabled={running} onClick={() => void refresh()}>
          Refresh catalog
        </button>
      </div>

      {byArea.map(([area, pathways]) => (
        <div key={area} className="fdx-group">
          <div className="fdx-group-title">{area}</div>
          {pathways.map((pathway) => (
            <div key={pathway.id} className="fdx-row" style={{ alignItems: 'flex-start' }}>
              <label className="fdx-check" style={{ flex: 1 }}>
                <input
                  type="checkbox"
                  checked={Boolean(selected[pathway.id])}
                  onChange={(event) =>
                    setSelected((prev) => ({ ...prev, [pathway.id]: event.target.checked }))
                  }
                />
                <span>
                  <div className="fdx-label">
                    {pathway.title}{' '}
                    <span className="fdx-muted">
                      · {pathway.stability}
                      {pathway.requiresAuth ? ' · auth' : ''}
                      {pathway.fixtureKind !== 'none' ? ` · ${pathway.fixtureKind}` : ''}
                    </span>
                  </div>
                  <div className="fdx-detail">{pathway.description}</div>
                  <div className="fdx-detail" style={{ marginTop: 4 }}>
                    {pathway.intents.map((intent) => (
                      <div key={intent}>• {intent}</div>
                    ))}
                  </div>
                </span>
              </label>
              <button
                type="button"
                className="fdx-btn"
                disabled={running}
                onClick={() => void run([pathway.id])}
              >
                Run
              </button>
            </div>
          ))}
        </div>
      ))}

      {error ? <div className="fdx-error">{error}</div> : null}

      {result ? (
        <div className="fdx-group" style={{ marginTop: 12 }}>
          <div className="fdx-actions">
            <span className="fdx-badge" data-status={result.ok ? 'ok' : 'fail'}>
              {result.ok ? 'ok' : 'fail'}
            </span>
            <span className="fdx-muted">
              {(result.durationMs / 1000).toFixed(1)}s · exit {result.exitCode ?? '—'} ·{' '}
              {result.baseUrl}
            </span>
          </div>
          {result.results.map((item) => (
            <div key={item.pathwayId} className="fdx-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div className="fdx-label">{item.pathwayId}</div>
                <div className="fdx-detail">{item.summary}</div>
                {item.triage ? (
                  <div className="fdx-detail" style={{ marginTop: 6 }}>
                    <strong>AI:</strong> {item.triage.likelyCause}
                    <br />
                    <strong>Fix:</strong> {item.triage.suggestedFix}
                    {item.triage.notes ? (
                      <>
                        <br />
                        <span className="fdx-muted">{item.triage.notes}</span>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <span className="fdx-badge" data-status={item.ok ? 'ok' : 'fail'}>
                {item.ok ? 'ok' : 'fail'}
              </span>
            </div>
          ))}
          {result.artifactsDir ? (
            <div className="fdx-detail">Artifacts: {result.artifactsDir}</div>
          ) : null}
          <pre className="fdx-pre">
            {[result.stdout, result.stderr].filter(Boolean).join('\n\n') || '(no output)'}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
