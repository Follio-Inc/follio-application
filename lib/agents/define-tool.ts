import { z } from 'zod';

import type { AgentTool, AgentToolContext } from '@/types/agents';

/**
 * Define a typed agent tool. Input is validated with Zod before execute runs.
 */
export function defineTool<TSchema extends z.ZodType>(options: {
  name: string;
  description: string;
  inputSchema: TSchema;
  execute: (input: z.infer<TSchema>, ctx: AgentToolContext) => Promise<unknown> | unknown;
}): AgentTool {
  return {
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    execute: async (input, ctx) => options.execute(input as z.infer<TSchema>, ctx),
  };
}

/**
 * Convert a Zod object schema into a JSON Schema fragment suitable for
 * OpenAI function tools. Supports the subset we use in agent tools
 * (object, string, number, boolean, enum, optional, array, record, literal).
 */
export function zodToOpenAIParameters(schema: z.ZodType): Record<string, unknown> {
  return zodNodeToJsonSchema(schema);
}

function zodNodeToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  let current: z.ZodType = schema;

  // Unwrap optional / default / nullable
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodDefault ||
    current instanceof z.ZodNullable
  ) {
    current = current._def.innerType as z.ZodType;
  }

  if (current instanceof z.ZodObject) {
    const shape = current.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const field = value as z.ZodType;
      properties[key] = {
        ...zodNodeToJsonSchema(field),
        ...(field.description ? { description: field.description } : {}),
      };
      if (!field.isOptional()) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    };
  }

  if (current instanceof z.ZodString) {
    return { type: 'string' };
  }
  if (current instanceof z.ZodNumber) {
    return { type: 'number' };
  }
  if (current instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }
  if (current instanceof z.ZodLiteral) {
    return { type: typeof current._def.value, enum: [current._def.value] };
  }
  if (current instanceof z.ZodEnum) {
    return { type: 'string', enum: current._def.values };
  }
  if (current instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodNodeToJsonSchema(current._def.type as z.ZodType),
    };
  }
  if (current instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: zodNodeToJsonSchema(current._def.valueType as z.ZodType),
    };
  }
  if (current instanceof z.ZodUnknown || current instanceof z.ZodAny) {
    return {};
  }

  // Fallback — treat as free-form object
  return { type: 'object', additionalProperties: true };
}
