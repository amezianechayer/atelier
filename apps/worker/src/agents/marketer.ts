import { memoryDocs, outreachContacts } from '@atelier/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { proposeAction } from '../actions';
import type { Runtime } from '../runtime';

/**
 * Marketer (SPEC.md §2.3, §8.4) : plan de contenu (3 posts) OU séquence de prospection
 * email. Tout part en file d'approbation par défaut (actions classe C). Il PROPOSE :
 * l'envoi réel (filtrage suppression list + quota + unsubscribe) est fait par l'executor.
 */

const EMAIL_HINTS = /(email|e-mail|mail|prospection|relance|séquence|cold|outreach|newsletter)/i;

const postsSchema = z.object({
  posts: z
    .array(z.object({ channel: z.string(), text: z.string().min(1).max(1200) }))
    .min(3)
    .max(3),
});

const emailSchema = z.object({
  subject: z.string().min(1).max(120),
  body: z
    .string()
    .min(1)
    .max(2000)
    .describe(
      'Corps de l’email. Utilise {{firstName}} pour personnaliser. Pas de lien unsubscribe (ajouté en code).',
    ),
});

async function marketerVoice(rt: Runtime, ventureId: string): Promise<string> {
  const docs = await rt.db
    .select({ slug: memoryDocs.slug, content: memoryDocs.content, version: memoryDocs.version })
    .from(memoryDocs)
    .where(eq(memoryDocs.ventureId, ventureId))
    .orderBy(desc(memoryDocs.version));
  const bySlug = new Map<string, string>();
  for (const d of docs) if (!bySlug.has(d.slug)) bySlug.set(d.slug, d.content);
  return ['brand', 'tone', 'icp']
    .map((s) => bySlug.get(s))
    .filter((c): c is string => Boolean(c))
    .join('\n\n');
}

function systemPrompt(ventureName: string, pitch: string, voice: string): string {
  return `Tu es le Marketer de « ${ventureName} » (pitch : ${pitch}).
${voice ? `Voix de marque :\n${voice}\n` : ''}Tu écris en français, percutant et honnête. Tu PROPOSES : rien ne part sans l'accord du fondateur.`;
}

export async function runMarketer(input: {
  rt: Runtime;
  ventureId: string;
  missionId: string;
  ventureName: string;
  pitch: string;
  instruction: string;
  onDelta(text: string): Promise<void>;
}): Promise<{ summary: string; actionIds: string[] }> {
  const { rt, ventureId, missionId, instruction } = input;
  const voice = await marketerVoice(rt, ventureId);
  const system = systemPrompt(input.ventureName, input.pitch, voice);
  const router = input.rt.routerFor(ventureId, { missionId });
  const actionIds: string[] = [];

  // Mode prospection email : séquence + destinataires depuis les contacts « new ».
  if (EMAIL_HINTS.test(instruction)) {
    const { object } = await router.generateObject({
      role: 'marketer',
      system,
      prompt:
        `Mission : ${instruction}\n` +
        'Rédige UN email de prospection B2B court, chaleureux et à valeur (pas de spam). ' +
        'Français. {{firstName}} pour personnaliser.',
      schema: emailSchema,
      maxOutputTokens: 900,
    });
    await input.onDelta(`Sujet : ${object.subject}\n\n${object.body}`);

    const contacts = await rt.db
      .select({
        email: outreachContacts.email,
        firstName: outreachContacts.firstName,
        company: outreachContacts.company,
        source: outreachContacts.source,
      })
      .from(outreachContacts)
      .where(
        and(eq(outreachContacts.ventureId, ventureId), inArray(outreachContacts.status, ['new'])),
      )
      .limit(50);

    const proposed = await proposeAction(rt, {
      ventureId,
      missionId,
      kind: 'send_email_batch',
      payload: { subject: object.subject, body: object.body, recipients: contacts },
    });
    actionIds.push(proposed.actionId);
    return {
      summary: `Séquence email prête : ${contacts.length} destinataire(s) sourcé(s) en attente de ton accord (le filtrage suppression list + quota s'applique à l'envoi).`,
      actionIds,
    };
  }

  // Mode contenu : 3 posts distincts, chacun en file d'approbation.
  const { object } = await router.generateObject({
    role: 'marketer',
    system,
    prompt:
      `Mission : ${instruction}\n` +
      'Produis EXACTEMENT 3 posts distincts, prêts à publier (pas de méta-commentaire), ' +
      'variés dans l’angle. Précise pour chacun le réseau (channel) conseillé.',
    schema: postsSchema,
    maxOutputTokens: 1500,
  });
  await input.onDelta(
    object.posts.map((p, i) => `Post ${i + 1} (${p.channel})\n${p.text}`).join('\n\n'),
  );

  for (const post of object.posts) {
    const proposed = await proposeAction(rt, {
      ventureId,
      missionId,
      kind: 'publish_post',
      payload: { text: post.text, channel: post.channel },
    });
    actionIds.push(proposed.actionId);
  }
  return { summary: `3 posts proposés à ton approbation (aperçu exact dans la file).`, actionIds };
}
