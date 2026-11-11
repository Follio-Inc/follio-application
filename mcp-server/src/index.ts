/**
 * Follio MCP server — stdio entry point.
 *
 * Claude Code launches this file as `follio-local`. Keep it thin: tools live
 * in `src/tools/`, composition in `src/server.ts`.
 *
 * Logging goes to stderr only. stdout carries the JSON-RPC stream, so writing
 * to it would corrupt the protocol.
 */

import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { createServer } from './server.js';

void serveStdio(createServer);

console.error('Follio MCP server started.');
