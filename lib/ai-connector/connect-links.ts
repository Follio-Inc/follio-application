/** Opens Claude's add-connector dialog with the Follio URL already filled in. */
export function claudeCustomConnectorUrl(mcpUrl: string): string {
  const params = new URLSearchParams({
    modal: 'add-custom-connector',
    connectorName: 'Follio',
    connectorUrl: mcpUrl,
  });
  return `https://claude.ai/customize/connectors?${params.toString()}`;
}
