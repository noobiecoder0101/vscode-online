// test/bot-config.test.js
// Task 6: Owner bot configuration API tests.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import test from 'node:test';
import { pool } from '../src/db/pool.js';

const port = 3016;
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

test('owner bot config API permissions and validation', async (t) => {
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
      await pool.query('DELETE FROM bot_installs WHERE community_id = ANY($1)', [createdCommunityIds]);
      await pool.query('DELETE FROM communities WHERE id = ANY($1)', [createdCommunityIds]);
    }
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [createdUserIds]);
    }
    await pool.end();
  });

  await waitForServer();

  async function registerUser(email, password = 'password-12345') {
    const res = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    createdUserIds.push(body.user.id);
    const cookie = res.headers.get('set-cookie')?.split(';')[0];
    return { id: body.user.id, cookie };
  }

  const owner = await registerUser(`owner-${crypto.randomUUID()}@example.test`);
  const nonOwner = await registerUser(`other-${crypto.randomUUID()}@example.test`);

  // Create a community owned by owner
  const catRes = await pool.query("SELECT id FROM categories WHERE slug = 'gaming' LIMIT 1");
  const catId = catRes.rows[0].id;
  const commRes = await pool.query(`
    INSERT INTO communities (
      category_id, name, platform, member_count, invite_link, canonical_link, status, owner_id
    ) VALUES ($1, $2, 'telegram', 0, 'https://t.me/test_bot_cfg', 'https://t.me/test_bot_cfg', 'approved', $3)
    RETURNING id
  `, [catId, `bot-cfg-${crypto.randomUUID()}`, owner.id]);
  const commId = commRes.rows[0].id;
  createdCommunityIds.push(commId);

  // Before bot install exists: owner gets 404
  const noInstallRes = await fetch(`${base}/api/communities/${commId}/bot-config`, {
    headers: { Cookie: owner.cookie },
  });
  assert.equal(noInstallRes.status, 404, '404 when no install exists');

  // Insert welcome bot install
  const botRes = await pool.query("SELECT id FROM bots WHERE slug = 'welcome'");
  const botId = botRes.rows[0].id;
  await pool.query(`
    INSERT INTO bot_installs (bot_id, community_id, external_chat_id, installed_by, is_active)
    VALUES ($1, $2, '-100987654321', $3, true)
  `, [botId, commId, owner.id]);

  // 1. Owner can read default config
  const getRes = await fetch(`${base}/api/communities/${commId}/bot-config`, {
    headers: { Cookie: owner.cookie },
  });
  assert.equal(getRes.status, 200);
  const getBody = await getRes.json();
  assert.equal(getBody.enabled, true);
  assert.ok(getBody.greeting_template.includes('{user}'));

  // 2. Non-owner gets 404 on GET
  const nonOwnerGet = await fetch(`${base}/api/communities/${commId}/bot-config`, {
    headers: { Cookie: nonOwner.cookie },
  });
  assert.equal(nonOwnerGet.status, 404, 'non-owner gets 404 on GET');

  // 3. Non-owner gets 404 on PUT
  const nonOwnerPut = await fetch(`${base}/api/communities/${commId}/bot-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: nonOwner.cookie },
    body: JSON.stringify({
      greeting_template: 'Hello {user}!',
      rules_text: 'Be kind',
      enabled: true,
    }),
  });
  assert.equal(nonOwnerPut.status, 404, 'non-owner gets 404 on PUT');

  // 4. Oversize input gets 400
  // 4a. Oversize greeting_template (> 500 chars)
  const oversizeGreeting = await fetch(`${base}/api/communities/${commId}/bot-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
    body: JSON.stringify({
      greeting_template: 'x'.repeat(501),
      rules_text: 'Rules',
      enabled: true,
    }),
  });
  assert.equal(oversizeGreeting.status, 400, 'oversize greeting gets 400');

  // 4b. Oversize rules_text (> 1000 chars)
  const oversizeRules = await fetch(`${base}/api/communities/${commId}/bot-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
    body: JSON.stringify({
      greeting_template: 'Welcome {user}',
      rules_text: 'r'.repeat(1001),
      enabled: true,
    }),
  });
  assert.equal(oversizeRules.status, 400, 'oversize rules gets 400');

  // 4c. Non-boolean enabled
  const badEnabled = await fetch(`${base}/api/communities/${commId}/bot-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
    body: JSON.stringify({
      greeting_template: 'Welcome {user}',
      rules_text: 'Rules',
      enabled: 'yes',
    }),
  });
  assert.equal(badEnabled.status, 400, 'non-boolean enabled gets 400');

  // 5. Successful PUT: owner updates config with multiline rules and stripped control chars
  const updateRes = await fetch(`${base}/api/communities/${commId}/bot-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
    body: JSON.stringify({
      greeting_template: 'Welcome \x00{user} to \x07{group_name}!\nPlease see rules: {rules}',
      rules_text: 'Rule 1: Be nice.\nRule 2: Have fun.',
      enabled: false,
    }),
  });
  assert.equal(updateRes.status, 200);
  const updateBody = await updateRes.json();
  assert.equal(updateBody.enabled, false);
  assert.equal(updateBody.greeting_template, 'Welcome {user} to {group_name}!\nPlease see rules: {rules}');
  assert.equal(updateBody.rules_text, 'Rule 1: Be nice.\nRule 2: Have fun.');

  // 6. Verify subsequent GET returns the updated values
  const getAfterUpdate = await fetch(`${base}/api/communities/${commId}/bot-config`, {
    headers: { Cookie: owner.cookie },
  });
  assert.equal(getAfterUpdate.status, 200);
  const verifyBody = await getAfterUpdate.json();
  assert.equal(verifyBody.enabled, false);
  assert.equal(verifyBody.greeting_template, 'Welcome {user} to {group_name}!\nPlease see rules: {rules}');
});
