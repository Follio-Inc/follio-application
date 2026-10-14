/**
 * Resume lab result types (PLATFORM_TODO item 21).
 *
 * Client-safe: types only. Every number below is measured during one run of
 * the **shipped** resume-import pipeline — `extractTextFromPDF` followed by
 * `runResumeParseAgent` — not of a copy of it.
 *
 * The lab is diagnostic. It stops after the agent returns: nothing it produces
 * is written to a profile, a resume row or any product table, and the result
 * carries no file bytes back to the browser.
 */

/** Where the PDF came from. */
export type ResumeLabSource = 'fixture' | 'upload';

/**
 * What happened, with the failures kept apart.
 *
 * - `parsed` — extraction and the agent both finished.
 * - `gate-closed` — `canRunDeveloperSuites()` said no.
 * - `ai-unavailable` — no API key, so the product itself would refuse. The
 *   same check `app/api/import/resume/route.ts` makes before anything else.
 * - `no-input` / `unknown-fixture` / `not-a-pdf` / `too-large` — the input was
 *   refused. The last two use the product route's own rules.
 * - `extraction-failed` — `extractTextFromPDF` threw.
 * - `text-too-short` — fewer than 50 characters came out, which is the
 *   threshold the shipped service refuses at.
 * - `agent-failed` — the agent threw. Extraction still happened and its
 *   numbers are reported.
 */
export type ResumeLabOutcome =
  | 'parsed'
  | 'gate-closed'
  | 'ai-unavailable'
  | 'no-input'
  | 'unknown-fixture'
  | 'not-a-pdf'
  | 'too-large'
  | 'extraction-failed'
  | 'text-too-short'
  | 'agent-failed';

/** One measured stage. Milliseconds from a monotonic clock. */
export type ResumeLabStage = {
  id: string;
  label: string;
  ms: number;
  /**
   * Where the number came from, so a reader can tell a stage the lab timed
   * from one the agent reported about itself.
   */
  detail: string;
};

export type ResumeLabTiming = {
  /** In the order they ran. */
  stages: ResumeLabStage[];
  /** Wall-clock for the whole run, measured around everything above. */
  totalMs: number;
};

export type ResumeLabSizes = {
  /** The PDF, in bytes. */
  inputBytes: number;
  /**
   * Pages, read from `pdf-parse` metadata.
   *
   * The shipped `extractTextFromPDF` returns a string and throws the page
   * count away, so the lab reads it in a separate, separately-timed step. Null
   * when that read failed.
   */
  pages: number | null;
  /** Characters the shipped extractor returned. */
  extractedChars: number;
  /** The same text as UTF-8 bytes. */
  extractedBytes: number;
  /** Characters actually handed to the parse agent. */
  parserInputChars: number;
  /** The normalized result as JSON, in characters. Null when nothing parsed. */
  parsedJsonChars: number | null;
};

/**
 * What survived the trip from the extractor to the parser.
 *
 * Measured at the boundary, not assumed: `keptChars` is the length of the
 * string the agent was given and `extractedChars` the length of the string the
 * extractor returned. The shipped pipeline passes the text through unchanged —
 * `parseResumeTextWithAI` concatenates the whole thing onto its prompt with no
 * truncation — so `droppedChars` is 0 today. It is computed rather than
 * written down, so the day something starts trimming, the number moves.
 */
export type ResumeLabRetention = {
  extractedChars: number;
  keptChars: number;
  droppedChars: number;
  /** Rounded to one decimal. 100 when nothing is dropped. */
  keptPercent: number;
  /** What the measurement means for this run, in one sentence. */
  note: string;
};

/**
 * Token usage, read from the `AgentRun` the agent produced.
 *
 * Read, not computed. It is frequently zero, and that is a fact about the
 * shipped runtime rather than about the run: `lib/agents/runtime.ts` adds token
 * usage to the record for a **tool** agent's LLM turns, and a **workflow**
 * agent's steps report a duration and no usage unless the step supplies one.
 * The resume-parse steps do not, so every resume import — the product's
 * included — records `{0, 0}`. `note` says so rather than letting a bare zero
 * read as "no tokens were spent".
 */
export type ResumeLabTokens = {
  input: number;
  output: number;
  total: number;
  /** Per agent step, for the steps that reported usage. Often empty. */
  byStep: { stepId: string; model: string | null; input: number; output: number }[];
  /** What the numbers above mean for this run. */
  note: string;
};

/** The parse result, as the lab shows it. */
export type ResumeLabParsed = {
  counts: {
    experiences: number;
    educations: number;
    projects: number;
    skills: number;
    links: number;
    certifications: number;
  };
  /** A few identifying fields, so the run is recognisable at a glance. */
  headline: string | null;
  summaryChars: number;
  /** The model and confidence the pipeline recorded. */
  model: string | null;
  confidence: number | null;
  /** The normalized data, pretty-printed. Shown behind a disclosure. */
  json: string;
};

export type ResumeLabRunResult = {
  outcome: ResumeLabOutcome;
  source: ResumeLabSource;
  /** Fixture id, or an upload's reported name. Never a filesystem path. */
  inputLabel: string;
  timing: ResumeLabTiming;
  sizes: ResumeLabSizes;
  /** Null until text has been extracted. */
  retention: ResumeLabRetention | null;
  /** Null unless the agent ran. */
  tokens: ResumeLabTokens | null;
  /**
   * Models, observed provider usage and cost (item 22). Null unless the agent
   * ran: with no AI stage there is nothing to have observed.
   */
  ai: ResumeLabAi | null;
  /** Null unless the agent returned data (item 22). */
  entities: ResumeLabEntities | null;
  /** Deterministic diagnostics. Empty is a real answer (item 22). */
  warnings: ResumeLabWarning[];
  /** Diagnostic text and JSON from this run (item 22). */
  payloads: ResumeLabPayload[];
  /** Payloads the shipped pipeline does not expose, and why (item 22). */
  missingPayloads: ResumeLabMissingPayload[];
  /** Null unless the agent returned data. */
  parsed: ResumeLabParsed | null;
  /** The `AgentRun` id, so the row the runtime persisted can be found. */
  agentRunId: string | null;
  /** One sentence an operator can act on. Always present. */
  detail: string;
  /** The failure's own message, trimmed. Never a stack and never a key. */
  error: string | null;
};

/** One fixture the lab offers. */
export type ResumeLabFixture = {
  id: string;
  label: string;
  description: string;
  /** The committed file's size, so the picker can show it. */
  bytes: number | null;
};

/** What the lab page renders before anything has run. */
export type ResumeLabView = {
  fixtures: ResumeLabFixture[];
  /** `canRunDeveloperSuites()`, evaluated on the server. */
  canRun: boolean;
  gateReason: string;
  /** Whether an API key is configured, from the product's own probe. */
  aiAvailable: boolean;
  /** The product route's limits, which the lab applies unchanged. */
  maxBytes: number;
  acceptedType: string;
};

/* ===========================================================================
 * Item 22 — AI tokens, cost, entities, warnings, raw payloads
 * ======================================================================== */

/**
 * Where a token count came from. The three never collapse into one another.
 *
 * - `observed` — the provider reported it. `lib/ai-client.ts` reads
 *   `response.usage` and emits it as structured telemetry; the lab reads that.
 * - `estimated` — derived rather than reported. The lab never produces this
 *   today: it can observe, and guessing where it can observe would be worse
 *   than the truth. The case exists so a future estimate cannot be quietly
 *   filed as an observation.
 * - `unavailable` — no usage reached the lab. Not zero. Zero is a number the
 *   provider could report; this is the absence of one.
 */
export type ResumeLabUsageStatus = 'observed' | 'estimated' | 'unavailable';

/** One provider call the pipeline made, as the AI client reported it. */
export type ResumeLabAiCall = {
  /** The `PipelineStage` key the shipped code passed, e.g. `resumeParse`. */
  stage: string;
  label: string;
  /** The model the client actually resolved, not a constant copied elsewhere. */
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** The provider round trip, as the client measured it. */
  durationMs: number;
  /** `MAX_TOKENS[stage]`, the configured completion cap this call ran under. */
  maxOutputTokens: number | null;
  cost: ResumeLabCost;
};

export type ResumeLabUsage = {
  status: ResumeLabUsageStatus;
  /** Null when `status` is `unavailable`. Never 0 standing in for null. */
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** Where the numbers came from, in one sentence. */
  source: string;
  /** Per provider call, in the order they were observed. */
  calls: ResumeLabAiCall[];
  /**
   * What the `AgentRun` row recorded, kept deliberately apart from the
   * observation above. For this workflow it is `{0, 0}` — see `agentRunNote`.
   */
  agentRunRecorded: { input: number; output: number };
  agentRunNote: string;
};

/**
 * Why a cost figure is or is not available.
 *
 * `partial` is its own case because the pipeline uses two models: priced
 * calls are totalled and unpriced ones named, rather than a total that
 * silently omits one.
 */
export type ResumeLabCostStatus =
  | 'available'
  | 'partial'
  | 'pricing-unavailable'
  | 'usage-unavailable';

export type ResumeLabCost = {
  status: ResumeLabCostStatus;
  /** Null unless `status` is `available` or `partial`. Never 0 for unknown. */
  inputUsd: number | null;
  outputUsd: number | null;
  totalUsd: number | null;
  /** Which kind of token count the money was computed from. */
  basis: ResumeLabUsageStatus | null;
  /** The pricing table and the date it was recorded. Null when unpriced. */
  pricingSource: string | null;
  /** The models the figure covers. */
  models: string[];
  /** Models that ran but have no price on file. */
  unpricedModels: string[];
  note: string;
};

/** Models, usage and cost for one run. */
export type ResumeLabAi = {
  /** Every model the run actually used, deduplicated, in call order. */
  models: string[];
  /**
   * The model name the shipped service stamps into its own result metadata.
   * A separate constant from the one the client resolves, so the lab shows
   * both rather than assuming they agree.
   */
  reportedModel: string | null;
  usage: ResumeLabUsage;
  cost: ResumeLabCost;
};

/** One counted section of the parsed resume. */
export type ResumeLabEntityCount = {
  type: string;
  label: string;
  count: number;
};

/**
 * Entity counts, from the structured result the shipped pipeline returned.
 *
 * Counting rule: `total` is the sum of `byType` and nothing else. `byType`
 * counts **top-level records** of each section of `NormalizedResumeData`,
 * plus the filled fields of `profile` and `contactInfo`. Items nested inside
 * a record — an experience's bullets, a project's technologies, a skill
 * group's members — are reported in `nested` and excluded from `total`,
 * because counting a bullet as a peer of the job it belongs to would make the
 * total mean nothing.
 */
export type ResumeLabEntities = {
  total: number;
  byType: ResumeLabEntityCount[];
  nested: ResumeLabEntityCount[];
  rule: string;
};

export type ResumeLabWarningSeverity = 'info' | 'warning' | 'error';

/** A deterministic diagnostic derived from this run. Never model-generated. */
export type ResumeLabWarning = {
  code: string;
  severity: ResumeLabWarningSeverity;
  message: string;
  /** The number or name the rule fired on. Null when the code says it all. */
  evidence: string | null;
};

export type ResumeLabPayloadKind = 'text' | 'json';

/**
 * A diagnostic payload from this run.
 *
 * `chars` and `bytes` describe the **whole** value even when `preview` is
 * capped, so a truncated view never understates what the pipeline handled.
 */
export type ResumeLabPayload = {
  id: string;
  label: string;
  kind: ResumeLabPayloadKind;
  /** The stage that produced it. */
  stage: string;
  chars: number;
  bytes: number;
  preview: string;
  truncated: boolean;
  note: string;
};

/** A payload an operator might expect, and why this run cannot show it. */
export type ResumeLabMissingPayload = {
  id: string;
  label: string;
  reason: string;
};
