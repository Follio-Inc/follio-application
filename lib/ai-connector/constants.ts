export const MCP_PATH = '/api/mcp';
export const OAUTH_AUTHORIZE_PATH = '/oauth/authorize';
export const OAUTH_TOKEN_PATH = '/api/oauth/token';
export const OAUTH_REGISTER_PATH = '/api/oauth/register';

export const AI_CONNECTOR_SCOPES = ['follio.read', 'follio.draft', 'follio.apply'] as const;
export type AiConnectorScope = (typeof AI_CONNECTOR_SCOPES)[number];

export const ACCESS_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const AUTH_CODE_TTL_MS = 1000 * 60 * 10; // 10 minutes
export const DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export const ACCESS_TOKEN_PREFIX = 'flio_';
export const CLIENT_ID_PREFIX = 'follio_cli_';

export const MCP_PROTOCOL_VERSION = '2025-03-26';
export const MCP_SERVER_NAME = 'follio';
export const MCP_SERVER_VERSION = '1.0.0';

export const MCP_INSTRUCTIONS = [
  "You are connected to the user's Follio (their professional profile).",
  'Use get_profile to read the active resume before proposing changes.',
  'To improve existing lines (headline, summary, experience bullets), call get_resume_lines, then suggest_resume_edits with the refs you rewrote, bullets to add after a ref, or bullets to remove.',
  'Follow the writingGuide playbooks from get_resume_lines for the kind of edit the user asked for, and use its scores to find the lines that need work.',
  'To add new roles or projects, use propose_experience or propose_project, which add items to a draft.',
  'Writes never go live immediately. Show the user each change before and after.',
  'Only call apply_resume_edits or apply_draft after the user clearly confirms in this conversation. If they have not confirmed, summarize and wait.',
  'Never invent numbers, tools, employers, or titles. If a line needs a number, ask the user and pass their answer in userFacts.',
  'Applied line edits can be undone with undo_resume_edits.',
].join(' ');
