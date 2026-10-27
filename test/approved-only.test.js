// test/approved-only.test.js
// Task 2: pending rows are excluded from all public endpoints.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import test from 'node:test';
import { pool } from '../src/db/pool.js';

const port = 3013;
const base = `http://127.0.0.1:${port}`;
const SENSITIVE = ['invite_link', 'canonical_link', 'owner_id', 'external_id', 'claim_code', 'password_hash'];

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Test server did not start');
}

test('pending rows absent from all public endpoints and no sensitive fields leak', async (t) => {
  // Insert a pending community for a real category
  const catResult = await pool.query(
    "SELECT id FROM categories WHERE slug = 'gaming' LIMIT 1"
  );
  const catId = catResult.rows[0].id;
  const name = `pending-test-${crypto.randomUUID()}`;
  const insertResult = await pool.query(
    `INSERT INTO communities
       (category_id, name, description, platform, member_count, invite_link, status, canonical_link)
     VALUES ($1, $2, 'test', 'telegram', 0, 'https://t.me/testpending', 'pending', 'https://t.me/testpending')
     RETURNING id`,
    [catId, name]
  );
  const pendingId = insertResult.rows[0].id;

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
    await pool.query('DELETE FROM communities WHERE id = $1', [pendingId]);
    await pool.end();
  });

  await waitForServer();

  // 1. List must not include the pending row
  const listRes = await fetch(`${base}/api/communities`);
  const listBody = await listRes.text();
  assert.equal(listRes.status, 200);
  assert.ok(!listBody.includes(name), 'pending row must not appear in list');

  // 2. Detail must return 404
  const detailRes = await fetch(`${base}/api/communities/${pendingId}`);
  assert.equal(detailRes.status, 404, 'pending row detail must be 404');

  // 3. Join must return 401 without auth, and 404 when authenticated on pending/rejected row
  const unauthJoinRes = await fetch(`${base}/api/communities/${pendingId}/join`);
  assert.equal(unauthJoinRes.status, 401, 'join requires auth');

  // Register and login a test user to test authenticated join on pending row
  const testEmail = `auth-test-${crypto.randomUUID()}@example.test`;
  const regRes = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'password-12345' }),
  });
  const cookie = regRes.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'got auth cookie');

  const authJoinPendingRes = await fetch(`${base}/api/communities/${pendingId}/join`, {
    headers: { Cookie: cookie },
  });
  assert.equal(authJoinPendingRes.status, 404, 'authenticated join on pending row must be 404');

  // Also check rejected row
  await pool.query("UPDATE communities SET status = 'rejected' WHERE id = $1", [pendingId]);
  const detailRejectedRes = await fetch(`${base}/api/communities/${pendingId}`);
  assert.equal(detailRejectedRes.status, 404, 'rejected row detail must be 404');
  const authJoinRejectedRes = await fetch(`${base}/api/communities/${pendingId}/join`, {
    headers: { Cookie: cookie },
  });
  assert.equal(authJoinRejectedRes.status, 404, 'authenticated join on rejected row must be 404');

  await pool.query('DELETE FROM users WHERE email = $1', [testEmail]);

  // 4. Category counts must not include the pending row
  const catRes = await fetch(`${base}/api/categories`);
  const catBody = await catRes.text();
  assert.equal(catRes.status, 200);
  const cats = JSON.parse(catBody);
  const gaming = cats.find(c => c.slug === 'gaming');
  assert.ok(gaming, 'gaming category exists');
  // The seeded gaming communities are all approved (3). Pending row must not be counted.
  // We just verify the total is the same as approved count.
  const approvedCount = await pool.query(
    "SELECT COUNT(*)::integer AS cnt FROM communities WHERE category_id = $1 AND status = 'approved'",
    [catId]
  );
  assert.equal(gaming.community_count, approvedCount.rows[0].cnt, 'category count matches approved only');

  // 5. No sensitive field names in public list or detail responses
  for (const field of SENSITIVE) {
    assert.ok(!listBody.includes(field), `list must not contain ${field}`);
    const detailBody = await (await fetch(`${base}/api/communities/1`)).text();
    assert.ok(!detailBody.includes(field), `detail must not contain ${field}`);
  }
});
