/**
 * AI Client Configuration
 *
 * Centralized AI client management for the portfolio pipeline.
 * Uses OpenAI as the primary provider.
 *
 * Model strategy:
 * - "heavy" model (GPT-4o) for creative/reasoning tasks (narrative, strategy)
 * - "light" model (GPT-4o-mini) for structured extraction/validation tasks
 *
 * All AI calls go through this module for consistent error handling,
 * token tracking, and cost awareness.
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

/** Max token limits by stage */
const MAX_TOKENS = {
  profileUnderstanding: 2048,
  evidenceExtraction: 3000,
  portfolioStrategy: 2048,
  narrativeGeneration: 4096,
  designBrief: 1500,
  validation: 2048,
} as const;

export type AITaskType = 'extraction' | 'strategy' | 'creative';
export type PipelineStage = keyof typeof MAX_TOKENS;

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
  stage: PipelineStage;
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

/**
 * Execute a single AI call with full tracking and error handling.
 * This is the only function that talks to OpenAI — everything else
 * goes through here.
 */
export async function executeAICall<T>(options: AICallOptions): Promise<AICallResult<T>> {
  const {
    stage,
    taskType,
    systemPrompt,
    userPrompt,
    maxTokens = MAX_TOKENS[stage],
    temperature = TEMPERATURE[taskType],
    jsonMode = true,
  } = options;

  const model = taskType === 'creative' || taskType === 'strategy' ? HEAVY_MODEL : LIGHT_MODEL;
  const startTime = Date.now();

  aiLogger.info(`[${stage}] Starting AI call`, { model, taskType, maxTokens });

  try {
    const client = getClient();

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`AI returned empty response for stage: ${stage}`);
    }

    const durationMs = Date.now() - startTime;
    const tokensUsed = {
      input: response.usage?.prompt_tokens ?? 0,
      output: response.usage?.completion_tokens ?? 0,
    };

    aiLogger.info(`[${stage}] AI call completed`, {
      durationMs,
      tokensInput: tokensUsed.input,
      tokensOutput: tokensUsed.output,
      model,
    });

    // Parse JSON response
    let parsed: T;
    try {
      parsed = JSON.parse(content) as T;
    } catch {
      aiLogger.error(`[${stage}] Failed to parse AI JSON response`, undefined, {
        contentPreview: content.substring(0, 500),
      });
      throw new Error(`AI returned invalid JSON for stage: ${stage}`);
    }

    const meta: PipelineStageMeta = {
      stage,
      model,
      tokensUsed,
      durationMs,
      timestamp: new Date().toISOString(),
    };

    return { data: parsed, meta };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    aiLogger.error(`[${stage}] AI call failed after ${durationMs}ms`, error);

    // Re-throw with context
    if (error instanceof Error) {
      throw new Error(`Portfolio pipeline stage "${stage}" failed: ${error.message}`);
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
    designBrief: 'strategy',
    validation: 'extraction',
  };

  const taskType = stageTaskMap[stage];
  return {
    model: taskType === 'creative' || taskType === 'strategy' ? HEAVY_MODEL : LIGHT_MODEL,
    maxTokens: MAX_TOKENS[stage],
    taskType,
  };
}
