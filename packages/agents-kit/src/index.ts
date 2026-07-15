/**
 * @atelier/agents-kit — runtime d'agents (SPEC.md §7) : contrats Agent/Toolbox,
 * model router sur Vercel AI SDK, outil web (allowlist en code), embeddings, prompts.
 */

export * from './agent';
export {
  createEmbedder,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  type Embedder,
  type EmbedderOptions,
} from './embeddings';
export { ceoSystemPrompt, researcherSystemPrompt } from './prompts';
export {
  createModelRouter,
  type GenerateInput,
  type ModelRouter,
  type ModelRouterConfig,
  normalizeUsage,
  type RouterRole,
  type StreamInput,
  type UsageEvent,
} from './router';
export {
  createWebSearch,
  type WebSearchFn,
  type WebSearchOptions,
} from './websearch';
export {
  createWebFetch,
  htmlToText,
  type UrlCheck,
  validateFetchUrl,
  type WebFetchFn,
  type WebFetchOptions,
} from './webtool';
