/**
 * Intégration Vercel (SPEC.md §2.3, §11) — handler serveur, token executor-side.
 * Déploiement par upload de fichiers inline (POST /v13/deployments), preview
 * (target omis) ou production (target: "production"). Le build Next tourne côté
 * Vercel. Vérifié le 2026-07-16 (ADR 0006). Zéro dépendance.
 */

const VERCEL = 'https://api.vercel.com';

export interface VercelDeployInput {
  token: string;
  /** Nom du projet Vercel (créé au premier déploiement, sur le compte de l'utilisateur). */
  name: string;
  /** Fichiers du site, chemin -> contenu texte. */
  files: Record<string, string>;
  /** true = production (target: production), false/omit = préversion. */
  production?: boolean;
  gitRemoteUrl?: string;
  commitSha?: string;
}

export interface VercelDeployment {
  id: string;
  url: string;
  readyState: string;
}

export async function createDeployment(input: VercelDeployInput): Promise<VercelDeployment> {
  const body = {
    name: input.name,
    files: Object.entries(input.files).map(([file, data]) => ({ file, data, encoding: 'utf-8' })),
    projectSettings: { framework: 'nextjs' },
    ...(input.production ? { target: 'production' } : {}),
    ...(input.gitRemoteUrl && input.commitSha
      ? { gitMetadata: { remoteUrl: input.gitRemoteUrl, commitSha: input.commitSha } }
      : {}),
  };

  const res = await fetch(`${VERCEL}/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Vercel POST /v13/deployments → HTTP ${res.status} : ${detail}`);
  }
  const dep = (await res.json()) as { id: string; url: string; readyState: string };
  return { id: dep.id, url: dep.url, readyState: dep.readyState };
}

/** Poll jusqu'à READY/ERROR/CANCELED (ou timeout). Renvoie l'état final + l'URL. */
export async function pollDeployment(
  token: string,
  deploymentId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<{ readyState: string; url: string }> {
  const timeoutMs = opts.timeoutMs ?? 240_000;
  const intervalMs = opts.intervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${VERCEL}/v13/deployments/${deploymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Vercel GET deployment → HTTP ${res.status} : ${detail}`);
    }
    const dep = (await res.json()) as { readyState?: string; status?: string; url: string };
    const state = dep.readyState ?? dep.status ?? 'UNKNOWN';
    if (state === 'READY' || state === 'ERROR' || state === 'CANCELED') {
      return { readyState: state, url: dep.url };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Vercel : déploiement ${deploymentId} toujours en cours après ${timeoutMs} ms.`);
}
