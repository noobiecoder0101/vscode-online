import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { getClientIp, createRateLimiter } from "../middleware/rateLimit.js";
import { comparePassword, hasValidJwtSecret, hashPassword, signToken } from "../utils/auth.js";
import { readJsonBody, sendJson } from "../utils/http.js";

const TOKEN_MAX_AGE = 604_800;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-user-password", 10);
const loginIpLimiter = createRateLimiter(10, 15 * 60 * 1000);
const loginEmailLimiter = createRateLimiter(5, 15 * 60 * 1000);
const registerIpLimiter = createRateLimiter(10, 60 * 60 * 1000);

function requireJwtSecret(res) {
  if (hasValidJwtSecret()) return true;
  console.error("Authentication unavailable: JWT_SECRET is missing or shorter than 32 characters.");
  sendJson(res, 500, { error: "Internal server error" });
  return false;
}

function sendRateLimited(res, retryAfter) {
  res.setHeader("Retry-After", String(retryAfter));
  sendJson(res, 429, { error: "Too many requests" });
}

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

async function readCredentials(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { error: error.message });
    return null;
  }

  if (!body || Array.isArray(body) || typeof body !== "object") {
    sendJson(res, 400, { error: "Request body must be a JSON object" });
    return null;
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    sendJson(res, 400, { error: "Invalid email" });
    return null;
  }
  if (typeof body.password !== "string") {
    sendJson(res, 400, { error: "Password must be a string" });
    return null;
  }
  if (body.password.length < 8) {
    sendJson(res, 400, { error: "Password must be at least 8 characters" });
    return null;
  }
  if (Buffer.byteLength(body.password, "utf8") > 72) {
    sendJson(res, 400, { error: "Password must be at most 72 bytes" });
    return null;
  }

  return { email, password: body.password };
}

function authCookie(token, maxAge) {
  const attributes = [
    `token=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}

function setAuthenticatedUser(res, user, status) {
  const token = signToken({ id: user.id, email: user.email });
  res.setHeader("Set-Cookie", authCookie(token, TOKEN_MAX_AGE));
  sendJson(res, status, { user: { id: user.id, email: user.email } });
}

export async function register(req, res) {
  if (!requireJwtSecret(res)) return;
  const ipAttempt = registerIpLimiter.attempt(getClientIp(req));
  if (!ipAttempt.allowed) return sendRateLimited(res, ipAttempt.retryAfter);

  const credentials = await readCredentials(req, res);
  if (!credentials) return;

  try {
    const passwordHash = await hashPassword(credentials.password);
    const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [credentials.email, passwordHash],
    );
    setAuthenticatedUser(res, result.rows[0], 201);
  } catch (error) {
    if (error.code === "23505") {
      sendJson(res, 409, { error: "Email already registered" });
      return;
    }
    throw error;
  }
}

export async function login(req, res) {
  if (!requireJwtSecret(res)) return;
  const ipAttempt = loginIpLimiter.attempt(getClientIp(req));
  if (!ipAttempt.allowed) return sendRateLimited(res, ipAttempt.retryAfter);

  const credentials = await readCredentials(req, res);
  if (!credentials) return;

  const emailAttempt = loginEmailLimiter.isLimited(credentials.email);
  if (!emailAttempt.allowed) return sendRateLimited(res, emailAttempt.retryAfter);

  const result = await pool.query(
    "SELECT users.id, users.email, users.password_hash FROM users WHERE users.email = $1",
    [credentials.email],
  );
  const user = result.rows[0];
  const passwordMatches = await comparePassword(credentials.password, user?.password_hash || DUMMY_PASSWORD_HASH);

  if (!user || !passwordMatches) {
    loginEmailLimiter.attempt(credentials.email);
    sendJson(res, 401, { error: "Invalid email or password" });
    return;
  }

  setAuthenticatedUser(res, user, 200);
}

export function logout(req, res) {
  if (!requireJwtSecret(res)) return;
  res.setHeader("Set-Cookie", authCookie("", 0));
  sendJson(res, 200, { ok: true });
}

export async function me(req, res) {
  if (!requireJwtSecret(res)) return;
  if (!req.user?.id) {
    sendJson(res, 200, { user: null });
    return;
  }

  const result = await pool.query(
    "SELECT users.id, users.email FROM users WHERE users.id = $1",
    [req.user.id],
  );
  const user = result.rows[0];
  sendJson(res, 200, { user: user ? { id: user.id, email: user.email } : null });
}
