'use client';

import { Check, Copy, Loader2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { copyTextToClipboard } from '@/lib/share/clipboard';

interface ConnectorDraft {
  draftId: string;
  status: string;
  summary: string;
  operations: Array<{ type: string }>;
  clientLabel: string | null;
  createdAt: string;
  expiresAt: string;
}

interface ConnectorConnection {
  id: string;
  label: string | null;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AiAssistantsSection() {
  const [mcpUrl, setMcpUrl] = useState('/api/mcp');
  const [copied, setCopied] = useState(false);
  const [drafts, setDrafts] = useState<ConnectorDraft[]>([]);
  const [connections, setConnections] = useState<ConnectorConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [draftRes, connectionRes] = await Promise.all([
        fetch('/api/ai-connector/drafts'),
        fetch('/api/ai-connector/connections'),
      ]);

      if (!draftRes.ok || !connectionRes.ok) {
        throw new Error('Could not load AI assistant settings');
      }

      const draftJson = (await draftRes.json()) as { drafts: ConnectorDraft[] };
      const connectionJson = (await connectionRes.json()) as { connections: ConnectorConnection[] };
      setDrafts(draftJson.drafts ?? []);
      setConnections(connectionJson.connections ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Could not load AI assistant settings'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMcpUrl(`${window.location.origin}/api/mcp`);
    void load();
  }, [load]);

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(mcpUrl);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const patchDraft = async (draftId: string, action: 'apply' | 'discard') => {
    setPendingId(`${action}:${draftId}`);
    setError(null);
    try {
      const response = await fetch(`/api/ai-connector/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string | { message?: string };
        } | null;
        const message = typeof body?.error === 'string' ? body.error : body?.error?.message;
        throw new Error(message || 'Could not update draft');
      }
      await load();
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : 'Could not update draft');
    } finally {
      setPendingId(null);
    }
  };

  const revokeConnection = async (id: string) => {
    setPendingId(`revoke:${id}`);
    setError(null);
    try {
      const response = await fetch(`/api/ai-connector/connections/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Could not disconnect');
      }
      await load();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Could not disconnect');
    } finally {
      setPendingId(null);
    }
  };

  const pendingDrafts = drafts.filter((draft) => draft.status === 'PENDING');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Connect Claude</CardTitle>
          <CardDescription>
            Let Claude read your Follio and propose edits. Nothing goes live until you confirm in
            chat or apply a draft here. Works on Claude Free (one custom connector).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>In Claude, open Customize → Connectors → Add custom connector.</li>
            <li>Paste the Follio connector URL below.</li>
            <li>Sign in to Follio when Claude asks, then allow access.</li>
            <li>Ask Claude to update your Follio. Review the draft, then confirm.</li>
          </ol>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Connector URL</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <code className="block min-w-0 flex-1 truncate rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                {mcpUrl}
              </code>
              <Button type="button" variant="outline" onClick={() => void handleCopy()}>
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Free ChatGPT and Gemini cannot add a custom connector. Those users can still edit here,
            or wait until Follio is listed in their app directory.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending drafts</CardTitle>
          <CardDescription>
            AI-proposed changes wait here until you apply them. Applying updates your live Follio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading drafts…
            </div>
          ) : pendingDrafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending drafts.</p>
          ) : (
            <ul className="space-y-4">
              {pendingDrafts.map((draft) => (
                <li key={draft.draftId} className="rounded-lg border border-border/60 p-4">
                  <p className="whitespace-pre-wrap text-sm text-foreground">{draft.summary}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {draft.clientLabel || 'AI assistant'} · proposed {formatDate(draft.createdAt)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pendingId !== null}
                      onClick={() => void patchDraft(draft.draftId, 'apply')}
                    >
                      {pendingId === `apply:${draft.draftId}` && (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      )}
                      Apply to Follio
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pendingId !== null}
                      onClick={() => void patchDraft(draft.draftId, 'discard')}
                    >
                      Discard
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected assistants</CardTitle>
          <CardDescription>
            Disconnect to immediately stop an assistant from reading or editing your Follio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading connections…
            </div>
          ) : connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assistants connected yet.</p>
          ) : (
            <ul className="space-y-3">
              {connections.map((connection) => (
                <li
                  key={connection.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {connection.label || 'AI assistant'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Connected {formatDate(connection.createdAt)}
                      {connection.lastUsedAt
                        ? ` · last used ${formatDate(connection.lastUsedAt)}`
                        : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pendingId !== null}
                    onClick={() => void revokeConnection(connection.id)}
                    aria-label={`Disconnect ${connection.label || 'assistant'}`}
                  >
                    {pendingId === `revoke:${connection.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
