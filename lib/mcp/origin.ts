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
