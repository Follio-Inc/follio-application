/**
 * `get_portfolio` — read one synthetic portfolio.
 *
 * Strictly read-only: it reads a frozen fixture through the repository and
 * returns it. There is no write path, no I/O and no mutable state, and the
 * tool is advertised with `readOnlyHint: true`.
 *
 * The handler is a thin wrapper. All of the decision-making lives in
 * `resolvePortfolioRequest`, which is a pure function so it can be tested
 * without standing up a server or a transport.
 */

import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import {
  DEFAULT_PORTFOLIO_HANDLE,
  getDefaultPortfolio,
  getPortfolioByHandle,
  listPortfolioHandles,
} from '../portfolio/repository.js';
import type { Portfolio } from '../portfolio/types.js';

export const GET_PORTFOLIO_TOOL_NAME = 'get_portfolio';

/**
 * `handle` is optional: with no argument the tool returns the default
 * portfolio, so a model can call it before it knows any handles. The bounds
 * keep a malformed argument from reaching the lookup as a huge string.
 */
export const getPortfolioInputSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(1, 'handle cannot be empty — omit it to get the default portfolio')
    .max(80, 'handle is too long to be a Follio handle')
    .optional()
    .describe(
      `Portfolio handle, e.g. "${DEFAULT_PORTFOLIO_HANDLE}". ` +
        'Omit to read the default portfolio. Call with no arguments first if you do not know a handle.'
    ),
});

export type GetPortfolioInput = z.infer<typeof getPortfolioInputSchema>;

export type PortfolioLookup =
  | { readonly ok: true; readonly portfolio: Portfolio }
  | { readonly ok: false; readonly message: string };

/**
 * Decide what `get_portfolio` should answer.
 *
 * Both failure modes are returned as data, not thrown: an unknown handle is a
 * normal thing for a model to ask for, and the reply tells it what it can ask
 * for instead.
 */
export function resolvePortfolioRequest(input: GetPortfolioInput): PortfolioLookup {
  const available = listPortfolioHandles();

  if (input.handle === undefined) {
    const portfolio = getDefaultPortfolio();
    if (!portfolio) {
      // The fixtures do not contain their own default: a packaging fault.
      return {
        ok: false,
        message:
          'Portfolio data is unavailable: this server has no default portfolio configured. ' +
          (available.length > 0
            ? `Available handles: ${available.join(', ')}.`
            : 'No portfolios are available.'),
      };
    }
    return { ok: true, portfolio };
  }

  const portfolio = getPortfolioByHandle(input.handle);
  if (!portfolio) {
    return {
      ok: false,
      message:
        `No portfolio found for handle "${input.handle}". ` +
        (available.length > 0
          ? `Available handles: ${available.join(', ')}.`
          : 'This server currently has no portfolios.'),
    };
  }

  return { ok: true, portfolio };
}

export function registerGetPortfolio(server: McpServer): void {
  server.registerTool(
    GET_PORTFOLIO_TOOL_NAME,
    {
      title: 'Get portfolio',
      description:
        'Read a Follio portfolio: profile, work experience, education, projects and skills. ' +
        'Read-only — it never changes anything. Omit `handle` for the default portfolio. ' +
        'Currently returns synthetic demo data, not real user data.',
      inputSchema: getPortfolioInputSchema,
      annotations: {
        title: 'Get portfolio',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const result = resolvePortfolioRequest(input);

      if (!result.ok) {
        return {
          content: [{ type: 'text', text: result.message }],
          isError: true,
        };
      }

      // Pretty-printed JSON: one predictable shape for every success, which a
      // model can read directly and a human can read in a transcript.
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.portfolio, null, 2),
          },
        ],
      };
    }
  );
}
