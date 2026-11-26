# MCP found bugs

Bugs found while testing Follio's MCP connector.

1. ✅ **[FIXED] A second `propose_summary` added to the draft instead of replacing it (2026-11-16).** Revising a summary left both versions in the pending draft; now a newer headline/summary proposal replaces the earlier one (`addOperation` in `lib/ai-connector/operations.ts`).

2. **`delete_resumes` deletes without asking the user to confirm (found 2026-11-24).** Claude can copy each `confirmTitle` from `list_resumes` itself, so the title check catches the wrong resume but can't prove the user said yes. Possible fixes: a two-step delete with a one-time code, or MCP elicitation.

- it is possible that this is only the case in claude code, since when i tested it in claude.ai, there was a confirmation for which resumes to delete
