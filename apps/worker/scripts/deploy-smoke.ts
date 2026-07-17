/**
 * Fumée déploiement (Phase 4) : pousse le template landing sur le repo jetable (vide) et
 * déploie une préversion Vercel — sans passer par la sandbox (itération rapide).
 * Lancer : GH_TOKEN=... VERCEL_TOKEN=... pnpm --filter worker exec tsx scripts/deploy-smoke.ts
 */
import { createDeployment, pollDeployment, pushFiles } from '@atelier/integrations';
import { loadTemplate } from '../src/template';

const ghToken = process.env.GH_TOKEN ?? '';
const vercelToken = process.env.VERCEL_TOKEN ?? '';
const repo = process.env.GH_REPO ?? 'amezianechayer/jetable-';
if (!ghToken || !vercelToken) throw new Error('GH_TOKEN et VERCEL_TOKEN requis');

const [owner, name] = repo.split('/');
if (!owner || !name) throw new Error('GH_REPO au format owner/name');
const files = loadTemplate('landing');
console.log(`template : ${Object.keys(files).length} fichiers`);

console.log('push GitHub…');
const push = await pushFiles(
  ghToken,
  { owner, repo: name },
  {
    branch: 'atelier/landing',
    files,
    commitMessage: 'Landing par Atelier (fumée)',
  },
);
console.log(`  commit ${push.commitSha.slice(0, 7)} — ${push.htmlUrl}`);

console.log('déploiement préversion Vercel…');
const created = await createDeployment({
  token: vercelToken,
  name: 'atelier-smoke',
  files,
  production: false,
  gitRemoteUrl: `https://github.com/${owner}/${name}`,
  commitSha: push.commitSha,
});
console.log(`  deployment ${created.id} — état initial ${created.readyState}`);
const final = await pollDeployment(vercelToken, created.id, { timeoutMs: 240_000 });
console.log(`  état final : ${final.readyState}`);
console.log(`\nURL préversion : https://${final.url}`);
