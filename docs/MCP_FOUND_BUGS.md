# MCP found bugs

Bugs found while testing Follio's MCP connector. These are notes only; none are fixed yet.

## 1. A second `propose_summary` adds to the draft instead of replacing it

**Found:** 2026-11-12, testing locally in Claude Code (`follio-dev`, `mcp` branch).

**What happened**

1. I asked Claude to rewrite the summary. It called `propose_summary` and saved draft A.
2. I asked for a shorter, one-sentence version. It called `propose_summary` again.
3. The pending draft now held **both** summary updates.
4. Claude noticed, called `discard_draft`, and proposed the one-sentence version again.

**Expected:** a newer summary proposal replaces the earlier one in the pending draft.

**Where the cause is:** `services/ai-connector.service.ts`, `appendOperation`.

- It always adds the new operation to the end of the list: `[...parseOperations(draft.operations), operation]`.
- It never checks whether the draft already holds an operation of the same kind.
- `getOrCreatePendingDraft` reuses the open draft for that resume, so every proposal lands in the same draft.

Claude suggested fixing it in `lib/mcp/tools.ts`, but that file only describes the tools. The behaviour is in the service file.

**Questions for the fix**

- Should a new summary/headline replace an earlier one, while new experiences and projects keep adding up?
- If both updates were applied, which would win? Probably the last one, but check `applyOperation`.
- Does the line-edit flow (`suggest_resume_edits`) have the same problem when it's asked twice?

**Workaround today:** Claude can call `discard_draft` and propose again, as it did here.
