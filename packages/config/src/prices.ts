import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * Prix des modèles (USD / Mtok), chargés depuis packages/config/prices.yaml (daté).
 * Utilisés par le Model Router pour le metering à CHAQUE appel (SPEC.md §7).
 */

const pricesFileSchema = z.object({
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'as_of doit être une date YYYY-MM-DD'),
  models: z.record(
    z.string(),
    z.object({
      input_per_mtok: z.number().nonnegative(),
      output_per_mtok: z.number().nonnegative(),
    }),
  ),
});

export interface ModelPrice {
  inputPerMtok: number;
  outputPerMtok: number;
}

export interface Prices {
  asOf: string;
  models: Record<string, ModelPrice>;
}

let cached: Prices | undefined;

export function loadPrices(): Prices {
  if (cached) return cached;
  const path = fileURLToPath(new URL('../prices.yaml', import.meta.url));
  const parsed = pricesFileSchema.safeParse(parse(readFileSync(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(
      `packages/config/prices.yaml invalide : ${parsed.error.issues[0]?.message ?? 'format inattendu'}. Corrige le fichier (voir ADR 0005).`,
    );
  }
  const models: Record<string, ModelPrice> = {};
  for (const [name, p] of Object.entries(parsed.data.models)) {
    models[name] = { inputPerMtok: p.input_per_mtok, outputPerMtok: p.output_per_mtok };
  }
  cached = { asOf: parsed.data.as_of, models };
  return cached;
}

/**
 * Coût d'un appel en USD. Modèle absent de prices.yaml => erreur (fail-closed) :
 * mieux vaut échouer une mission que de laisser de l'usage non facturé.
 */
export function computeCostUsd(
  prices: Prices,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = prices.models[model];
  if (!price) {
    throw new Error(
      `Modèle « ${model} » absent de packages/config/prices.yaml — ajoute son prix (daté) avant de l'utiliser.`,
    );
  }
  return (
    (inputTokens / 1_000_000) * price.inputPerMtok +
    (outputTokens / 1_000_000) * price.outputPerMtok
  );
}
