/**
 * Fumée Vercel seule (Phase 4) : déploie le template landing sur Vercel SANS GitHub,
 * pour valider le chemin de déploiement en isolation (ex. pendant une panne GitHub).
 * Lancer : VERCEL_TOKEN=... pnpm --filter worker exec tsx scripts/vercel-smoke.ts
 */
import { createDeployment, pollDeployment } from '@atelier/integrations';
import { loadTemplate } from '../src/template';

const token = process.env.VERCEL_TOKEN ?? '';
if (!token) throw new Error('VERCEL_TOKEN requis');

const files = loadTemplate('landing');
console.log(`template : ${Object.keys(files).length} fichiers`);

console.log('déploiement préversion Vercel…');
const created = await createDeployment({ token, name: 'atelier-smoke', files, production: false });
console.log(`  deployment ${created.id} — état initial ${created.readyState}`);
const final = await pollDeployment(token, created.id, { timeoutMs: 300_000 });
console.log(`  état final : ${final.readyState}`);
console.log(`\nURL préversion : https://${final.url}`);
