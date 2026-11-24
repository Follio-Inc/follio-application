// Builds the MCP App pages (lib/mcp/apps/*-view.ts) into lib/mcp/apps/dist/.
//
// The page runs in the browser inside claude.ai's iframe, with no node_modules, so esbuild bundles
// each page and the ext-apps App class into one script. lib/mcp/apps/pages.ts puts that script
// inside the HTML. dist/ is gitignored; `npm run dev` and the builds run this first.

import { build } from 'esbuild';

const PAGES = ['resume-list-view'];

await build({
  entryPoints: PAGES.map((page) => `lib/mcp/apps/${page}.ts`),
  outdir: 'lib/mcp/apps/dist',
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  logLevel: 'info',
});
