import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

function createServer() {
  const server = new McpServer({
    name: 'follio-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    'hello_follio',
    {
      description: 'Test the connection between Claude and Follio MCP.',
      inputSchema: z.object({
        name: z.string().describe('Name of the person to greet'),
      }),
    },
    async ({ name }) => ({
      content: [
        {
          type: 'text',
          text: `Hello ${name}! Your Follio MCP server is working successfully.`,
        },
      ],
    })
  );

  return server;
}

void serveStdio(createServer);

console.error('Follio MCP server started.');
