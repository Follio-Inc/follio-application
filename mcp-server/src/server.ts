/**
 * Server composition.
 *
 * Separate from `index.ts` so tests can build a server without starting a
 * transport. `index.ts` stays an entry point: build, then serve.
 */

import { McpServer } from '@modelcontextprotocol/server';

import { registerGetPortfolio } from './tools/get-portfolio.js';
import { registerHelloFollio } from './tools/hello-follio.js';

export const SERVER_NAME = 'follio-mcp';
export const SERVER_VERSION = '1.1.0';

/** Every tool this server registers, in registration order. */
export const TOOL_NAMES = ['hello_follio', 'get_portfolio'] as const;

export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerHelloFollio(server);
  registerGetPortfolio(server);

  return server;
}
