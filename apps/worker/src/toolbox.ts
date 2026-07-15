import type { MemoryDoc, Toolbox } from '@atelier/agents-kit';
import { integrations, memoryDocs, ventures } from '@atelier/db';
import { and, desc, eq } from 'drizzle-orm';
import type { Runtime } from './runtime';

/**
 * Toolbox branchée sur la base (SPEC.md §7). Les agents proposent, le code décide :
 * actions.propose est volontairement bloqué jusqu'à la couche de confiance (Phase 3).
 */
export function buildToolbox(rt: Runtime, ventureId: string): Toolbox {
  const { db } = rt;

  async function latestDoc(slug: string): Promise<MemoryDoc | undefined> {
    const [row] = await db
      .select({ slug: memoryDocs.slug, version: memoryDocs.version, content: memoryDocs.content })
      .from(memoryDocs)
      .where(and(eq(memoryDocs.ventureId, ventureId), eq(memoryDocs.slug, slug)))
      .orderBy(desc(memoryDocs.version))
      .limit(1);
    return row;
  }

  return {
    web: {
      search: rt.webSearchFor(ventureId),
      fetch: rt.webFetch,
    },
    memory: {
      async readDocs(slugs) {
        const docs = await Promise.all(slugs.map(latestDoc));
        return docs.filter((d): d is MemoryDoc => d !== undefined);
      },
      async proposeDocUpdate(slug, content) {
        // Versionné, jamais d'écrasement (SPEC.md §7).
        const current = await latestDoc(slug);
        await db.insert(memoryDocs).values({
          ventureId,
          slug,
          version: (current?.version ?? 0) + 1,
          content,
        });
      },
      async recall() {
        // Phase 7 : rappel sémantique pgvector (nécessite un compte OpenAI crédité, ADR 0005).
        return [];
      },
    },
    skills: {
      async find() {
        return []; // Phase 7 : skills auto-générées.
      },
      async create() {
        throw new Error('skills.create arrive en Phase 7 (mémoire profonde).');
      },
    },
    actions: {
      async propose() {
        throw new Error(
          "actions.propose arrive en Phase 3 (couche de confiance : classify + file d'approbation).",
        );
      },
    },
    integrations: {
      async list() {
        const [venture] = await db
          .select({ userId: ventures.userId })
          .from(ventures)
          .where(eq(ventures.id, ventureId));
        if (!venture) return [];
        const rows = await db
          .select({ kind: integrations.kind, config: integrations.config })
          .from(integrations)
          .where(eq(integrations.userId, venture.userId));
        // Jamais les secrets : config ne contient que des ids externes (SPEC.md §6).
        return rows.map((r) => ({ kind: r.kind, config: r.config as Record<string, unknown> }));
      },
    },
  };
}
