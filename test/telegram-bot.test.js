// test/telegram-bot.test.js
// Task 7: Telegram welcome bot handlers unit tests with fake ctx objects.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  createClaimLimiter,
  escapeHtml,
  handleChatMigration,
  handleClaimCommand,
  handleMyChatMember,
  handleNewChatMembers,
} from '../src/bots/telegram/handlers.js';
import { pool } from '../src/db/pool.js';

const createdCommunityIds = [];
const createdUserIds = [];

test('Telegram bot handlers unit tests', async (t) => {
  t.after(async () => {
    if (createdCommunityIds.length > 0) {
      await pool.query('DELETE FROM bot_installs WHERE community_id = ANY($1)', [createdCommunityIds]);
      await pool.query('DELETE FROM communities WHERE id = ANY($1)', [createdCommunityIds]);
    }
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [createdUserIds]);
    }
    await pool.end();
  });

  const catRes = await pool.query("SELECT id FROM categories WHERE slug = 'gaming' LIMIT 1");
  const catId = catRes.rows[0].id;

  const userRes = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, 'hash') RETURNING id",
    [`bot-test-${crypto.randomUUID()}@example.test`]
  );
  const ownerId = userRes.rows[0].id;
  createdUserIds.push(ownerId);

  const chatId = -100777000111;
  const commRes = await pool.query(`
    INSERT INTO communities (
      category_id, name, platform, member_count, invite_link, canonical_link, status, owner_id, external_id
    ) VALUES ($1, 'Dev & Testing <HQ>', 'telegram', 10, 'https://t.me/dev_test_hq', 'https://t.me/dev_test_hq', 'approved', $2, $3)
    RETURNING id
  `, [catId, ownerId, String(chatId)]);
  const commId = commRes.rows[0].id;
  createdCommunityIds.push(commId);

  const botRes = await pool.query("SELECT id FROM bots WHERE slug = 'welcome'");
  const botId = botRes.rows[0].id;

  await pool.query(`
    INSERT INTO bot_installs (bot_id, community_id, external_chat_id, installed_by, is_active, config)
    VALUES ($1, $2, $3, $4, true, $5)
  `, [
    botId,
    commId,
    String(chatId),
    ownerId,
    JSON.stringify({
      greeting_template: 'Welcome <header> & {user} to {group_name}! Rules: {rules}. Count: {member_count}',
      rules_text: 'No <spam> & be nice',
    }),
  ]);

  // 1. HTML escaping test
  assert.equal(escapeHtml('Hello <world> & "foo"'), 'Hello &lt;world&gt; &amp; "foo"');

  // 2. Greeting escaping, batching, and member_count
  const replies = [];
  const fakeCtxBatch = {
    chat: { id: chatId, title: 'Dev & Testing <HQ>' },
    botInfo: { id: 99999 },
    message: {
      new_chat_members: [
        { id: 101, is_bot: false, first_name: '<b>Hacker</b>' },
        { id: 102, is_bot: false, first_name: '{rules}' },
        { id: 103, is_bot: false, first_name: 'Alice & Bob' },
      ],
    },
    getChatMembersCount: async () => 42,
    reply: async (text, options) => {
      replies.push({ text, options });
    },
  };

  await handleNewChatMembers(fakeCtxBatch, { db: pool, botInfo: { id: 99999 } });

  // Batching: only 1 message sent for 3 users
  assert.equal(replies.length, 1, 'exactly one batched message sent');
  const sentMsg = replies[0].text;
  assert.equal(replies[0].options.parse_mode, 'HTML');

  // Verify escaping: template <header> & escaped
  assert.ok(sentMsg.includes('&lt;header&gt; &amp;'), 'template html tags escaped');
  // Verify user mentions: names properly escaped
  assert.ok(sentMsg.includes('<a href="tg://user?id=101">&lt;b&gt;Hacker&lt;/b&gt;</a>'));
  assert.ok(sentMsg.includes('<a href="tg://user?id=102">{rules}</a>'));
  assert.ok(sentMsg.includes('<a href="tg://user?id=103">Alice &amp; Bob</a>'));
  // Single-pass replacement: user named {rules} did NOT get replaced by rules text!
  assert.ok(sentMsg.includes('Rules: No &lt;spam&gt; &amp; be nice. Count: 42'));
  // Group name escaped
  assert.ok(sentMsg.includes('Dev &amp; Testing &lt;HQ&gt;'));

  // 3. Skipping bots
  const botReplies = [];
  const fakeCtxBots = {
    chat: { id: chatId },
    botInfo: { id: 99999 },
    message: {
      new_chat_members: [
        { id: 8888, is_bot: true, first_name: 'SomeBot' },
        { id: 99999, is_bot: false, first_name: 'SelfBot' },
      ],
    },
    reply: async (text) => {
      botReplies.push(text);
    },
  };
  await handleNewChatMembers(fakeCtxBots, { db: pool, botInfo: { id: 99999 } });
  assert.equal(botReplies.length, 0, 'no message sent when only bots join');

  // 4. Claim command: private chat rejected
  const privReplies = [];
  const fakeCtxPrivate = {
    chat: { type: 'private', id: 12345 },
    from: { id: 12345 },
    message: { text: '/oninna_claim ABCDEF23' },
    reply: async (msg) => { privReplies.push(msg); },
  };
  await handleClaimCommand(fakeCtxPrivate, { db: pool });
  assert.equal(privReplies.length, 1);
  assert.equal(privReplies[0], 'Please run this command inside the group you want to claim.');
  assert.ok(!privReplies[0].includes('ABCDEF23'), 'never echo code');

  // 5. Claim command: rate limiting (5 attempts per 10 minutes)
  const limiter = createClaimLimiter();
  const limitReplies = [];
  const fakeCtxLimit = {
    chat: { type: 'supergroup', id: -100888111222 },
    from: { id: 555666 },
    message: { text: '/oninna_claim WRONGCODE' },
    reply: async (msg) => { limitReplies.push(msg); },
    telegram: {
      getChat: async () => ({ id: -100888111222 }),
      getChatMember: async () => ({ status: 'member' }),
    },
  };

  for (let i = 0; i < 5; i++) {
    await handleClaimCommand(fakeCtxLimit, {
      db: pool,
      limiter,
      claimFn: async () => ({ ok: false, reason: 'sender_not_admin' }),
    });
  }
  assert.equal(limitReplies.length, 5);
  assert.equal(limitReplies[0], 'You must be an administrator in this group to claim it.');

  // 6th attempt should be rate limited
  await handleClaimCommand(fakeCtxLimit, {
    db: pool,
    limiter,
    claimFn: async () => ({ ok: false, reason: 'sender_not_admin' }),
  });
  assert.equal(limitReplies.length, 6);
  assert.equal(limitReplies[5], 'Too many attempts. Please try again later.');

  // 6. Claim failure replies do not echo code
  const failReplies = [];
  const fakeCtxFail = {
    chat: { type: 'supergroup', id: -100888111222 },
    from: { id: 777888 },
    message: { text: '/oninna_claim SENSITIVE123' },
    reply: async (msg) => { failReplies.push(msg); },
    telegram: {
      getChat: async () => ({ id: -100888111222 }),
      getChatMember: async () => ({ status: 'member' }),
    },
  };
  await handleClaimCommand(fakeCtxFail, {
    db: pool,
    limiter: createClaimLimiter(),
    claimFn: async () => ({ ok: false, reason: 'bot_not_admin' }),
  });
  assert.equal(failReplies[0], 'Bot must be an administrator in this group.');
  assert.ok(!failReplies[0].includes('SENSITIVE123'), 'never echo claim code');

  // 7. Claim success: installs welcome bot, tries to delete message, replies fixed success
  let deletedMessage = false;
  const successReplies = [];
  const fakeCtxSuccess = {
    chat: { type: 'supergroup', id: chatId },
    from: { id: 999111 },
    message: { text: '/oninna_claim WINCODE1', message_id: 42 },
    deleteMessage: async () => { deletedMessage = true; },
    reply: async (msg) => { successReplies.push(msg); },
    telegram: {
      getChat: async () => ({ id: chatId }),
      getChatMember: async () => ({ status: 'administrator' }),
    },
  };

  await handleClaimCommand(fakeCtxSuccess, {
    db: pool,
    botInfo: { id: 99999 },
    limiter: createClaimLimiter(),
    claimFn: async () => ({ ok: true, communityId: commId, ownerId }),
  });

  assert.equal(deletedMessage, true, 'command message deletion was attempted');
  assert.equal(successReplies.length, 1);
  assert.equal(successReplies[0], 'Community claimed successfully.');
  assert.ok(!successReplies[0].includes('WINCODE1'));

  // 8. Migration handling
  const newSupergroupId = -100888777666;
  const fakeCtxMigrate = {
    chat: { id: chatId },
    message: { migrate_to_chat_id: newSupergroupId },
  };
  await handleChatMigration(fakeCtxMigrate, { db: pool });

  const commAfterMigrate = (await pool.query(
    'SELECT external_id FROM communities WHERE id = $1',
    [commId]
  )).rows[0];
  assert.equal(commAfterMigrate.external_id, String(newSupergroupId));

  // 9. My chat member left / kicked
  const fakeCtxKicked = {
    chat: { id: newSupergroupId },
    myChatMember: { new_chat_member: { status: 'kicked' } },
  };
  await handleMyChatMember(fakeCtxKicked, { db: pool });

  const installAfterKicked = (await pool.query(
    'SELECT is_active FROM bot_installs WHERE community_id = $1',
    [commId]
  )).rows[0];
  assert.equal(installAfterKicked.is_active, false, 'bot install marked inactive on kick');
});
