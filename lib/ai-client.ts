/**
 * AI Client Configuration
 *
 * Centralized AI client for Follio — portfolio pipeline, agents, and other
 * product features. Uses OpenAI as the primary provider.
 *
 * Model strategy:
 * - "heavy" model (GPT-4o) for creative/reasoning tasks (narrative, strategy)
 * - "light" model (GPT-4o-mini) for structured extraction/validation tasks
 *
 * All OpenAI traffic should go through this module for consistent error
 * handling, token tracking, and cost awareness.
 */

import { logger } from '@/lib/logger';
import OpenAI from 'openai';

import type { PipelineStageMeta } from '@/types/portfolio';

const aiLogger = logger.child({ source: 'ai-client' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Model used for creative/reasoning tasks (narrative, strategy, design brief) */
const HEAVY_MODEL = 'gpt-4o';

/** Model used for structured extraction (profile understanding, evidence, validation) */
const LIGHT_MODEL = 'gpt-4o-mini';

/** Temperature settings per task type */
const TEMPERATURE = {
  /** Low temperature for factual extraction */
  extraction: 0.1,
  /** Medium temperature for strategic decisions */
  strategy: 0.4,
  /** Higher temperature for creative writing */
  creative: 0.6,
} as const;

/** Default max tokens when a stage is not listed below */
const DEFAULT_MAX_TOKENS = 4096;

/** Max token limits by stage */
const MAX_TOKENS = {
  profileUnderstanding: 2048,
  evidenceExtraction: 3000,
  portfolioStrategy: 2048,
  narrativeGeneration: 4096,
  contentTransform: 4000,
  designBrief: 1500,
  validation: 2048,
  snapViewGeneration: 3000,
  /** Shared agent runtime turns (tool-calling loops) */
  agentTurn: 4096,
  /** Resume PDF structured extraction */
  resumeParse: 4096,
  /** Distill résumé copy into Follio headline + about */
  follioVoice: 800,
} as const;

export type AITaskType = 'extraction' | 'strategy' | 'creative';
export type PipelineStage = keyof typeof MAX_TOKENS;

function resolveMaxTokens(stage: string, override?: number): number {
  if (override != null) return override;
  if (stage in MAX_TOKENS) return MAX_TOKENS[stage as PipelineStage];
  return DEFAULT_MAX_TOKENS;
}

function resolveModel(taskType: AITaskType): string {
  return taskType === 'creative' || taskType === 'strategy' ? HEAVY_MODEL : LIGHT_MODEL;
}

// ============================================================================
// CLIENT SINGLETON
// ============================================================================

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not configured. Portfolio generation requires an OpenAI API key.'
      );
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Check if the AI client is available (API key is configured).
 */
export function isAIAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// ============================================================================
// CORE AI CALL
// ============================================================================

export interface AICallOptions {
  /** Pipeline stage name (for logging and token tracking) */
  stage: PipelineStage | string;
  /** Task type determines model and temperature */
  taskType: AITaskType;
  /** System prompt */
  systemPrompt: string;
  /** User prompt */
  userPrompt: string;
  /** Override max tokens (defaults to stage-specific limit) */
  maxTokens?: number;
  /** Override temperature */
  temperature?: number;
  /** Whether to request JSON output */
  jsonMode?: boolean;
}

export interface AICallResult<T> {
  data: T;
  meta: PipelineStageMeta;
}

export interface ChatCompletionOptions {
  /** Stage / step name for logging */
  stage: string;
  taskType: AITaskType;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  toolChoice?: OpenAI.Chat.ChatCompletionToolChoiceOption;
  maxTokens?: number;
  temperature?: number;
  /** JSON mode is incompatible with tool calling — ignored when tools are set. */
  jsonMode?: boolean;
}

export interface ChatCompletionResult {
  message: OpenAI.Chat.ChatCompletionMessage;
  meta: PipelineStageMeta;
}

/**
 * Execute a single AI call with full tracking and error handling.
 * Prefer this for one-shot JSON extraction/generation.
 */
export async function executeAICall<T>(options: AICallOptions): Promise<AICallResult<T>> {
  const {
    stage,
    taskType,
    systemPrompt,
    userPrompt,
    maxTokens,
    temperature = TEMPERATURE[taskType],
    jsonMode = true,
  } = options;

  const result = await executeChatCompletion({
    stage,
    taskType,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxTokens,
    temperature,
    jsonMode,
  });

  const content = result.message.content;
  if (!content) {
    throw new Error(`AI returned empty response for stage: ${stage}`);
  }

  let parsed: T;
  try {
    parsed = JSON.parse(content) as T;
  } catch {
    aiLogger.error(`[${stage}] Failed to parse AI JSON response`, undefined, {
      contentPreview: content.substring(0, 500),
    });
    throw new Error(`AI returned invalid JSON for stage: ${stage}`);
  }

  return { data: parsed, meta: result.meta };
}

/**
 * Multi-turn / tool-calling chat completion used by the agent runtime.
 * This is the shared gateway for agent loops — do not open a second OpenAI client.
 */
export async function executeChatCompletion(
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  const {
    stage,
    taskType,
    messages,
    tools,
    toolChoice,
    maxTokens = resolveMaxTokens(stage),
    temperature = TEMPERATURE[taskType],
    jsonMode = false,
  } = options;

  const model = resolveModel(taskType);
  const startTime = Date.now();
  const hasTools = !!tools && tools.length > 0;

  aiLogger.info(`[${stage}] Starting chat completion`, {
    model,
    taskType,
    maxTokens,
    hasTools,
    messageCount: messages.length,
  });

  try {
    const client = getClient();

    const response = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(hasTools
        ? {
            tools,
            ...(toolChoice ? { tool_choice: toolChoice } : {}),
          }
        : jsonMode
          ? { response_format: { type: 'json_object' as const } }
          : {}),
    });

    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error(`AI returned empty message for stage: ${stage}`);
    }

    const durationMs = Date.now() - startTime;
    const tokensUsed = {
      input: response.usage?.prompt_tokens ?? 0,
      output: response.usage?.completion_tokens ?? 0,
    };

    aiLogger.info(`[${stage}] Chat completion finished`, {
      durationMs,
      tokensInput: tokensUsed.input,
      tokensOutput: tokensUsed.output,
      model,
      toolCallCount: message.tool_calls?.length ?? 0,
    });

    const meta: PipelineStageMeta = {
      stage,
      model,
      tokensUsed,
      durationMs,
      timestamp: new Date().toISOString(),
    };

    return { message, meta };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    aiLogger.error(`[${stage}] Chat completion failed after ${durationMs}ms`, error);

    if (error instanceof Error) {
      throw new Error(`AI stage "${stage}" failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get model configuration for a given stage.
 * Useful for observability and debugging.
 */
export function getStageConfig(stage: PipelineStage): {
  model: string;
  maxTokens: number;
  taskType: AITaskType;
} {
  const stageTaskMap: Record<PipelineStage, AITaskType> = {
    profileUnderstanding: 'extraction',
    evidenceExtraction: 'extraction',
    portfolioStrategy: 'strategy',
    narrativeGeneration: 'creative',
    contentTransform: 'creative',
    designBrief: 'strategy',
    validation: 'extraction',
    snapViewGeneration: 'strategy',
    agentTurn: 'strategy',
    resumeParse: 'extraction',
    follioVoice: 'strategy',
  };

  const taskType = stageTaskMap[stage];
  return {
    model: resolveModel(taskType),
    maxTokens: MAX_TOKENS[stage],
    taskType,
  };
}
