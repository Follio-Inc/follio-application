/**
 * `hello_follio` — connection smoke test.
 *
 * Moved out of `src/index.ts` unchanged in behaviour: same tool name, same
 * input, same response text. Only its location changed.
 */

import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

export const HELLO_FOLLIO_TOOL_NAME = 'hello_follio';

export const helloFollioInputSchema = z.object({
  name: z.string().describe('Name of the person to greet'),
});

export function helloFollioMessage(name: string): string {
  return `Hello ${name}! Your Follio MCP server is working successfully.`;
}

export function registerHelloFollio(server: McpServer): void {
  server.registerTool(
    HELLO_FOLLIO_TOOL_NAME,
    {
      description: 'Test the connection between Claude and Follio MCP.',
      inputSchema: helloFollioInputSchema,
      annotations: {
        title: 'Hello Follio',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ name }) => ({
      content: [
        {
          type: 'text',
          text: helloFollioMessage(name),
        },
      ],
    })
  );
}
