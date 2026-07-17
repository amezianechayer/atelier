/**
 * Publication sociale (SPEC.md §2.3, §5) — v1 via Buffer, avec repli « copier le post »
 * quand aucun compte Buffer n'est connecté. Le token vit côté serveur (ActionExecutor).
 */

export interface SocialPost {
  text: string;
  /** Réseau visé (indicatif en v1). */
  channel?: string;
}

/**
 * Repli « copier le post » (SPEC.md §5) : quand Buffer n'est pas connecté, le produit
 * ne bloque pas — il rend le post prêt à coller et le marque exécuté.
 */
export function bufferPublishHint(post: SocialPost): { summary: string; copyText: string } {
  const where = post.channel ? ` sur ${post.channel}` : '';
  return {
    summary: `Buffer non connecté : copie ce post et publie-le${where} en un geste.`,
    copyText: post.text,
  };
}

/**
 * Publie via l'API Buffer (quand un profil est connecté). Buffer crée l'update sur le
 * profil et le publie immédiatement (now:true). Renvoie l'id de l'update.
 */
export async function publishToBuffer(
  input: { accessToken: string; profileId: string; post: SocialPost },
  fetchFn: typeof fetch = fetch,
): Promise<{ updateId: string }> {
  const form = new URLSearchParams();
  form.set('profile_ids[]', input.profileId);
  form.set('text', input.post.text);
  form.set('now', 'true');

  const res = await fetchFn('https://api.bufferapp.com/1/updates/create.json', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Buffer create.json → HTTP ${res.status} : ${detail}`);
  }
  const body = (await res.json()) as { updates?: Array<{ id?: string }> };
  const updateId = body.updates?.[0]?.id ?? '';
  return { updateId };
}
