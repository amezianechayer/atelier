import { describe, expect, it, vi } from 'vitest';
import { createWebSearch } from './websearch';

function anthropicResponse(text: string, searches = 1) {
  return new Response(
    JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      content: [{ type: 'text', text }],
      usage: {
        input_tokens: 1000,
        output_tokens: 200,
        server_tool_use: { web_search_requests: searches },
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('createWebSearch (outil serveur Anthropic, ADR 0005)', () => {
  it('appelle l’API avec l’outil web_search et parse les résultats JSON', async () => {
    const payload = JSON.stringify([
      { title: 'Doc A', url: 'https://a.com', snippet: 'résumé A' },
      { title: 'Doc B', url: 'https://b.com', snippet: 'résumé B' },
    ]);
    const fetchFn = vi.fn(async () => anthropicResponse(`\`\`\`json\n${payload}\n\`\`\``));
    const onUsage = vi.fn(async () => {});

    const search = createWebSearch({
      apiKey: 'sk-test',
      model: 'claude-haiku-4-5',
      computeCostUsd: () => 0.0015,
      onUsage,
      fetchFn,
    });
    const results = await search('meilleurs outils solopreneur');

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ title: 'Doc A', url: 'https://a.com', snippet: 'résumé A' });

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(String(init.body));
    expect(body.tools[0].type).toMatch(/^web_search_/);
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test');
  });

  it('facture tokens + recherches serveur (0,01 $ chacune)', async () => {
    const fetchFn = vi.fn(async () => anthropicResponse('[]', 3));
    const onUsage = vi.fn(
      async (_u: { costUsd: number; inputTokens: number; outputTokens: number }) => {},
    );
    const search = createWebSearch({
      apiKey: 'sk-test',
      model: 'claude-haiku-4-5',
      computeCostUsd: () => 0.002,
      onUsage,
      fetchFn,
    });
    await search('q');
    const usage = onUsage.mock.calls[0]?.[0];
    // 0.002 de tokens + 3 recherches à 0.01
    expect(usage?.costUsd).toBeCloseTo(0.032, 10);
    expect(usage?.inputTokens).toBe(1000);
    expect(usage?.outputTokens).toBe(200);
  });

  it('renvoie [] si le modèle ne produit pas de JSON exploitable', async () => {
    const fetchFn = vi.fn(async () => anthropicResponse('aucun résultat probant'));
    const search = createWebSearch({
      apiKey: 'sk-test',
      model: 'claude-haiku-4-5',
      computeCostUsd: () => 0,
      onUsage: async () => {},
      fetchFn,
    });
    await expect(search('q')).resolves.toEqual([]);
  });

  it('erreur actionnable sur réponse non-2xx', async () => {
    const fetchFn = vi.fn(
      async () => new Response('{"error":{"message":"overloaded"}}', { status: 529 }),
    );
    const search = createWebSearch({
      apiKey: 'sk-test',
      model: 'claude-haiku-4-5',
      computeCostUsd: () => 0,
      onUsage: async () => {},
      fetchFn,
    });
    await expect(search('q')).rejects.toThrowError(/529/);
  });
});
