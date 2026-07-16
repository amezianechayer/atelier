/**
 * Fumée sandbox (Phase 4) : lance Claude Code headless en conteneur durci sur le template
 * landing et vérifie qu'il personnalise content.json à travers le proxy egress.
 * Lancer : pnpm --filter worker exec tsx scripts/sandbox-smoke.ts
 */
import { loadDotEnv, loadEnv } from '@atelier/config';
import { runBuilderSandbox } from '../src/sandbox/runner';
import { loadTemplate } from '../src/template';

loadDotEnv();
const env = loadEnv();
if (env.ANTHROPIC_API_KEY === '') throw new Error('ANTHROPIC_API_KEY manquante');

const template = loadTemplate('landing');
console.log(`template landing : ${Object.keys(template).length} fichiers`);
console.log('content.json AVANT :', JSON.parse(template['content.json'] ?? '{}').brandName);

const start = Date.now();
const result = await runBuilderSandbox({
  image: env.SANDBOX_IMAGE,
  anthropicApiKey: env.ANTHROPIC_API_KEY,
  template,
  prompt:
    'Réécris UNIQUEMENT content.json pour une venture nommée « PawPlanner » ' +
    '(agenda + rappels pour pet-sitters indépendants). Garde les mêmes clés JSON, ' +
    'français, ton chaleureux. Applique avec ton outil d’édition.',
  timeoutMs: 300_000,
  onEvent: async (e) => {
    if (e.type === 'tool') console.log(`  [outil] ${e.toolName}`);
    if (e.type === 'usage') console.log(`  [usage] coût ${e.costUsd} $`);
    if (e.type === 'error') console.error(`  [erreur] ${e.text}`);
  },
});

console.log(`\ndurée : ${Math.round((Date.now() - start) / 1000)}s | isError : ${result.isError}`);
console.log('content.json APRÈS :');
console.log(result.files['content.json']);
console.log('\nrésumé :', result.summary.slice(0, 200));
