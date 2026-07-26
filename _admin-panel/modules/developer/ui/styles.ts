/**
 * Self-contained page styles — do not depend on Follio product CSS.
 * Scoped under .fdx so collisions with the app are unlikely.
 */

export const DEVTOOLS_CSS = `
.fdx-root {
  --fdx-bg: transparent;
  --fdx-panel: #171d25;
  --fdx-border: #2a3441;
  --fdx-text: #e7ecf2;
  --fdx-muted: #8b98a8;
  --fdx-accent: #3d9cf0;
  --fdx-ok: #3ecf8e;
  --fdx-warn: #e6b84d;
  --fdx-fail: #f07178;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  color: var(--fdx-text);
  box-sizing: border-box;
  min-height: 100%;
  background: #0f1419;
  border-radius: 0;
}

.fdx-root *,
.fdx-root *::before,
.fdx-root *::after {
  box-sizing: border-box;
}

.fdx-page {
  max-width: 760px;
  margin: 0;
  padding: 24px 24px 40px;
}

.fdx-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--fdx-border);
  margin-bottom: 0;
}

.fdx-title {
  font-size: 22px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.fdx-subtitle {
  color: var(--fdx-muted);
  font-size: 13px;
  margin-top: 4px;
}

.fdx-back {
  color: var(--fdx-accent);
  text-decoration: none;
  font-size: 13px;
  white-space: nowrap;
  padding-top: 4px;
}

.fdx-back:hover {
  text-decoration: underline;
}

.fdx-tabs {
  display: flex;
  gap: 2px;
  padding: 12px 0 0;
  border-bottom: 1px solid var(--fdx-border);
  margin-bottom: 16px;
}

.fdx-tab {
  border: none;
  background: transparent;
  color: var(--fdx-muted);
  padding: 10px 12px;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  font-size: 13px;
}

.fdx-tab[data-active='true'] {
  color: var(--fdx-text);
  background: var(--fdx-panel);
  border: 1px solid var(--fdx-border);
  border-bottom-color: var(--fdx-panel);
  margin-bottom: -1px;
}

.fdx-body {
  background: var(--fdx-panel);
  border: 1px solid var(--fdx-border);
  border-radius: 12px;
  padding: 16px 18px;
}

.fdx-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(42, 52, 65, 0.7);
}

.fdx-row:last-child {
  border-bottom: none;
}

.fdx-label {
  font-weight: 560;
}

.fdx-detail {
  color: var(--fdx-muted);
  font-size: 13px;
  margin-top: 2px;
}

.fdx-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
}

.fdx-badge[data-status='ok'] {
  color: var(--fdx-ok);
  border-color: rgba(62, 207, 142, 0.35);
  background: rgba(62, 207, 142, 0.1);
}

.fdx-badge[data-status='warn'] {
  color: var(--fdx-warn);
  border-color: rgba(230, 184, 77, 0.35);
  background: rgba(230, 184, 77, 0.1);
}

.fdx-badge[data-status='fail'] {
  color: var(--fdx-fail);
  border-color: rgba(240, 113, 120, 0.35);
  background: rgba(240, 113, 120, 0.1);
}

.fdx-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.fdx-btn {
  border: 1px solid var(--fdx-border);
  background: #1d2631;
  color: var(--fdx-text);
  border-radius: 8px;
  padding: 7px 10px;
  cursor: pointer;
}

.fdx-btn:hover:not(:disabled) {
  border-color: var(--fdx-accent);
}

.fdx-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fdx-btn-primary {
  background: rgba(61, 156, 240, 0.18);
  border-color: rgba(61, 156, 240, 0.45);
}

.fdx-pre {
  margin: 0;
  padding: 10px;
  border-radius: 10px;
  background: #0b0f14;
  border: 1px solid var(--fdx-border);
  color: #c9d4e0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
}

.fdx-group {
  margin-bottom: 14px;
}

.fdx-group-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fdx-muted);
  margin-bottom: 6px;
}

.fdx-link {
  color: var(--fdx-accent);
  text-decoration: none;
}

.fdx-link:hover {
  text-decoration: underline;
}

.fdx-check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.fdx-check input {
  margin-top: 3px;
}

.fdx-muted {
  color: var(--fdx-muted);
}

.fdx-error {
  color: var(--fdx-fail);
  margin-bottom: 10px;
}
`;
