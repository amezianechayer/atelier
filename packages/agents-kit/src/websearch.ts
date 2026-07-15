import type { WebResult } from './agent';
import type { UsageEvent } from './router';
import type { FetchLike } from './webtool';

/**
 * Toolbox.web.search via l'outil serveur web search d'Anthropic (ADR 0005) :
 * pas d'API de recherche tierce, résultats métrés sur la même facture.
 * Coût = tokens (prices.yaml) + 0,01 $ par recherche serveur (10 $/1000).
 */

const WEB_SEARCH_COST_PER_REQUEST_USD = 0.01;

export interface WebSearchOptions {
  apiKey: string;
  /** Modèle qui exécute la recherche (utilitaire, ex: claude-haiku-4-5). */
  model: string;
  computeCostUsd(model: string, inputTokens: number, outputTokens: number): number;
  onUsage(usage: UsageEvent): Promise<void>;
  maxSearches?: number;
  fetchFn?: FetchLike;
}

export type WebSearchFn = (query: string) => Promise<WebResult[]>;

interface AnthropicMessageResponse {
  model: string;
  content: Array<{ type: string; text?: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    server_tool_use?: { web_search_requests?: number };
  };
}

function extractJsonArray(text: string): WebResult[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is { title: string; url: string; snippet?: string } =>
          typeof r === 'object' && r !== null && 'title' in r && 'url' in r,
      )
      .map((r) => ({
        title: String(r.title),
        url: String(r.url),
        snippet: String(r.snippet ?? ''),
      }));
  } catch {
    return [];
  }
}

export function createWebSearch(options: WebSearchOptions): WebSearchFn {
  const { apiKey, model, computeCostUsd, onUsage, maxSearches = 3, fetchFn = fetch } = options;

  return async function webSearch(query: string): Promise<WebResult[]> {
    const res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches }],
        messages: [
          {
            role: 'user',
            content:
              `Recherche sur le web : « ${query} ».\n` +
              'Réponds UNIQUEMENT avec un tableau JSON (max 8 entrées) au format ' +
              '[{"title": "...", "url": "...", "snippet": "1-2 phrases"}] — rien d’autre.',
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`web.search : l'API Anthropic a répondu HTTP ${res.status} : ${detail}`);
    }

    const body = (await res.json()) as AnthropicMessageResponse;
    const searches = body.usage.server_tool_use?.web_search_requests ?? 0;
    const tokenCost = computeCostUsd(model, body.usage.input_tokens, body.usage.output_tokens);
    await onUsage({
      model,
      inputTokens: body.usage.input_tokens,
      outputTokens: body.usage.output_tokens,
      costUsd: tokenCost + searches * WEB_SEARCH_COST_PER_REQUEST_USD,
    });

    const text = body.content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n');
    return extractJsonArray(text);
  };
}
