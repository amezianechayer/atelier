import { memoryDocs } from '@atelier/db';
import { desc, eq } from 'drizzle-orm';
import { publish } from '../notify';
import type { Runtime } from '../runtime';
import { runBuilderSandbox } from '../sandbox/runner';
import type { FileMap } from '../sandbox/tar';
import { loadTemplate } from '../template';

/**
 * Pipeline du Builder (SPEC.md §2.3, §8.2) : mémoire de la venture -> Claude Code headless
 * en sandbox durcie personnalise le template -> FileMap prête à déployer.
 * La sandbox ne reçoit QUE ANTHROPIC_API_KEY : aucun token GitHub/Vercel (§11).
 */

async function ventureBrief(rt: Runtime, ventureId: string): Promise<string> {
  const docs = await rt.db
    .select({ slug: memoryDocs.slug, content: memoryDocs.content, version: memoryDocs.version })
    .from(memoryDocs)
    .where(eq(memoryDocs.ventureId, ventureId))
    .orderBy(desc(memoryDocs.version));
  const bySlug = new Map<string, string>();
  for (const d of docs) if (!bySlug.has(d.slug)) bySlug.set(d.slug, d.content);
  const wanted = ['brand', 'product', 'tone', 'icp'];
  return wanted
    .map((slug) => bySlug.get(slug))
    .filter((c): c is string => Boolean(c))
    .join('\n\n---\n\n');
}

export interface BuilderOutput {
  files: FileMap;
  summary: string;
}

export async function runLandingBuilder(input: {
  rt: Runtime;
  ventureId: string;
  missionId: string;
  ventureName: string;
  pitch: string;
  onDelta(text: string): Promise<void>;
}): Promise<BuilderOutput> {
  const { rt, ventureId, missionId } = input;
  const template = loadTemplate('landing');
  const brief = await ventureBrief(rt, ventureId);

  const prompt =
    `Tu personnalises une landing page de waitlist pour la venture « ${input.ventureName} ».\n` +
    `Pitch : ${input.pitch}\n\n` +
    (brief !== '' ? `Mémoire de la venture :\n${brief}\n\n` : '') +
    'Réécris UNIQUEMENT le fichier content.json (ne touche à aucun fichier .tsx/.ts/.js) : ' +
    'brandName (le nom retenu), tagline (une phrase qui donne envie), subtitle (2 lignes : ' +
    "cible + problème résolu), ctaLabel, 3 bullets (bénéfice mesurable, levée d'objection, " +
    'urgence), footerNote = "assisté par IA". Français, ton de la venture. Garde exactement ' +
    'les mêmes clés JSON. Applique les modifications avec ton outil d’édition.';

  const result = await runBuilderSandbox({
    image: rt.env.SANDBOX_IMAGE,
    anthropicApiKey: rt.env.ANTHROPIC_API_KEY,
    template,
    prompt,
    timeoutMs: 300_000,
    onEvent: async (e) => {
      if (e.type === 'thought' && e.text) await input.onDelta(e.text);
      if (e.type === 'tool' && e.toolName) {
        await publish(rt.db, ventureId, { type: 'mission.tool', missionId, tool: e.toolName });
      }
      if (e.type === 'usage') {
        // Coût réel de Claude Code headless -> compteur électrique (coupure nette incluse).
        await rt.recordUsage(
          ventureId,
          {
            model: e.model ?? 'claude-code',
            inputTokens: e.inputTokens ?? 0,
            outputTokens: e.outputTokens ?? 0,
            costUsd: e.costUsd ?? 0,
          },
          missionId,
        );
      }
    },
  });

  if (result.isError) {
    throw new Error(`Builder sandbox en erreur : ${result.summary.slice(0, 200)}`);
  }

  // Garde-fou : content.json doit rester un JSON valide avec les clés attendues (aperçu fidèle).
  const content = result.files['content.json'];
  if (content) {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (!parsed.brandName || !parsed.tagline) {
        result.files['content.json'] = template['content.json'] ?? content;
      }
    } catch {
      result.files['content.json'] = template['content.json'] ?? content;
    }
  }

  return { files: result.files, summary: result.summary };
}
