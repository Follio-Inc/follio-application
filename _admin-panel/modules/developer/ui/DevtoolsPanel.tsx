'use client';

import { useEffect, useMemo, useState } from 'react';

import { QUICK_LINKS } from '../links';
import { SMOKE_ITEMS } from '../smoke';
import { TEST_SUITES } from '../suites-catalog';
import type { DevtoolsStatus, HealthReport, TestRunResult } from '../types';
import { LiveQaTab } from './LiveQaTab';
import { DEVTOOLS_CSS } from './styles';
import { useSmokeCompletion } from './use-devtools';

type TabId = 'health' | 'suites' | 'live-qa' | 'smoke' | 'links';

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

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="fdx-badge" data-status={status}>
      {status}
    </span>
  );
}

function HealthTab() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [status, setStatus] = useState<DevtoolsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [health, runtime] = await Promise.all([
        fetchJson<HealthReport>('/api/admin/developer/health'),
        fetchJson<DevtoolsStatus>('/api/admin/developer/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pathname: window.location.pathname }),
        }),
      ]);
      setReport(health);
      setStatus(runtime);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [health, runtime] = await Promise.all([
          fetchJson<HealthReport>('/api/admin/developer/health'),
          fetchJson<DevtoolsStatus>('/api/admin/developer/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pathname: window.location.pathname }),
          }),
        ]);
        if (cancelled) return;
        setReport(health);
        setStatus(runtime);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load health');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="fdx-actions">
        <button
          type="button"
          className="fdx-btn fdx-btn-primary"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? 'Checking…' : 'Refresh health'}
        </button>
        {report ? <StatusBadge status={report.overall} /> : null}
      </div>
      {error ? <div className="fdx-error">{error}</div> : null}
      {status ? (
        <div className="fdx-group">
          <div className="fdx-group-title">Runtime</div>
          <div className="fdx-row">
            <div>
              <div className="fdx-label">NODE_ENV</div>
              <div className="fdx-detail">{status.nodeEnv}</div>
            </div>
          </div>
          <div className="fdx-row">
            <div>
              <div className="fdx-label">Path</div>
              <div className="fdx-detail">{status.pathnameHint ?? '—'}</div>
            </div>
          </div>
          <div className="fdx-row">
            <div>
              <div className="fdx-label">Features</div>
              <div className="fdx-detail">
                {Object.entries(status.features)
                  .map(([key, value]) => `${key}: ${value ? 'on' : 'off'}`)
                  .join(' · ')}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {report ? (
        <div className="fdx-group">
          <div className="fdx-group-title">
            Checks · {new Date(report.checkedAt).toLocaleTimeString()}
          </div>
          {report.checks.map((check) => (
            <div key={check.id} className="fdx-row">
              <div>
                <div className="fdx-label">{check.label}</div>
                <div className="fdx-detail">{check.detail}</div>
              </div>
              <StatusBadge status={check.status} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SuitesTab() {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [result, setResult] = useState<TestRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (suiteId: string) => {
    setRunningId(suiteId);
    setError(null);
    setResult(null);
    try {
      const next = await fetchJson<TestRunResult>('/api/admin/developer/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suiteId }),
      });
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test run failed');
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div>
      <p className="fdx-muted" style={{ marginTop: 0 }}>
        Invokes Vitest locally via the Next.js server. Use after agent changes instead of
        re-checking every screen by hand.
      </p>
      {TEST_SUITES.map((suite) => (
        <div key={suite.id} className="fdx-row">
          <div>
            <div className="fdx-label">{suite.label}</div>
            <div className="fdx-detail">{suite.description}</div>
          </div>
          <button
            type="button"
            className="fdx-btn fdx-btn-primary"
            disabled={runningId !== null}
            onClick={() => void run(suite.id)}
          >
            {runningId === suite.id ? 'Running…' : 'Run'}
          </button>
        </div>
      ))}
      {error ? <div className="fdx-error">{error}</div> : null}
      {result ? (
        <div className="fdx-group" style={{ marginTop: 12 }}>
          <div className="fdx-actions">
            <StatusBadge status={result.ok ? 'ok' : 'fail'} />
            <span className="fdx-muted">
              {result.suiteId} · {(result.durationMs / 1000).toFixed(1)}s · exit{' '}
              {result.exitCode ?? '—'}
            </span>
          </div>
          <pre className="fdx-pre">
            {[result.stdout, result.stderr].filter(Boolean).join('\n\n') || '(no output)'}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function SmokeTab() {
  const { done, mark, reset } = useSmokeCompletion();
  const completed = SMOKE_ITEMS.filter((item) => done[item.id]).length;

  const byArea = useMemo(() => {
    const map = new Map<string, typeof SMOKE_ITEMS>();
    for (const item of SMOKE_ITEMS) {
      const list = map.get(item.area) ?? [];
      list.push(item);
      map.set(item.area, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <div>
      <div className="fdx-actions">
        <span className="fdx-muted">
          {completed}/{SMOKE_ITEMS.length} checked
        </span>
        <button type="button" className="fdx-btn" onClick={reset}>
          Reset
        </button>
      </div>
      {byArea.map(([area, items]) => (
        <div key={area} className="fdx-group">
          <div className="fdx-group-title">{area}</div>
          {items.map((item) => (
            <div key={item.id} className="fdx-row">
              <label className="fdx-check">
                <input
                  type="checkbox"
                  checked={Boolean(done[item.id])}
                  onChange={(event) => mark(item.id, event.target.checked)}
                />
                <span>
                  <div className="fdx-label">{item.title}</div>
                  <div className="fdx-detail">{item.verify}</div>
                  <a className="fdx-link" href={item.href}>
                    Open {item.href}
                  </a>
                </span>
              </label>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function LinksTab() {
  const byGroup = useMemo(() => {
    const map = new Map<string, typeof QUICK_LINKS>();
    for (const link of QUICK_LINKS) {
      const list = map.get(link.group) ?? [];
      list.push(link);
      map.set(link.group, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <div>
      {byGroup.map(([group, links]) => (
        <div key={group} className="fdx-group">
          <div className="fdx-group-title">{group}</div>
          {links.map((link) => (
            <div key={link.id} className="fdx-row">
              <div className="fdx-label">{link.label}</div>
              <a className="fdx-link" href={link.href}>
                {link.href}
              </a>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function DevtoolsPanel() {
  const [tab, setTab] = useState<TabId>('health');

  return (
    <div className="fdx-root">
      <style dangerouslySetInnerHTML={{ __html: DEVTOOLS_CSS }} />
      <div className="fdx-page">
        <div className="fdx-header">
          <div>
            <div className="fdx-title">Developer</div>
            <div className="fdx-subtitle">
              Health, Vitest suites, Live QA pathways, and smoke — admin panel (not product UI)
            </div>
          </div>
        </div>
        <div className="fdx-tabs" role="tablist">
          {(
            [
              ['health', 'Health'],
              ['suites', 'Suites'],
              ['live-qa', 'Live QA'],
              ['smoke', 'Smoke'],
              ['links', 'Links'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="fdx-tab"
              data-active={tab === id}
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="fdx-body">
          {tab === 'health' ? <HealthTab /> : null}
          {tab === 'suites' ? <SuitesTab /> : null}
          {tab === 'live-qa' ? <LiveQaTab /> : null}
          {tab === 'smoke' ? <SmokeTab /> : null}
          {tab === 'links' ? <LinksTab /> : null}
        </div>
      </div>
    </div>
  );
}
