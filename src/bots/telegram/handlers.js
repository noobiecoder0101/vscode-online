// src/bots/telegram/handlers.js
// Pure handler functions for Telegram welcome bot with injected dependencies.

import { completeTelegramClaim } from '../../claims/service.js';
import { pool } from '../../db/pool.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function createClaimLimiter() {
  return createRateLimiter(5, 10 * 60 * 1000);
}

const defaultClaimLimiter = createClaimLimiter();

export async function handleNewChatMembers(ctx, { db = pool, botInfo } = {}) {
  try {
    const newMembers = ctx.message?.new_chat_members;
    if (!Array.isArray(newMembers) || newMembers.length === 0) return;

    const botId = botInfo?.id || ctx.botInfo?.id;
    const validJoiners = newMembers.filter((u) => {
      if (u.is_bot) return false;
      if (botId && u.id === botId) return false;
      return true;
    });

    if (validJoiners.length === 0) return;

    const externalChatId = String(ctx.chat.id);

    const installResult = await db.query(`
      SELECT
        bot_installs.id,
        bot_installs.config,
        communities.name AS group_name
      FROM bot_installs
      INNER JOIN communities ON communities.id = bot_installs.community_id
      WHERE bot_installs.external_chat_id = $1
        AND bot_installs.is_active = true
    `, [externalChatId]);

    if (installResult.rowCount === 0) return;

    const install = installResult.rows[0];
    const config = install.config || {};
    const rawTemplate = config.greeting_template || 'Welcome {user} to {group_name}! Please read {rules}';

    let memberCount = '';
    if (rawTemplate.includes('{member_count}')) {
      try {
        if (typeof ctx.getChatMembersCount === 'function') {
          memberCount = await ctx.getChatMembersCount();
        } else if (typeof ctx.telegram?.getChatMembersCount === 'function') {
          memberCount = await ctx.telegram.getChatMembersCount(ctx.chat.id);
        }
      } catch {
        memberCount = '';
      }
    }

    const userMentions = validJoiners
      .map((u) => `<a href="tg://user?id=${u.id}">${escapeHtml(u.first_name || 'User')}</a>`)
      .join(', ');

    const escapedTemplate = escapeHtml(rawTemplate);

    const replacements = {
      '{user}': userMentions,
      '{group_name}': escapeHtml(install.group_name || ctx.chat.title || ''),
      '{rules}': escapeHtml(config.rules_text || ''),
      '{member_count}': String(memberCount ?? ''),
    };

    const messageText = escapedTemplate.replace(
      /\{(user|group_name|rules|member_count)\}/g,
      (match) => (replacements[match] !== undefined ? replacements[match] : match)
    );

    try {
      if (typeof ctx.reply === 'function') {
        await ctx.reply(messageText, { parse_mode: 'HTML' });
      } else if (typeof ctx.telegram?.sendMessage === 'function') {
        await ctx.telegram.sendMessage(ctx.chat.id, messageText, { parse_mode: 'HTML' });
      }
    } catch {}
  } catch {}
}

export async function handleClaimCommand(ctx, {
  db = pool,
  botInfo,
  limiter = defaultClaimLimiter,
  claimFn = completeTelegramClaim,
} = {}) {
  try {
    if (ctx.chat?.type === 'private') {
      try {
        await ctx.reply('Please run this command inside the group you want to claim.');
      } catch {}
      return;
    }

    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    const code = parts[1];

    if (!code) {
      try {
        await ctx.reply('Please provide a claim code.');
      } catch {}
      return;
    }

    const senderId = ctx.from?.id;
    if (!senderId) return;

    const attempt = limiter.attempt(String(senderId));
    if (!attempt.allowed) {
      try {
        await ctx.reply('Too many attempts. Please try again later.');
      } catch {}
      return;
    }

    const currentBotId = botInfo?.id || ctx.botInfo?.id;

    const claimResult = await claimFn({
      code,
      chat: ctx.chat,
      senderId,
      botUserId: currentBotId,
      getChat: (handle) => ctx.telegram.getChat(handle),
      getChatMember: (chatId, userId) => ctx.telegram.getChatMember(chatId, userId),
      db,
    });

    if (!claimResult.ok) {
      const errorReplies = {
        bot_not_admin: 'Bot must be an administrator in this group.',
        sender_not_admin: 'You must be an administrator in this group to claim it.',
        chat_mismatch: 'Group username does not match listing.',
        expired_or_invalid_code: 'Invalid or expired claim code.',
        already_owned: 'This community is already claimed.',
        external_id_conflict: 'Claim submitted for manual review due to conflict.',
        invalid_chat_type: 'This command can only be used in groups.',
      };
      const replyMsg = errorReplies[claimResult.reason] || 'Claim verification failed.';
      try {
        await ctx.reply(replyMsg);
      } catch {}
      return;
    }

    // On success: create or reactivate bot_installs row for welcome bot
    const botRes = await db.query("SELECT id FROM bots WHERE slug = 'welcome'");
    if (botRes.rowCount > 0) {
      const welcomeBotId = botRes.rows[0].id;
      await db.query(`
        INSERT INTO bot_installs (bot_id, community_id, external_chat_id, installed_by, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (community_id, bot_id)
        DO UPDATE SET
          external_chat_id = EXCLUDED.external_chat_id,
          installed_by = EXCLUDED.installed_by,
          is_active = true,
          installed_at = now()
      `, [welcomeBotId, claimResult.communityId, String(ctx.chat.id), claimResult.ownerId]);
    }

    // Try to delete command message and ignore failure
    try {
      if (typeof ctx.deleteMessage === 'function') {
        await ctx.deleteMessage();
      } else if (typeof ctx.telegram?.deleteMessage === 'function') {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
      }
    } catch {}

    try {
      await ctx.reply('Community claimed successfully.');
    } catch {}
  } catch {}
}

export async function handleChatMigration(ctx, { db = pool } = {}) {
  try {
    const newChatId = ctx.message?.migrate_to_chat_id;
    if (!newChatId) return;

    const oldChatId = String(ctx.chat.id);
    const targetChatId = String(newChatId);

    await db.query(`
      UPDATE communities
      SET external_id = $1
      WHERE external_id = $2
    `, [targetChatId, oldChatId]);

    await db.query(`
      UPDATE bot_installs
      SET external_chat_id = $1
      WHERE external_chat_id = $2
    `, [targetChatId, oldChatId]);
  } catch {}
}

export async function handleMyChatMember(ctx, { db = pool } = {}) {
  try {
    const status = ctx.myChatMember?.new_chat_member?.status;
    if (status === 'left' || status === 'kicked') {
      const chatId = String(ctx.chat.id);
      await db.query(`
        UPDATE bot_installs
        SET is_active = false
        WHERE external_chat_id = $1
      `, [chatId]);
    }
  } catch {}
}
