// src/claims/service.js
// Claim service with injected dependencies for offline testing.

import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { classifyInviteLink } from '../utils/links.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const claimStartLimiter = createRateLimiter(5, 60 * 60 * 1000);

export function generateClaimCode() {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return code;
}

export async function startClaim(userId, communityId, { db = pool, limiter = claimStartLimiter } = {}) {
  const attempt = limiter.attempt(String(userId));
  if (!attempt.allowed) {
    return { error: 'rate_limited', retryAfter: attempt.retryAfter };
  }

  const result = await db.query(`
    SELECT
      communities.id,
      communities.status,
      communities.platform,
      communities.invite_link,
      communities.owner_id,
      communities.claim_code,
      communities.claim_code_expires_at,
      communities.claim_requested_by
    FROM communities
    WHERE communities.id = $1
  `, [communityId]);

  if (result.rowCount === 0) {
    return { error: 'not_found' };
  }

  const community = result.rows[0];
  if (community.status !== 'approved') {
    return { error: 'not_found' };
  }

  const classified = classifyInviteLink(community.invite_link);

  // If already owned or not telegram_public -> manual review
  let reviewReason = null;
  if (community.owner_id !== null) {
    reviewReason = 'already_owned';
  } else if (!classified || classified.kind !== 'telegram_public') {
    if (classified?.kind === 'telegram_private') {
      reviewReason = 'private_link';
    } else if (community.platform === 'discord') {
      reviewReason = 'discord_manual';
    } else if (community.platform === 'whatsapp') {
      reviewReason = 'whatsapp_manual';
    } else {
      reviewReason = 'other_manual';
    }
  }

  if (reviewReason) {
    await db.query(`
      INSERT INTO claim_reviews (community_id, requested_by, reason, status)
      VALUES ($1, $2, $3, 'pending')
      ON CONFLICT (community_id, requested_by) WHERE status = 'pending' DO NOTHING
    `, [community.id, userId, reviewReason]);
    return { type: 'review' };
  }

  // Active unexpired code check from another user
  if (community.claim_code && community.claim_code_expires_at) {
    const expiresAt = new Date(community.claim_code_expires_at);
    const now = new Date();
    if (expiresAt > now && community.claim_requested_by !== userId) {
      const minutesLeft = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / (60 * 1000)));
      return { error: 'conflict', minutesLeft };
    }
  }

  const code = generateClaimCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await db.query(`
    UPDATE communities
    SET claim_code = $1,
        claim_code_expires_at = $2,
        claim_requested_by = $3
    WHERE id = $4
  `, [code, expiresAt.toISOString(), userId, community.id]);

  return {
    type: 'code',
    code,
    expires_at: expiresAt.toISOString(),
    command: `/oninna_claim ${code}`,
  };
}

export async function completeTelegramClaim({
  code,
  chat,
  senderId,
  botUserId,
  getChat,
  getChatMember,
  db = pool,
}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(`
      SELECT
        communities.id,
        communities.platform,
        communities.invite_link,
        communities.owner_id,
        communities.claim_requested_by,
        communities.claim_code,
        communities.claim_code_expires_at
      FROM communities
      WHERE communities.claim_code = $1
        AND communities.claim_code_expires_at > now()
      FOR UPDATE
    `, [code]);

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'expired_or_invalid_code' };
    }

    const community = result.rows[0];

    if (community.owner_id !== null) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'already_owned' };
    }

    if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'invalid_chat_type' };
    }

    let botMember;
    try {
      botMember = await getChatMember(chat.id, botUserId);
    } catch {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'bot_not_admin' };
    }

    if (!botMember || botMember.status !== 'administrator') {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'bot_not_admin' };
    }

    let senderMember;
    try {
      senderMember = await getChatMember(chat.id, senderId);
    } catch {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'sender_not_admin' };
    }

    if (!senderMember || (senderMember.status !== 'administrator' && senderMember.status !== 'creator')) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'sender_not_admin' };
    }

    const classified = classifyInviteLink(community.invite_link);
    const username = classified?.username;
    if (!username) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'not_public_telegram' };
    }

    let targetChat;
    try {
      targetChat = await getChat('@' + username);
    } catch {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'chat_mismatch' };
    }

    if (!targetChat || String(targetChat.id) !== String(chat.id)) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'chat_mismatch' };
    }

    try {
      await client.query(`
        UPDATE communities
        SET external_id = $1,
            owner_id = claim_requested_by,
            claim_code = NULL,
            claim_code_expires_at = NULL,
            claim_requested_by = NULL
        WHERE id = $2
      `, [String(chat.id), community.id]);

      await client.query('COMMIT');
      return { ok: true, communityId: community.id, ownerId: community.claim_requested_by };
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        await db.query(`
          INSERT INTO claim_reviews (community_id, requested_by, reason, status)
          VALUES ($1, $2, 'external_id_conflict', 'pending')
          ON CONFLICT (community_id, requested_by) WHERE status = 'pending' DO NOTHING
        `, [community.id, community.claim_requested_by]);
        return { ok: false, reason: 'external_id_conflict' };
      }
      throw err;
    }
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}
