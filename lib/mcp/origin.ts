const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Browser requests must come from this app or from localhost (the MCP inspector).
 * Server-to-server clients such as Claude, ChatGPT, and Gemini omit Origin.
 */
export function isAllowedMcpOrigin(origin: string | null, appOrigin: string): boolean {
  if (!origin) return true;

  let given: URL;
  let expected: URL;
  try {
    given = new URL(origin);
    expected = new URL(appOrigin);
  } catch {
    return false;
  }

  if (given.origin === expected.origin) return true;
  return LOCAL_HOSTS.has(given.hostname);
}

/**
 * Prefer a single JSON body. Fall back to one SSE event only when the client
 * refuses JSON. Hosts that list both accept either.
 */
export function prefersEventStream(accept: string | null): boolean {
  if (!accept) return false;
  const types = accept.split(',').map((part) => part.split(';')[0]?.trim().toLowerCase() ?? '');
  const acceptsJson = types.includes('application/json') || types.includes('*/*');
  const acceptsSse = types.includes('text/event-stream');
  return acceptsSse && !acceptsJson;
}
