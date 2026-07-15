import { createOpenAI } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import type { UsageEvent } from './router';

/**
 * Embeddings pour le rappel sémantique (memory_chunks.embedding vector(1024), SPEC.md §6).
 * OpenAI text-embedding-3-small réduit à 1024 dimensions (matryoshka).
 * NOTE : requiert un compte OpenAI crédité — voir ADR 0005 ; utilisé à partir de la Phase 7.
 */

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1024;

export interface Embedder {
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface EmbedderOptions {
  openaiApiKey: string;
  computeCostUsd(model: string, inputTokens: number, outputTokens: number): number;
  onUsage(usage: UsageEvent): Promise<void>;
}

export function createEmbedder(options: EmbedderOptions): Embedder {
  const provider = createOpenAI({ apiKey: options.openaiApiKey });
  const model = provider.textEmbedding(EMBEDDING_MODEL);

  return {
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(texts) {
      if (texts.length === 0) return [];
      const result = await embedMany({
        model,
        values: texts,
        providerOptions: { openai: { dimensions: EMBEDDING_DIMENSIONS } },
      });
      const inputTokens = result.usage?.tokens ?? 0;
      await options.onUsage({
        model: EMBEDDING_MODEL,
        inputTokens,
        outputTokens: 0,
        costUsd: options.computeCostUsd(EMBEDDING_MODEL, inputTokens, 0),
      });
      return result.embeddings;
    },
  };
}
