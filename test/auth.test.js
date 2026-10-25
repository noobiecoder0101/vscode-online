import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import test from "node:test";
import { pool } from "../src/db/pool.js";

const port = 3012;
const baseUrl = `http://127.0.0.1:${port}`;
const email = `test-${crypto.randomUUID()}@example.test`;
const password = "correct-horse-battery-staple";
const responses = [];

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not start");
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.text();
  responses.push(body);
  return { response, body };
}

test("authentication routes validate, protect, and clear cookie sessions", async (t) => {
  const server = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      JWT_SECRET: "test-secret-with-at-least-thirty-two-characters",
    },
    stdio: "ignore",
  });
  t.after(async () => {
    server.kill();
    await pool.query("DELETE FROM users WHERE email = $1", [email]);
    await pool.end();
  });
  await waitForServer();

  const invalidType = await request("/api/auth/register", { method: "POST" });
  assert.equal(invalidType.response.status, 415);
  const invalidOrigin = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://evil.example" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(invalidOrigin.response.status, 403);

  const shortPassword = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "short" }),
  });
  assert.equal(shortPassword.response.status, 400);
  const longPassword = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "a".repeat(73) }),
  });
  assert.equal(longPassword.response.status, 400);

  const registration = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ` ${email.toUpperCase()} `, password }),
  });
  assert.equal(registration.response.status, 201);
  const registerCookie = registration.response.headers.get("set-cookie");
  assert.match(registerCookie, /HttpOnly; SameSite=Lax; Path=\/; Max-Age=604800/);
  const cookie = registerCookie.split(";")[0];

  const duplicate = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(duplicate.response.status, 409);

  const unknown = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `unknown-${email}`, password }),
  });
  const wrongPassword = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "wrong-password" }),
  });
  assert.equal(unknown.response.status, 401);
  assert.equal(wrongPassword.response.status, 401);
  assert.equal(unknown.body, wrongPassword.body);

  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.response.status, 200);
  const loginCookie = login.response.headers.get("set-cookie");
  assert.match(loginCookie, /HttpOnly; SameSite=Lax; Path=\/; Max-Age=604800/);
  const loginSession = loginCookie.split(";")[0];

  const anonymousMe = await request("/api/auth/me");
  assert.deepEqual(JSON.parse(anonymousMe.body), { user: null });
  const signedInMe = await request("/api/auth/me", { headers: { Cookie: loginSession } });
  assert.equal(JSON.parse(signedInMe.body).user.email, email);
  const anonymousJoin = await request("/api/communities/1/join");
  assert.equal(anonymousJoin.response.status, 401);
  const signedInJoin = await request("/api/communities/1/join", { headers: { Cookie: loginSession } });
  assert.equal(signedInJoin.response.status, 200);

  const logout = await request("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
  });
  assert.equal(logout.response.status, 200);
  assert.match(logout.response.headers.get("set-cookie"), /Max-Age=0/);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `rate-${attempt}-${email}`, password }),
    });
  }
  const rateLimited = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `rate-final-${email}`, password }),
  });
  assert.equal(rateLimited.response.status, 429);
  assert.ok(rateLimited.response.headers.get("retry-after"));

  for (const body of responses) assert.ok(!body.includes("password_hash"));
});
