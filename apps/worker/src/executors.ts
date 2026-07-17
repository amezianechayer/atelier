import type { ActionRow, ExecutionReceipt } from '@atelier/core';
import {
  createDeployment,
  type GithubRepoRef,
  pollDeployment,
  pushFiles,
} from '@atelier/integrations';
import { loadIntegrationToken } from './integrations-token';
import type { Runtime } from './runtime';

/**
 * Registre des ActionExecutor (SPEC.md §7). Les tokens des intégrations sont chargés ICI,
 * côté serveur — jamais dans la sandbox ni les prompts. Les fichiers déployés voyagent dans
 * le payload de l'action (aperçu fidèle, §6) : deploy_prod déploie EXACTEMENT ce qui a été
 * prévisualisé, même 72 h plus tard.
 */
export interface WorkerExecutor {
  canHandle(kind: string): boolean;
  execute(action: ActionRow, rt: Runtime): Promise<ExecutionReceipt>;
}

interface DeployPayload {
  files: Record<string, string>;
  projectName: string;
  branch: string;
  commitMessage?: string;
}

function deployPayload(action: ActionRow): DeployPayload {
  const p = action.payload as Partial<DeployPayload>;
  if (!p || typeof p !== 'object' || !p.files || !p.projectName || !p.branch) {
    throw new Error(`payload de déploiement invalide pour l'action ${action.id}`);
  }
  return {
    files: p.files,
    projectName: p.projectName,
    branch: p.branch,
    commitMessage: p.commitMessage,
  };
}

function repoRef(config: Record<string, unknown>): GithubRepoRef {
  const repo = typeof config.repo === 'string' ? config.repo : '';
  const [owner, name] = repo.split('/');
  if (!owner || !name) {
    throw new Error(
      "L'intégration GitHub n'a pas de repo cible (config.repo « owner/name »). Reconnecte GitHub avec un repo.",
    );
  }
  return { owner, repo: name };
}

/** deploy_preview (classe B) : push sur branche du repo utilisateur + préversion Vercel. */
const deployPreview: WorkerExecutor = {
  canHandle: (kind) => kind === 'deploy_preview',
  async execute(action, rt) {
    const payload = deployPayload(action);

    // Le push sur le repo de l'utilisateur est le différenciateur, mais une panne GitHub
    // transitoire ne doit PAS empêcher la préversion : on pousse best-effort, on déploie
    // toujours. Note remontée à l'utilisateur si le push a échoué.
    const github = await loadIntegrationToken(rt, action.ventureId, 'github');
    const ref = repoRef(github.config);
    let pushNote = '';
    let commitSha: string | undefined;
    try {
      const push = await pushFiles(github.token, ref, {
        branch: payload.branch,
        files: payload.files,
        commitMessage: payload.commitMessage ?? 'Landing par Atelier (préversion)',
      });
      commitSha = push.commitSha;
      pushNote = ` Code sur ${ref.owner}/${ref.repo} (branche ${push.branch}) : ${push.htmlUrl}.`;
    } catch (err) {
      pushNote = ` (push GitHub reporté : ${(err as Error).message.slice(0, 80)})`;
    }

    const vercel = await loadIntegrationToken(rt, action.ventureId, 'vercel');
    const created = await createDeployment({
      token: vercel.token,
      name: payload.projectName,
      files: payload.files,
      production: false,
      gitRemoteUrl: `https://github.com/${ref.owner}/${ref.repo}`,
      ...(commitSha ? { commitSha } : {}),
    });
    const final = await pollDeployment(vercel.token, created.id);
    const previewUrl = `https://${final.url}`;

    return {
      summary:
        final.readyState === 'READY'
          ? `Préversion en ligne.${pushNote}`
          : `Déploiement préversion terminé en état ${final.readyState}.${pushNote}`,
      externalUrl: previewUrl,
    };
  },
};

/** deploy_prod (classe C, approbation requise) : merge sur la branche par défaut + prod Vercel. */
const deployProd: WorkerExecutor = {
  canHandle: (kind) => kind === 'deploy_prod',
  async execute(action, rt) {
    const payload = deployPayload(action);

    // Merge best-effort de la branche du Builder sur la branche par défaut (SPEC.md §8.2).
    let mergeNote = '';
    try {
      const github = await loadIntegrationToken(rt, action.ventureId, 'github');
      const ref = repoRef(github.config);
      await pushFiles(github.token, ref, {
        branch: 'main',
        files: payload.files,
        commitMessage: payload.commitMessage ?? 'Landing par Atelier (production)',
      });
      mergeNote = ` Fusionné sur main de ${ref.owner}/${ref.repo}.`;
    } catch (err) {
      mergeNote = ` (merge sur main ignoré : ${(err as Error).message.slice(0, 80)})`;
    }

    const vercel = await loadIntegrationToken(rt, action.ventureId, 'vercel');
    const created = await createDeployment({
      token: vercel.token,
      name: payload.projectName,
      files: payload.files,
      production: true,
    });
    const final = await pollDeployment(vercel.token, created.id);

    return {
      summary: `Landing en PRODUCTION (état ${final.readyState}).${mergeNote}`,
      externalUrl: `https://${final.url}`,
    };
  },
};

/** publish_post factice (Phase 3) — remplacé par Buffer/Resend réels en Phase 5. */
const fakePublishPost: WorkerExecutor = {
  canHandle: (kind) => kind === 'publish_post',
  async execute(action) {
    const text =
      typeof action.payload === 'object' && action.payload !== null
        ? String((action.payload as Record<string, unknown>).text ?? '')
        : '';
    return {
      summary: `Post publié (executor factice, Phase 3) — ${text.slice(0, 80)}…`,
      externalUrl: `fake://posts/${action.id}`,
    };
  },
};

const EXECUTORS: WorkerExecutor[] = [deployPreview, deployProd, fakePublishPost];

export function findExecutor(kind: string): WorkerExecutor | undefined {
  return EXECUTORS.find((e) => e.canHandle(kind));
}
