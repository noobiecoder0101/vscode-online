// test/submissions-and-review.test.js
// Task 4: Submissions, my listings, staff review and permissions.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import test from 'node:test';
import { pool } from '../src/db/pool.js';

const port = 3014;
const base = `http://127.0.0.1:${port}`;
const createdCommunityIds = [];
const createdUserEmails = [];

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Test server did not start');
}

test('submissions, my listings, and staff review workflow', async (t) => {
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
      await pool.query('DELETE FROM communities WHERE id = ANY($1)', [createdCommunityIds]);
    }
    if (createdUserEmails.length > 0) {
      await pool.query('DELETE FROM users WHERE email = ANY($1)', [createdUserEmails]);
    }
    await pool.end();
  });

  await waitForServer();

  // Helper to register a user and return cookie
  async function registerUser(email, password = 'password-12345') {
    createdUserEmails.push(email);
    const res = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(res.status, 201);
    const cookie = res.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    return cookie;
  }

  const normalUserEmail = `user-${crypto.randomUUID()}@example.test`;
  const normalCookie = await registerUser(normalUserEmail);

  const staffUserEmail = `staff-${crypto.randomUUID()}@example.test`;
  const staffCookie = await registerUser(staffUserEmail);
  await pool.query("UPDATE users SET role = 'staff' WHERE email = $1", [staffUserEmail]);

  // 1. Sign-in required for submission (401)
  const unauthSubmit = await fetch(`${base}/api/communities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Valid Name',
      category: 'gaming',
      platform: 'telegram',
      invite_link: 'https://t.me/valid_group_test',
    }),
  });
  assert.equal(unauthSubmit.status, 401, 'unauthenticated submission returns 401');

  // 2. Validation failures (400)
  // 2a. Name too short
  const shortName = await fetch(`${base}/api/communities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: normalCookie },
    body: JSON.stringify({
      name: 'ab',
      category: 'gaming',
      platform: 'telegram',
      invite_link: 'https://t.me/valid_group_test',
    }),
  });
  assert.equal(shortName.status, 400, 'short name returns 400');

  // 2b. Name with control characters
  const ctrlName = await fetch(`${base}/api/communities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: normalCookie },
    body: JSON.stringify({
      name: 'Bad\x00Name',
      category: 'gaming',
      platform: 'telegram',
      invite_link: 'https://t.me/valid_group_test',
    }),
  });
  assert.equal(ctrlName.status, 400, 'control char in name returns 400');

  // 2c. Invalid category
  const badCat = await fetch(`${base}/api/communities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: normalCookie },
    body: JSON.stringify({
      name: 'Valid Name',
      category: 'non-existent-category',
      platform: 'telegram',
      invite_link: 'https://t.me/valid_group_test',
    }),
  });
  assert.equal(badCat.status, 400, 'invalid category returns 400');

  // 2d. Platform mismatch with link
  const mismatchedLink = await fetch(`${base}/api/communities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: normalCookie },
    body: JSON.stringify({
      name: 'Discord On Telegram',
      category: 'gaming',
      platform: 'telegram',
      invite_link: 'https://discord.gg/somecode',
    }),
  });
  assert.equal(mismatchedLink.status, 400, 'mismatched platform and link returns 400');

  // 3. Successful submission
  const uniqueHandle = `test_grp_${crypto.randomUUID().slice(0, 8)}`;
  const submitRes = await fetch(`${base}/api/communities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: normalCookie },
    body: JSON.stringify({
      name: 'Alpha Test Community',
      description: 'A great test community for unit tests',
      category: 'gaming',
      platform: 'telegram',
      invite_link: `https://t.me/${uniqueHandle}`,
    }),
  });
  assert.equal(submitRes.status, 201, 'valid submission returns 201');
  const submitBody = await submitRes.json();
  assert.ok(submitBody.id);
  assert.equal(submitBody.status, 'pending');
  createdCommunityIds.push(submitBody.id);
  // Never echo invite link or canonical link in response
  assert.equal(submitBody.invite_link, undefined);
  assert.equal(submitBody.canonical_link, undefined);

  // 4. Duplicate canonical_link returns 409
  const dupRes = await fetch(`${base}/api/communities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: normalCookie },
    body: JSON.stringify({
      name: 'Duplicate Alpha Group',
      category: 'gaming',
      platform: 'telegram',
      invite_link: `https://t.me/${uniqueHandle}/`,
    }),
  });
  assert.equal(dupRes.status, 409, 'duplicate canonical link returns 409');
  const dupBody = await dupRes.json();
  assert.equal(dupBody.error, 'This community is already listed');

  // 5. GET /api/me/communities lists the user pending community
  const myRes = await fetch(`${base}/api/me/communities`, {
    headers: { Cookie: normalCookie },
  });
  assert.equal(myRes.status, 200);
  const myBody = await myRes.json();
  const found = myBody.items.find((item) => item.id === submitBody.id);
  assert.ok(found, 'submission appears in user listings');
  assert.equal(found.status, 'pending');
  assert.equal(found.review_note, undefined, 'no review_note when not rejected');
  assert.equal(found.invite_link, undefined, 'never expose invite_link');

  // 6. Non-staff access to admin routes returns 403
  const forbiddenList = await fetch(`${base}/api/admin/communities?status=pending`, {
    headers: { Cookie: normalCookie },
  });
  assert.equal(forbiddenList.status, 403, 'non-staff gets 403 on admin list');

  const forbiddenApprove = await fetch(`${base}/api/admin/communities/${submitBody.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: normalCookie },
  });
  assert.equal(forbiddenApprove.status, 403, 'non-staff gets 403 on approve');

  // 7. Staff can view admin listings with invite_link and no-store
  const staffList = await fetch(`${base}/api/admin/communities?status=pending`, {
    headers: { Cookie: staffCookie },
  });
  assert.equal(staffList.status, 200);
  assert.equal(staffList.headers.get('cache-control'), 'no-store');
  const staffBody = await staffList.json();
  const staffFound = staffBody.items.find((item) => item.id === submitBody.id);
  assert.ok(staffFound, 'pending listing in staff list');
  assert.ok(staffFound.invite_link, 'staff can see invite_link');

  // 8. Staff rejects a second listing
  const rejectHandle = `test_rej_${crypto.randomUUID().slice(0, 8)}`;
  const submitRej = await fetch(`${base}/api/communities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: normalCookie },
    body: JSON.stringify({
      name: 'To Be Rejected Community',
      category: 'technology',
      platform: 'telegram',
      invite_link: `https://t.me/${rejectHandle}`,
    }),
  });
  const rejId = (await submitRej.json()).id;
  createdCommunityIds.push(rejId);

  const rejectRes = await fetch(`${base}/api/admin/communities/${rejId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
    body: JSON.stringify({ reason: 'Does not meet guidelines' }),
  });
  assert.equal(rejectRes.status, 200);
  const rejectBody = await rejectRes.json();
  assert.equal(rejectBody.status, 'rejected');
  assert.equal(rejectBody.review_note, 'Does not meet guidelines');

  // Rejected listing remains hidden publicly
  const rejPublic = await fetch(`${base}/api/communities/${rejId}`);
  assert.equal(rejPublic.status, 404, 'rejected community remains 404 publicly');

  // Rejected listing includes review_note in my listings
  const myAfterRej = await fetch(`${base}/api/me/communities`, {
    headers: { Cookie: normalCookie },
  });
  const myRejFound = (await myAfterRej.json()).items.find((i) => i.id === rejId);
  assert.ok(myRejFound);
  assert.equal(myRejFound.review_note, 'Does not meet guidelines');

  // 9. Staff approves the first listing
  const approveRes = await fetch(`${base}/api/admin/communities/${submitBody.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
  });
  assert.equal(approveRes.status, 200);
  assert.equal((await approveRes.json()).status, 'approved');

  // Approved listing now appears publicly and has no sensitive fields
  const publicRes = await fetch(`${base}/api/communities/${submitBody.id}`);
  assert.equal(publicRes.status, 200, 'approved listing is 200 publicly');
  const publicBody = await publicRes.text();
  assert.ok(!publicBody.includes(uniqueHandle), 'never echo invite link publicly');
  assert.ok(!publicBody.includes('canonical_link'));
  assert.ok(!publicBody.includes('invite_link'));
  assert.ok(!publicBody.includes('owner_id'));
});
