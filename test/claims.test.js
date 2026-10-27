// test/claims.test.js
// Task 5: Claim service and API tests.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import test from 'node:test';
import { completeTelegramClaim, startClaim } from '../src/claims/service.js';
import { pool } from '../src/db/pool.js';

const port = 3015;
const base = `http://127.0.0.1:${port}`;
const createdCommunityIds = [];
const createdUserIds = [];

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Test server did not start');
}

test('claim flow service and API', async (t) => {
  const server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      JWT_SECRET: 'test-secret-with-at-least-thirty-two-characters',
    },
    stdio: 'ignore',
  });

  t.after(async () => {
    server.kill();
    if (createdCommunityIds.length > 0) {
      await pool.query('DELETE FROM claim_reviews WHERE community_id = ANY($1)', [createdCommunityIds]);
      await pool.query('DELETE FROM communities WHERE id = ANY($1)', [createdCommunityIds]);
    }
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [createdUserIds]);
    }
    await pool.end();
  });

  await waitForServer();

  // Helper to create a user directly in DB
  async function createUser(role = 'user') {
    const email = `claim-user-${crypto.randomUUID()}@example.test`;
    const res = await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, 'hash', $2) RETURNING id, email",
      [email, role]
    );
    createdUserIds.push(res.rows[0].id);
    return res.rows[0];
  }

  // Helper to create a community directly in DB
  async function createCommunity({
    platform = 'telegram',
    invite_link,
    status = 'approved',
    owner_id = null,
  }) {
    const catRes = await pool.query("SELECT id FROM categories WHERE slug = 'gaming' LIMIT 1");
    const catId = catRes.rows[0].id;
    const name = `comm-${crypto.randomUUID()}`;
    const res = await pool.query(`
      INSERT INTO communities (
        category_id, name, platform, member_count, invite_link, canonical_link, status, owner_id
      ) VALUES ($1, $2, $3, 0, $4, $4, $5, $6)
      RETURNING id
    `, [catId, name, platform, invite_link, status, owner_id]);
    createdCommunityIds.push(res.rows[0].id);
    return res.rows[0].id;
  }

  const user1 = await createUser('user');
  const user2 = await createUser('user');
  const staffUser = await createUser('staff');

  // Test 1: Private link -> startClaim returns { type: 'review' }
  const privateCommId = await createCommunity({
    invite_link: 'https://t.me/+PrivateCode123',
  });
  const privateRes = await startClaim(user1.id, privateCommId);
  assert.deepEqual(privateRes, { type: 'review' }, 'private link triggers review');
  const reviewRow = await pool.query(
    'SELECT reason FROM claim_reviews WHERE community_id = $1 AND requested_by = $2',
    [privateCommId, user1.id]
  );
  assert.equal(reviewRow.rows[0].reason, 'private_link');

  // Test 2: Already owned listing -> startClaim returns { type: 'review' }
  const ownedCommId = await createCommunity({
    invite_link: 'https://t.me/owned_channel',
    owner_id: user2.id,
  });
  const ownedRes = await startClaim(user1.id, ownedCommId);
  assert.deepEqual(ownedRes, { type: 'review' }, 'owned listing triggers review');
  const ownedReviewRow = await pool.query(
    'SELECT reason FROM claim_reviews WHERE community_id = $1 AND requested_by = $2',
    [ownedCommId, user1.id]
  );
  assert.equal(ownedReviewRow.rows[0].reason, 'already_owned');

  // Test 3: Public telegram listing -> startClaim returns { type: 'code', code, ... }
  const publicHandle = `pub_${crypto.randomUUID().slice(0, 8)}`;
  const publicCommId = await createCommunity({
    invite_link: `https://t.me/${publicHandle}`,
  });
  const codeRes = await startClaim(user1.id, publicCommId);
  assert.equal(codeRes.type, 'code');
  assert.equal(typeof codeRes.code, 'string');
  assert.equal(codeRes.code.length, 8);
  assert.equal(codeRes.command, `/oninna_claim ${codeRes.code}`);

  // Test 4: Another user attempting startClaim on unexpired code gets conflict
  const conflictRes = await startClaim(user2.id, publicCommId);
  assert.equal(conflictRes.error, 'conflict');
  assert.ok(conflictRes.minutesLeft > 0);

  // Test 5: completeTelegramClaim - wrong chat
  const chatId = -1001234567890;
  const botUserId = 999000;
  const senderId = 888000;
  const chatObj = { id: chatId, type: 'supergroup' };

  const wrongChatRes = await completeTelegramClaim({
    code: codeRes.code,
    chat: chatObj,
    senderId,
    botUserId,
    getChat: async () => ({ id: -1009999999999 }), // wrong id
    getChatMember: async () => ({ status: 'administrator' }),
  });
  assert.equal(wrongChatRes.ok, false);
  assert.equal(wrongChatRes.reason, 'chat_mismatch');

  // Test 6: completeTelegramClaim - non-admin sender
  const nonAdminSenderRes = await completeTelegramClaim({
    code: codeRes.code,
    chat: chatObj,
    senderId,
    botUserId,
    getChat: async () => ({ id: chatId }),
    getChatMember: async (cId, uId) => {
      if (uId === botUserId) return { status: 'administrator' };
      return { status: 'member' }; // sender is regular member
    },
  });
  assert.equal(nonAdminSenderRes.ok, false);
  assert.equal(nonAdminSenderRes.reason, 'sender_not_admin');

  // Test 7: completeTelegramClaim - bot not admin
  const botNotAdminRes = await completeTelegramClaim({
    code: codeRes.code,
    chat: chatObj,
    senderId,
    botUserId,
    getChat: async () => ({ id: chatId }),
    getChatMember: async (cId, uId) => {
      if (uId === botUserId) return { status: 'member' };
      return { status: 'administrator' };
    },
  });
  assert.equal(botNotAdminRes.ok, false);
  assert.equal(botNotAdminRes.reason, 'bot_not_admin');

  // Test 8: completeTelegramClaim - expired code
  const expiredHandle = `exp_${crypto.randomUUID().slice(0, 8)}`;
  const expiredCommId = await createCommunity({
    invite_link: `https://t.me/${expiredHandle}`,
  });
  const expiredCodeRes = await startClaim(user1.id, expiredCommId);
  await pool.query(
    "UPDATE communities SET claim_code_expires_at = now() - INTERVAL '1 hour' WHERE id = $1",
    [expiredCommId]
  );
  const expiredRes = await completeTelegramClaim({
    code: expiredCodeRes.code,
    chat: chatObj,
    senderId,
    botUserId,
    getChat: async () => ({ id: chatId }),
    getChatMember: async () => ({ status: 'administrator' }),
  });
  assert.equal(expiredRes.ok, false);
  assert.equal(expiredRes.reason, 'expired_or_invalid_code');

  // Test 9: completeTelegramClaim - successful claim
  const successRes = await completeTelegramClaim({
    code: codeRes.code,
    chat: chatObj,
    senderId,
    botUserId,
    getChat: async (handle) => {
      assert.equal(handle, `@${publicHandle}`);
      return { id: chatId };
    },
    getChatMember: async (cId, uId) => {
      if (uId === botUserId) return { status: 'administrator' };
      return { status: 'creator' };
    },
  });
  assert.equal(successRes.ok, true);
  assert.equal(successRes.ownerId, user1.id);

  // Verify DB state after success: external_id set, owner_id set, claim fields cleared
  const commRow = (await pool.query(
    'SELECT external_id, owner_id, claim_code, claim_requested_by FROM communities WHERE id = $1',
    [publicCommId]
  )).rows[0];
  assert.equal(commRow.external_id, String(chatId));
  assert.equal(commRow.owner_id, user1.id);
  assert.equal(commRow.claim_code, null);
  assert.equal(commRow.claim_requested_by, null);

  // Test 10: completeTelegramClaim on owned listing returns already_owned
  const reClaimRes = await completeTelegramClaim({
    code: codeRes.code,
    chat: chatObj,
    senderId,
    botUserId,
    getChat: async () => ({ id: chatId }),
    getChatMember: async () => ({ status: 'administrator' }),
  });
  assert.equal(reClaimRes.ok, false);

  // Test 11: Simultaneous claims bind only once
  const raceHandle = `race_${crypto.randomUUID().slice(0, 8)}`;
  const raceCommId = await createCommunity({
    invite_link: `https://t.me/${raceHandle}`,
  });
  const raceCodeRes = await startClaim(user1.id, raceCommId);
  const raceChatObj = { id: -1005555555555, type: 'supergroup' };

  const [race1, race2] = await Promise.all([
    completeTelegramClaim({
      code: raceCodeRes.code,
      chat: raceChatObj,
      senderId,
      botUserId,
      getChat: async () => ({ id: raceChatObj.id }),
      getChatMember: async () => ({ status: 'administrator' }),
    }),
    completeTelegramClaim({
      code: raceCodeRes.code,
      chat: raceChatObj,
      senderId,
      botUserId,
      getChat: async () => ({ id: raceChatObj.id }),
      getChatMember: async () => ({ status: 'administrator' }),
    }),
  ]);

  const okCount = [race1, race2].filter((r) => r.ok).length;
  assert.equal(okCount, 1, 'exactly one simultaneous claim succeeds');

  // Test 12: HTTP endpoint POST /api/communities/:id/claim
  // Login as user1
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user1.email, password: 'hash' }),
  });
  // Since user1 was inserted with 'hash', update to a real bcrypt hash for login
  // Or register a new test user via API
  const apiEmail = `claim-api-${crypto.randomUUID()}@example.test`;
  const apiUserRes = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: apiEmail, password: 'password-12345' }),
  });
  createdUserIds.push((await apiUserRes.json()).user.id);
  const userCookie = apiUserRes.headers.get('set-cookie')?.split(';')[0];

  const apiCommHandle = `api_comm_${crypto.randomUUID().slice(0, 8)}`;
  const apiCommId = await createCommunity({
    invite_link: `https://t.me/${apiCommHandle}`,
  });

  const claimHttpRes = await fetch(`${base}/api/communities/${apiCommId}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: userCookie },
  });
  assert.equal(claimHttpRes.status, 200);
  const claimHttpBody = await claimHttpRes.json();
  assert.ok(claimHttpBody.code);
  assert.ok(claimHttpBody.expires_at);
  assert.equal(claimHttpBody.command, `/oninna_claim ${claimHttpBody.code}`);

  // Test 13: Staff claim reviews admin routes
  // Register staff user via API and set role in DB
  const staffEmail = `claim-staff-${crypto.randomUUID()}@example.test`;
  const staffReg = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: staffEmail, password: 'password-12345' }),
  });
  const staffId = (await staffReg.json()).user.id;
  createdUserIds.push(staffId);
  await pool.query("UPDATE users SET role = 'staff' WHERE id = $1", [staffId]);
  const staffCookie = staffReg.headers.get('set-cookie')?.split(';')[0];

  const reviewsListRes = await fetch(`${base}/api/admin/claim-reviews?status=pending`, {
    headers: { Cookie: staffCookie },
  });
  assert.equal(reviewsListRes.status, 200);
  assert.equal(reviewsListRes.headers.get('cache-control'), 'no-store');
  const reviewsList = await reviewsListRes.json();
  assert.ok(Array.isArray(reviewsList.items));
  const pendingReview = reviewsList.items.find((r) => r.community_id === privateCommId);
  assert.ok(pendingReview);

  // Approve claim review
  const approveRevRes = await fetch(`${base}/api/admin/claim-reviews/${pendingReview.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
  });
  assert.equal(approveRevRes.status, 200);
  const approveRevBody = await approveRevRes.json();
  assert.equal(approveRevBody.status, 'approved');

  // Verify community owner_id set to user1
  const updatedComm = (await pool.query(
    'SELECT owner_id FROM communities WHERE id = $1',
    [privateCommId]
  )).rows[0];
  assert.equal(updatedComm.owner_id, user1.id);
});
