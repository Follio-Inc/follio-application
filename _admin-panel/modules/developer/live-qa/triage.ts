import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

import type { LiveQaTriageResult } from './types';

export function isAiTriageAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

function buildPrompt(input: {
  pathwayId: string;
  intents: string[];
  errorText: string;
  stdoutSnippet: string;
}): string {
  return `You are an expert QA engineer for Follio, a resume/portfolio product.
A Live QA pathway failed. Follio UI changes often — prefer explaining selector/copy drift vs product bugs.

Pathway: ${input.pathwayId}
Intents:
${input.intents.map((step) => `- ${step}`).join('\n')}

Error / stdout (truncated):
${(input.errorText || input.stdoutSnippet).slice(0, 6000)}

Respond with ONLY compact JSON:
{
  "likelyCause": "one sentence",
  "suggestedFix": "one concrete next step for the Live QA pathway author",
  "flakyLikelihood": "low|medium|high",
  "notes": "optional short note"
}`;
}

function parseTriageJson(
  text: string,
  provider: LiveQaTriageResult['provider']
): LiveQaTriageResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      provider,
      likelyCause: 'Model returned non-JSON triage.',
      suggestedFix: 'Re-run with headed mode and inspect screenshots.',
      flakyLikelihood: 'medium',
      notes: text.slice(0, 500),
    };
  }
  const parsed = JSON.parse(jsonMatch[0]) as {
    likelyCause?: string;
    suggestedFix?: string;
    flakyLikelihood?: 'low' | 'medium' | 'high';
    notes?: string;
  };
  return {
    provider,
    likelyCause: parsed.likelyCause || 'Unknown',
    suggestedFix: parsed.suggestedFix || 'Inspect artifacts.',
    flakyLikelihood: parsed.flakyLikelihood || 'medium',
    notes: parsed.notes || '',
  };
}

/**
 * Lightweight failure triage — explains likely product vs selector drift.
 * Prefers Anthropic; falls back to OpenAI when that key is present.
 */
export async function triagePathwayFailure(input: {
  pathwayId: string;
  intents: string[];
  errorText: string;
  stdoutSnippet: string;
}): Promise<LiveQaTriageResult> {
  const prompt = buildPrompt(input);

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return {
      provider: 'none',
      likelyCause: 'AI triage unavailable (no ANTHROPIC_API_KEY or OPENAI_API_KEY).',
      suggestedFix:
        'Inspect the Playwright stdout and failure screenshots under live-qa/.artifacts.',
      flakyLikelihood: 'medium',
      notes: 'Set an AI API key to enable automatic triage.',
    };
  }

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
      return parseTriageJson(text, 'anthropic');
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = completion.choices[0]?.message?.content || '';
    return parseTriageJson(text, 'openai');
  } catch (error) {
    return {
      provider: process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai',
      likelyCause: 'AI triage call failed.',
      suggestedFix: 'Inspect Playwright artifacts manually.',
      flakyLikelihood: 'medium',
      notes: error instanceof Error ? error.message : String(error),
    };
  }
}
