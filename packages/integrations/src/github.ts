/**
 * Intégration GitHub (SPEC.md §2.3, §11) — handler serveur. Le token vit ici
 * (ActionExecutor), jamais dans la sandbox ni les prompts. Le repo appartient à
 * L'UTILISATEUR (différenciateur n°1). Push multi-fichiers en UN commit via la
 * Git Data API. Zéro dépendance (fetch).
 */

const GH = 'https://api.github.com';

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'atelier-builder',
  };
}

async function gh<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GH}${path}`, {
    ...init,
    headers: { ...headers(token), ...init?.headers },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GitHub ${init?.method ?? 'GET'} ${path} → HTTP ${res.status} : ${detail}`);
  }
  return (await res.json()) as T;
}

export interface GithubRepoRef {
  owner: string;
  repo: string;
}

/** Vérifie le token et renvoie le login + l'id du compte (config, jamais de secret). */
export async function getGithubUser(token: string): Promise<{ login: string; id: number }> {
  const user = await gh<{ login: string; id: number }>(token, '/user');
  return { login: user.login, id: user.id };
}

/**
 * Pousse un ensemble de fichiers en UN commit sur `branch` (créée si absente à partir
 * de la branche par défaut). Renvoie l'URL du commit et de l'arbre sur la branche.
 */
export async function pushFiles(
  token: string,
  ref: GithubRepoRef,
  input: { branch: string; files: Record<string, string>; commitMessage: string },
): Promise<{ commitSha: string; branch: string; htmlUrl: string }> {
  const base = `/repos/${ref.owner}/${ref.repo}`;
  const repo = await gh<{ default_branch: string; html_url: string }>(token, base);

  // Base commit : la branche cible si elle existe, sinon la branche par défaut.
  let baseSha: string;
  let branchExists = true;
  try {
    const targetRef = await gh<{ object: { sha: string } }>(
      token,
      `${base}/git/ref/heads/${encodeURIComponent(input.branch)}`,
    );
    baseSha = targetRef.object.sha;
  } catch {
    branchExists = false;
    const defRef = await gh<{ object: { sha: string } }>(
      token,
      `${base}/git/ref/heads/${encodeURIComponent(repo.default_branch)}`,
    );
    baseSha = defRef.object.sha;
  }

  const baseCommit = await gh<{ tree: { sha: string } }>(token, `${base}/git/commits/${baseSha}`);

  const tree = await gh<{ sha: string }>(token, `${base}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: Object.entries(input.files).map(([path, content]) => ({
        path,
        mode: '100644',
        type: 'blob',
        content,
      })),
    }),
  });

  const commit = await gh<{ sha: string }>(token, `${base}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: input.commitMessage, tree: tree.sha, parents: [baseSha] }),
  });

  const refPath = `heads/${input.branch}`;
  if (branchExists) {
    await gh(token, `${base}/git/refs/${refPath}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } else {
    await gh(token, `${base}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/${refPath}`, sha: commit.sha }),
    });
  }

  return {
    commitSha: commit.sha,
    branch: input.branch,
    htmlUrl: `${repo.html_url}/tree/${input.branch}`,
  };
}
