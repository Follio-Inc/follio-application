import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { McpServer } from '@modelcontextprotocol/server';

// MCP APPS: THE UI PAGES (runs on our server)
//
// An MCP App is a tool plus a page. The tool says which page goes with it in
// `_meta.ui.resourceUri` (see `ui` in tools.ts). The page is a "resource": the host (claude.ai)
// asks for it by its ui:// address with resources/read, then shows it in a sandboxed iframe.
// Hosts that don't support MCP Apps (like Claude Code) ignore all of this and use the text.

/** The MIME type that tells hosts this resource is an MCP App page. */
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

export const RESUME_LIST_VIEW_URI = 'ui://follio/resume-list.html';

/** The `_meta` a tool needs to show a page. The second key is the older spelling some hosts read. */
// NOTE: toolUIMeta builds a label that gets attached to a tool, indicating that the tool has an MCP App page.
// in server.ts, the list_resumes tool has a _meta property that calls toolUIMeta, indicating that that tool has an MCP App page.
export function toolUiMeta(resourceUri: string): Record<string, unknown> {
  return { ui: { resourceUri }, 'ui/resourceUri': resourceUri };
}

// Built by `npm run build:mcp-apps` (scripts/build-mcp-apps.mjs). next.config.ts ships this folder
// with the /api/mcp function, because Next can't see a file that is only read at runtime.
const DIST_DIR = path.join(process.cwd(), 'lib/mcp/apps/dist');

/** The page's bundled script, or a stand-in that says the build step was skipped. */
// reads the built .js, used by resumeListViewHtml() below
function pageScript(name: string): string {
  try {
    // "</script" inside the script would end the <script> tag early, so escape it.
    return readFileSync(path.join(DIST_DIR, `${name}.js`), 'utf8').replace(
      /<\/script/gi,
      '<\\/script'
    );
  } catch {
    return `document.getElementById('app').textContent = 'This Follio view is not built yet. Run npm run build:mcp-apps.';`;
  }
}

// Our own colors, taken from the host's theme variables when it sends them (applyHostStyleVariables
// in the page), with Follio's fallbacks for hosts that don't.
const STYLES = `
  :root {
    color-scheme: light;
    --bg: var(--color-background-primary, #ffffff);
    --card: var(--color-background-secondary, #f6f6f4);
    --text: var(--color-text-primary, #1f1f1e);
    --muted: var(--color-text-secondary, #6b6a66);
    --border: var(--color-border-primary, #dedcd6);
    --accent: var(--color-ring-primary, #2563eb);
    --radius: var(--border-radius-lg, 10px);
    --danger: var(--color-text-danger, #b42318);
  }
  [data-theme='dark'] {
    color-scheme: dark;
    --bg: var(--color-background-primary, #262624);
    --card: var(--color-background-secondary, #30302e);
    --text: var(--color-text-primary, #f5f4ef);
    --muted: var(--color-text-secondary, #a6a39b);
    --border: var(--color-border-primary, #45443f);
    --accent: var(--color-ring-primary, #60a5fa);
    --danger: var(--color-text-danger, #f87171);
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; background: var(--bg); color: var(--text);
         font: 14px/1.5 var(--font-sans, system-ui, -apple-system, sans-serif); }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 20px 0 8px; }
  p { margin: 0 0 8px; }
  ul { margin: 4px 0 0; padding-left: 20px; }
  li { margin-bottom: 4px; }
  .muted { color: var(--muted); }
  .small { font-size: 12px; }
  .headline { font-weight: 600; margin-bottom: 2px; }
  .cards { display: grid; gap: 8px; margin-top: 12px;
           grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .card { display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 12px;
          border: 1px solid var(--border); border-radius: var(--radius); background: var(--card);
          color: inherit; font: inherit; cursor: pointer; }
  .card:hover, .card:focus-visible { border-color: var(--accent); outline: none; }
  .card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .badge { font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--border);
           color: var(--muted); white-space: nowrap; }
  .entry { margin-bottom: 14px; }
  .entry p { margin: 2px 0 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { padding: 2px 10px; border-radius: 999px; background: var(--card);
          border: 1px solid var(--border); font-size: 12px; }
  .link { border: 0; background: none; padding: 0; margin-bottom: 12px; color: var(--accent);
          cursor: pointer; font: inherit; }
  .notice { margin-top: 8px; padding: 8px 12px; border: 1px solid var(--border);
            border-radius: var(--radius); background: var(--card); }
  .button { padding: 6px 14px; border: 1px solid var(--border); border-radius: var(--radius);
            background: var(--bg); color: var(--text); font: inherit; cursor: pointer; }
  .button:disabled { opacity: 0.6; cursor: default; }
  .button.danger { color: var(--danger); border-color: var(--danger); }
  .button.danger.solid { background: var(--danger); color: #fff; }
  .danger-zone { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); }
  .confirm { padding: 12px; border: 1px solid var(--danger); border-radius: var(--radius); }
  .buttons { display: flex; gap: 8px; justify-content: flex-end; }
  .error { color: var(--danger); font-size: 12px; }
  .error:empty { display: none; }
  .detail-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
                margin-bottom: 12px; }
  .detail-top .link { margin-bottom: 0; }
  .open { display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
          text-align: right; max-width: 60%; }
  .open p { margin: 0; }
  .open p:empty { display: none; }
`;

/**
 * The whole page as one HTML string. The host loads it on its own, so the styles and the script
 * have to be inside it. It's read on every request, so a rebuild shows up without a restart.
 */
export function resumeListViewHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${STYLES}</style>
</head>
<body>
<div id="app"><p class="muted">Loading…</p></div>
<script>${pageScript('resume-list-view')}</script>
</body>
</html>`;
}

/** Registers every MCP App page, so hosts can fetch them with resources/read. */
export function registerFollioAppPages(server: McpServer) {
  server.registerResource(
    'Resume list view',
    RESUME_LIST_VIEW_URI,
    {
      title: 'Follio resumes',
      description:
        'Interactive list of the Follio resumes. Click one to view it, open it in Follio, or delete it.',
      mimeType: MCP_APP_MIME_TYPE,
    },
    async () => ({
      contents: [
        { uri: RESUME_LIST_VIEW_URI, mimeType: MCP_APP_MIME_TYPE, text: resumeListViewHtml() },
      ],
    })
  );
}
