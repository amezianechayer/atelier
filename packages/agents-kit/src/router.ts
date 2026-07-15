import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject, generateText, streamText } from 'ai';
import type { z } from 'zod';
import type { AgentRole } from './agent';

/**
 * Model Router au-dessus du Vercel AI SDK (SPEC.md §7) : choix du modèle par rôle
 * (config), retries avec backoff (AI SDK), extraction d'usage normalisée ->
 * onUsage (recordUsage) à CHAQUE appel.
 */

export interface UsageEvent {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export type RouterRole = AgentRole | 'utility';

export interface ModelRouterConfig {
  anthropicApiKey: string;
  /** Modèle par rôle — décision ADR 0005, modifiable par le fondateur. */
  models: Record<RouterRole, string>;
  computeCostUsd(model: string, inputTokens: number, outputTokens: number): number;
  /** Appelé après CHAQUE appel LLM. Peut lever pour interrompre (budget, Phase 3). */
  onUsage(usage: UsageEvent): Promise<void>;
  maxRetries?: number;
}

export interface GenerateInput {
  role: RouterRole;
  system: string;
  prompt: string;
  maxOutputTokens?: number;
}

export interface StreamInput extends GenerateInput {
  onDelta(text: string): Promise<void>;
}

export function normalizeUsage(usage: { inputTokens?: number; outputTokens?: number }): {
  inputTokens: number;
  outputTokens: number;
} {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
}

export interface ModelRouter {
  modelFor(role: RouterRole): string;
  generate(input: GenerateInput): Promise<{ text: string; costUsd: number }>;
  generateObject<S extends z.ZodType>(
    input: GenerateInput & { schema: S },
  ): Promise<{ object: z.infer<S>; costUsd: number }>;
  stream(input: StreamInput): Promise<{ text: string; costUsd: number }>;
}

export function createModelRouter(config: ModelRouterConfig): ModelRouter {
  const provider = createAnthropic({ apiKey: config.anthropicApiKey });
  const maxRetries = config.maxRetries ?? 3;

  function modelFor(role: RouterRole): string {
    return config.models[role];
  }

  async function report(modelName: string, usage: { inputTokens?: number; outputTokens?: number }) {
    const { inputTokens, outputTokens } = normalizeUsage(usage);
    const costUsd = config.computeCostUsd(modelName, inputTokens, outputTokens);
    await config.onUsage({ model: modelName, inputTokens, outputTokens, costUsd });
    return costUsd;
  }

  return {
    modelFor,

    async generate({ role, system, prompt, maxOutputTokens }) {
      const modelName = modelFor(role);
      const result = await generateText({
        model: provider(modelName),
        system,
        prompt,
        maxRetries,
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
      });
      const costUsd = await report(modelName, result.usage);
      return { text: result.text, costUsd };
    },

    async generateObject<S extends z.ZodType>({
      role,
      system,
      prompt,
      schema,
      maxOutputTokens,
    }: GenerateInput & { schema: S }) {
      const modelName = modelFor(role);
      const result = await generateObject({
        model: provider(modelName),
        system,
        prompt,
        schema,
        maxRetries,
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
      });
      const costUsd = await report(modelName, result.usage);
      // Le type conditionnel de generateObject ne se réduit pas avec un S générique.
      return { object: result.object as z.infer<S>, costUsd };
    },

    async stream({ role, system, prompt, maxOutputTokens, onDelta }) {
      const modelName = modelFor(role);
      const result = streamText({
        model: provider(modelName),
        system,
        prompt,
        maxRetries,
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
      });
      for await (const delta of result.textStream) {
        await onDelta(delta);
      }
      const usage = await result.usage;
      const costUsd = await report(modelName, usage);
      return { text: await result.text, costUsd };
    },
  };
}
