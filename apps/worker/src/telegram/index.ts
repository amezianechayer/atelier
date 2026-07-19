import { appendEvent } from '@atelier/core';
import {
  actions,
  conversations,
  integrations,
  messages,
  ventures,
  verifications,
} from '@atelier/db';
import { and, eq, gt, sql } from 'drizzle-orm';
import { Bot, InlineKeyboard } from 'grammy';
import { pino } from 'pino';
import { inngest } from '../inngest/client';
import { publish } from '../notify';
import type { Runtime } from '../runtime';

const logger = pino({ name: 'atelier-telegram' });

/**
 * Gateway Telegram (SPEC.md §16 Phase 6) : long polling grammY, liaison de compte
 * par code unique (table verifications), chat avec le CEO, boutons inline
 * Approve/Reject (même logique + ledger que la route web), brief du matin.
 * TELEGRAM_BOT_TOKEN absent => le worker tourne sans bot, sans casser.
 */

let bot: Bot | null = null;

const ACTION_LABEL: Record<string, string> = {
  publish_post: 'Post',
  send_email_batch: 'Emails',
  deploy_preview: 'Préversion',
  deploy_prod: 'Prod',
  research_report: 'Rapport',
  draft_post: 'Brouillon',
};

/** chatId Telegram -> utilisateur lié (integrations kind=telegram, globale). */
async function linkedUser(rt: Runtime, chatId: string): Promise<string | null> {
  const [row] = await rt.db
    .select({ userId: integrations.userId })
    .from(integrations)
    .where(
      and(eq(integrations.kind, 'telegram'), sql`${integrations.config}->>'chatId' = ${chatId}`),
    )
    .orderBy(sql`${integrations.createdAt} desc`)
    .limit(1);
  return row?.userId ?? null;
}

/** Venture active du chat : config.activeVentureId, sinon la première de l'utilisateur. */
async function activeVenture(
  rt: Runtime,
  userId: string,
): Promise<{ id: string; name: string } | null> {
  const rows = await rt.db
    .select({ id: ventures.id, name: ventures.name })
    .from(ventures)
    .where(eq(ventures.userId, userId));
  if (rows.length === 0) return null;
  const [link] = await rt.db
    .select({ config: integrations.config })
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.kind, 'telegram')))
    .limit(1);
  const wanted = (link?.config as { activeVentureId?: string } | null)?.activeVentureId;
  return rows.find((v) => v.id === wanted) ?? rows[0] ?? null;
}

/** Décision depuis Telegram — MÊME contrat que la route web (statut + ledger + action.decided). */
async function decideFromTelegram(
  rt: Runtime,
  userId: string,
  actionId: string,
  decision: 'approved' | 'rejected',
): Promise<string> {
  const { db } = rt;
  const [row] = await db
    .select({ action: actions })
    .from(actions)
    .innerJoin(ventures, eq(ventures.id, actions.ventureId))
    .where(and(eq(actions.id, actionId), eq(ventures.userId, userId)));
  if (!row) return 'Action introuvable (ou pas la tienne).';
  if (row.action.status !== 'pending') {
    return `Déjà « ${row.action.status} ».`;
  }
  const [updated] = await db
    .update(actions)
    .set({ status: decision, decidedBy: userId, decidedAt: new Date() })
    .where(and(eq(actions.id, actionId), eq(actions.status, 'pending')))
    .returning({ id: actions.id });
  if (!updated) return 'Décision déjà prise ailleurs.';

  await appendEvent(db, row.action.ventureId, 'action_decided', {
    actionId,
    decision,
    decidedBy: userId,
    via: 'telegram',
  });
  await publish(db, row.action.ventureId, { type: 'action.decided', actionId, decision });
  await inngest.send({
    name: 'action.decided',
    data: { actionId, ventureId: row.action.ventureId, decision },
  });
  return decision === 'approved' ? '✓ Approuvée — exécution en cours.' : '✕ Rejetée.';
}

export function startTelegramBot(rt: Runtime): Bot | null {
  if (rt.env.TELEGRAM_BOT_TOKEN === '') {
    logger.info('TELEGRAM_BOT_TOKEN absent : gateway Telegram désactivé (réglable dans .env)');
    return null;
  }
  const b = new Bot(rt.env.TELEGRAM_BOT_TOKEN);

  b.command('start', async (ctx) => {
    const code = (ctx.match ?? '').trim().toUpperCase();
    const chatId = String(ctx.chat.id);
    if (code === '') {
      const userId = await linkedUser(rt, chatId);
      await ctx.reply(
        userId
          ? 'Compte déjà lié ✓ Écris-moi pour parler à ton CEO, /ventures pour changer de venture.'
          : 'Bienvenue sur Atelier ! Va dans Réglages → Telegram sur le site pour obtenir ton code, puis envoie /start TONCODE.',
      );
      return;
    }
    const [pending] = await rt.db
      .select({ id: verifications.id, value: verifications.value })
      .from(verifications)
      .where(
        and(
          eq(verifications.identifier, `tg-link:${code}`),
          gt(verifications.expiresAt, new Date()),
        ),
      );
    if (!pending) {
      await ctx.reply('Code invalide ou expiré. Regénère-le dans Réglages → Telegram.');
      return;
    }
    const userId = pending.value;
    const username = ctx.from?.username ?? null;
    const [existing] = await rt.db
      .select({ id: integrations.id, config: integrations.config })
      .from(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.kind, 'telegram')))
      .limit(1);
    if (existing) {
      await rt.db
        .update(integrations)
        .set({ config: { ...(existing.config as object), chatId, username } })
        .where(eq(integrations.id, existing.id));
    } else {
      await rt.db
        .insert(integrations)
        .values({ userId, kind: 'telegram', config: { chatId, username } });
    }
    await rt.db.delete(verifications).where(eq(verifications.id, pending.id));
    const venture = await activeVenture(rt, userId);
    await ctx.reply(
      `Compte lié ✓${venture ? ` Venture active : ${venture.name}.` : ''} Écris-moi pour parler à ton CEO. Le brief du matin arrivera ici si tu choisis le canal Telegram.`,
    );
  });

  b.command('ventures', async (ctx) => {
    const userId = await linkedUser(rt, String(ctx.chat.id));
    if (!userId) {
      await ctx.reply('Compte non lié : /start TONCODE (code dans Réglages → Telegram).');
      return;
    }
    const rows = await rt.db
      .select({ id: ventures.id, name: ventures.name, status: ventures.status })
      .from(ventures)
      .where(eq(ventures.userId, userId));
    if (rows.length === 0) {
      await ctx.reply('Aucune venture. Crée-en une sur le site.');
      return;
    }
    const active = await activeVenture(rt, userId);
    const list = rows
      .map((v, i) => `${v.id === active?.id ? '▶' : '·'} ${i + 1}. ${v.name} (${v.status})`)
      .join('\n');
    await ctx.reply(`${list}\n\nChange avec /venture <numéro>.`);
  });

  b.command('venture', async (ctx) => {
    const userId = await linkedUser(rt, String(ctx.chat.id));
    if (!userId) {
      await ctx.reply('Compte non lié : /start TONCODE.');
      return;
    }
    const n = Number((ctx.match ?? '').trim());
    const rows = await rt.db
      .select({ id: ventures.id, name: ventures.name })
      .from(ventures)
      .where(eq(ventures.userId, userId));
    const picked = Number.isInteger(n) ? rows[n - 1] : undefined;
    if (!picked) {
      await ctx.reply(`Numéro invalide (1-${rows.length}). Liste : /ventures`);
      return;
    }
    const [link] = await rt.db
      .select({ id: integrations.id, config: integrations.config })
      .from(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.kind, 'telegram')))
      .limit(1);
    if (link) {
      await rt.db
        .update(integrations)
        .set({ config: { ...(link.config as object), activeVentureId: picked.id } })
        .where(eq(integrations.id, link.id));
    }
    await ctx.reply(`Venture active : ${picked.name} ✓`);
  });

  // Boutons inline Approve/Reject : d:<actionId>:a|r
  b.callbackQuery(/^d:([0-9a-f-]{36}):(a|r)$/, async (ctx) => {
    const chatId = String(ctx.chat?.id ?? '');
    const userId = await linkedUser(rt, chatId);
    if (!userId) {
      await ctx.answerCallbackQuery({ text: 'Compte non lié.' });
      return;
    }
    const actionId = String(ctx.match[1]);
    const decision = ctx.match[2] === 'a' ? 'approved' : 'rejected';
    const outcome = await decideFromTelegram(rt, userId, actionId, decision);
    await ctx.answerCallbackQuery({ text: outcome });
    await ctx.reply(outcome);
  });

  // Tout texte libre = chat avec le CEO de la venture active (pipeline web réutilisé).
  b.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    const chatId = String(ctx.chat.id);
    const userId = await linkedUser(rt, chatId);
    if (!userId) {
      await ctx.reply('Compte non lié : envoie /start TONCODE (code dans Réglages → Telegram).');
      return;
    }
    const venture = await activeVenture(rt, userId);
    if (!venture) {
      await ctx.reply('Aucune venture. Crée-en une sur le site, puis reviens me voir.');
      return;
    }
    let [conversation] = await rt.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.ventureId, venture.id),
          eq(conversations.channel, 'telegram'),
          eq(conversations.externalChatId, chatId),
        ),
      );
    if (!conversation) {
      [conversation] = await rt.db
        .insert(conversations)
        .values({ ventureId: venture.id, channel: 'telegram', externalChatId: chatId })
        .returning({ id: conversations.id });
    }
    if (!conversation) return;
    await rt.db
      .insert(messages)
      .values({ conversationId: conversation.id, role: 'user', content: ctx.message.text });
    await ctx.replyWithChatAction('typing');
    await inngest.send({
      name: 'chat.message',
      data: { ventureId: venture.id, conversationId: conversation.id },
    });
  });

  b.catch((err) => logger.error({ err: err.error }, 'erreur bot Telegram'));
  void b.start({
    onStart: (me) => logger.info({ username: me.username }, 'bot Telegram démarré (long polling)'),
  });
  bot = b;
  return b;
}

/** Envoi d'un texte (découpé sous la limite Telegram). No-op si le bot est éteint. */
export async function sendTelegramText(chatId: string, text: string): Promise<boolean> {
  if (!bot) return false;
  for (let i = 0; i < text.length; i += 4000) {
    await bot.api.sendMessage(chatId, text.slice(i, i + 4000));
  }
  return true;
}

/** Brief du matin avec boutons inline par action en attente (SPEC.md §8.3). */
export async function sendNightBrief(
  rt: Runtime,
  input: {
    userId: string;
    briefText: string;
    pendingActions: Array<{ id: string; kind: string }>;
  },
): Promise<boolean> {
  if (!bot) return false;
  const [link] = await rt.db
    .select({ config: integrations.config })
    .from(integrations)
    .where(and(eq(integrations.userId, input.userId), eq(integrations.kind, 'telegram')))
    .limit(1);
  const chatId = (link?.config as { chatId?: string } | null)?.chatId;
  if (!chatId) return false;

  const keyboard = new InlineKeyboard();
  for (const [i, action] of input.pendingActions.slice(0, 8).entries()) {
    const label = ACTION_LABEL[action.kind] ?? action.kind;
    keyboard
      .text(`✓ ${label} ${i + 1}`, `d:${action.id}:a`)
      .text(`✕ ${label} ${i + 1}`, `d:${action.id}:r`)
      .row();
  }
  await bot.api.sendMessage(chatId, input.briefText, {
    ...(input.pendingActions.length > 0 ? { reply_markup: keyboard } : {}),
  });
  return true;
}
