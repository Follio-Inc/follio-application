/**
 * End-to-end MCP protocol test.
 *
 * Spawns the compiled server exactly as Claude Code launches it
 * (`node dist/index.js`) and speaks newline-delimited JSON-RPC over stdio:
 * initialize -> tools/list -> tools/call. This is the only test here that
 * exercises the real SDK, the real transport and the real registrations.
 *
 * Requires `npm run build` first; the test says so rather than failing
 * obscurely if dist is missing.
 */

import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SERVER_ENTRY = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const PROTOCOL_VERSION = '2025-06-18';
const REPLY_TIMEOUT_MS = 15_000;

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

interface ToolListing {
  name: string;
  description?: string;
  inputSchema?: { type?: string; properties?: Record<string, unknown>; required?: string[] };
  annotations?: Record<string, unknown>;
}

interface ToolCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

/** A live server process plus a request/response helper over its stdio. */
class ServerHarness {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = '';
  private nextId = 1;
  private readonly pending = new Map<number, (response: JsonRpcResponse) => void>();
  readonly stderr: string[] = [];

  constructor() {
    this.child = spawn(process.execPath, [SERVER_ENTRY], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.consume(chunk));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk: string) => this.stderr.push(chunk));
  }

  /** Split the stdout stream on newlines and settle whatever each line answers. */
  private consume(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line.length > 0) {
        const message = JSON.parse(line) as JsonRpcResponse;
        const resolve = this.pending.get(message.id);
        if (resolve) {
          this.pending.delete(message.id);
          resolve(message);
        }
      }
      newline = this.buffer.indexOf('\n');
    }
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0' as const, id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timed out waiting for a reply to ${method}`));
      }, REPLY_TIMEOUT_MS);

      this.pending.set(id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });

      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  notify(method: string, params: Record<string, unknown> = {}): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  async close(): Promise<void> {
    this.child.stdin.end();
    this.child.kill();
  }
}

/** Unwrap a successful result, failing with the JSON-RPC error if there is one. */
function resultOf(response: JsonRpcResponse): Record<string, unknown> {
  assert.equal(
    response.error,
    undefined,
    `expected a result, got error: ${JSON.stringify(response.error)}`
  );
  assert.ok(response.result, 'expected a result body');
  return response.result;
}

async function callTool(
  server: ServerHarness,
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const response = await server.send('tools/call', { name, arguments: args });
  return resultOf(response) as unknown as ToolCallResult;
}

describe('MCP protocol over stdio', () => {
  let server: ServerHarness;

  before(async () => {
    assert.ok(
      existsSync(SERVER_ENTRY),
      `missing ${SERVER_ENTRY} — run \`npm run build\` before the tests`
    );
    server = new ServerHarness();

    const initialize = await server.send('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'follio-protocol-test', version: '1.0.0' },
    });
    const result = resultOf(initialize);
    assert.equal((result.serverInfo as { name: string }).name, 'follio-mcp');
    assert.ok(result.capabilities, 'expected capabilities');

    server.notify('notifications/initialized');
  });

  after(async () => {
    await server?.close();
  });

  it('answers ping', async () => {
    resultOf(await server.send('ping'));
  });

  it('discovers both tools', async () => {
    const result = resultOf(await server.send('tools/list'));
    const tools = result.tools as ToolListing[];
    const names = tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, ['get_portfolio', 'hello_follio']);
  });

  it('advertises get_portfolio as read-only with an optional handle', async () => {
    const result = resultOf(await server.send('tools/list'));
    const tools = result.tools as ToolListing[];
    const portfolio = tools.find((tool) => tool.name === 'get_portfolio');
    assert.ok(portfolio, 'get_portfolio must be advertised');
    assert.equal(portfolio.annotations?.readOnlyHint, true);
    assert.equal(portfolio.annotations?.destructiveHint, false);
    assert.ok(portfolio.description && portfolio.description.length > 0);
    assert.ok(portfolio.inputSchema?.properties?.handle, 'handle must be in the schema');
    assert.ok(!portfolio.inputSchema?.required?.includes('handle'), 'handle must not be required');
  });

  it('still runs hello_follio', async () => {
    const result = await callTool(server, 'hello_follio', { name: 'Padmaja' });
    assert.notEqual(result.isError, true);
    assert.equal(
      result.content[0]?.text,
      'Hello Padmaja! Your Follio MCP server is working successfully.'
    );
  });

  it('returns the default portfolio when called with no arguments', async () => {
    const result = await callTool(server, 'get_portfolio', {});
    assert.notEqual(result.isError, true);

    const text = result.content[0]?.text;
    assert.ok(text, 'expected text content');
    const portfolio = JSON.parse(text) as Record<string, unknown>;

    assert.deepEqual(Object.keys(portfolio).sort(), [
      'education',
      'experience',
      'meta',
      'profile',
      'projects',
      'skills',
    ]);
    assert.equal((portfolio.profile as { handle: string }).handle, 'riley-chen');
    assert.equal((portfolio.meta as { dataSource: string }).dataSource, 'synthetic-fixture');
    assert.ok((portfolio.experience as unknown[]).length > 0);
    assert.ok((portfolio.education as unknown[]).length > 0);
    assert.ok((portfolio.projects as unknown[]).length > 0);
    assert.ok((portfolio.skills as unknown[]).length > 0);
  });

  it('returns a named portfolio', async () => {
    const result = await callTool(server, 'get_portfolio', { handle: 'morgan-patel' });
    assert.notEqual(result.isError, true);
    const portfolio = JSON.parse(result.content[0]?.text ?? '{}') as {
      profile: { handle: string; fullName: string };
    };
    assert.equal(portfolio.profile.handle, 'morgan-patel');
    assert.equal(portfolio.profile.fullName, 'Morgan Patel');
  });

  it('reports an unknown handle as a tool error, not a crash', async () => {
    const result = await callTool(server, 'get_portfolio', { handle: 'nobody-here' });
    assert.equal(result.isError, true);
    assert.match(result.content[0]?.text ?? '', /No portfolio found/);
    assert.match(result.content[0]?.text ?? '', /Available handles:/);
  });

  it('rejects a malformed handle', async () => {
    // Schema violations are refused by the SDK before the handler runs.
    const response = await server.send('tools/call', {
      name: 'get_portfolio',
      arguments: { handle: '' },
    });
    const failed =
      response.error !== undefined ||
      (response.result as unknown as ToolCallResult | undefined)?.isError === true;
    assert.ok(failed, 'an empty handle must be refused');
  });

  it('refuses an unknown tool', async () => {
    const response = await server.send('tools/call', {
      name: 'delete_portfolio',
      arguments: {},
    });
    const failed =
      response.error !== undefined ||
      (response.result as unknown as ToolCallResult | undefined)?.isError === true;
    assert.ok(failed, 'the server must not invent a delete_portfolio tool');
  });

  it('serves repeated reads identically', async () => {
    const first = await callTool(server, 'get_portfolio', { handle: 'riley-chen' });
    const second = await callTool(server, 'get_portfolio', { handle: 'riley-chen' });
    assert.deepEqual(first.content, second.content);
  });

  it('keeps logging off stdout', async () => {
    // The banner must go to stderr; anything on stdout corrupts the stream.
    assert.ok(
      server.stderr.join('').includes('Follio MCP server started.'),
      'expected the startup banner on stderr'
    );
  });
});
