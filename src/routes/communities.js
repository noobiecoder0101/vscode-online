import { startClaim } from "../claims/service.js";
import { pool } from "../db/pool.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { readJsonBody, sendJson } from "../utils/http.js";
import { canonicalizeLink, classifyInviteLink } from "../utils/links.js";

const PLATFORM_VALUES = ["telegram", "discord", "whatsapp", "reddit", "slack", "signal", "facebook", "x"];
const MAX_ID = 2_147_483_647;
const submissionLimiter = createRateLimiter(5, 24 * 60 * 60 * 1000);

function sendBadRequest(res, message) {
  sendJson(res, 400, { error: message });
}

function isValidCommunityId(value) {
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_ID;
}

function buildCommunityFilters(url, res) {
  const allowedParams = new Set(["category", "platform", "q", "sort", "limit", "offset"]);
  for (const key of url.searchParams.keys()) {
    if (!allowedParams.has(key)) {
      sendBadRequest(res, `Unknown query parameter: ${key}`);
      return null;
    }
  }

  const category = url.searchParams.get("category");
  const platform = url.searchParams.get("platform");
  const rawQuery = url.searchParams.get("q");
  const sort = (url.searchParams.get("sort") || "members").toLowerCase();
  const rawLimit = url.searchParams.get("limit") || "12";
  const rawOffset = url.searchParams.get("offset") || "0";

  if (category !== null && !/^[a-z0-9-]+$/i.test(category.trim())) {
    sendBadRequest(res, "category must be a slug");
    return null;
  }

  const normalizedPlatform = platform?.trim().toLowerCase();
  if (platform !== null && !PLATFORM_VALUES.includes(normalizedPlatform)) {
    sendBadRequest(res, `platform must be one of: ${PLATFORM_VALUES.join(", ")}`);
    return null;
  }

  if (!["newest", "members"].includes(sort)) {
    sendBadRequest(res, "sort must be newest or members");
    return null;
  }

  if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 50) {
    sendBadRequest(res, "limit must be an integer from 1 to 50");
    return null;
  }

  if (!/^\d+$/.test(rawOffset) || Number(rawOffset) > MAX_ID) {
    sendBadRequest(res, "offset must be a non-negative integer up to 2147483647");
    return null;
  }

  const query = rawQuery?.trim() || "";
  if (query.length > 100) {
    sendBadRequest(res, "q must be 100 characters or fewer");
    return null;
  }

  const values = [];
  const conditions = ["communities.status = 'approved'"];
  if (category?.trim()) {
    values.push(category.trim().toLowerCase());
    conditions.push(`LOWER(categories.slug) = $${values.length}`);
  }
  if (normalizedPlatform) {
    values.push(normalizedPlatform);
    conditions.push(`LOWER(communities.platform) = $${values.length}`);
  }
  if (query) {
    const escapedQuery = query.replace(/[\\%_]/g, "\\$&");
    values.push(`%${escapedQuery}%`);
    conditions.push(`(communities.name ILIKE $${values.length} ESCAPE '\\' OR communities.description ILIKE $${values.length} ESCAPE '\\')`);
  }

  return {
    values,
    whereClause: `WHERE ${conditions.join(" AND ")}`,
    sort,
    limit: Number(rawLimit),
    offset: Number(rawOffset),
  };
}

function publicCommunity(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    platform: row.platform,
    member_count: row.member_count,
    image_url: row.image_url,
    created_at: row.created_at,
    category: {
      slug: row.category_slug,
      name: row.category_name,
    },
  };
}

export async function listCommunities(req, res, { url }) {
  const filters = buildCommunityFilters(url, res);
  if (!filters) return;

  const orderBy = filters.sort === "newest"
    ? "communities.created_at DESC, communities.id ASC"
    : "communities.member_count DESC NULLS LAST, communities.id ASC";
  const itemValues = [...filters.values, filters.limit, filters.offset];
  const limitIndex = itemValues.length - 1;
  const offsetIndex = itemValues.length;
  const itemQuery = `
    SELECT
      communities.id,
      communities.name,
      communities.description,
      communities.platform,
      communities.member_count,
      communities.image_url,
      communities.created_at,
      categories.slug AS category_slug,
      categories.name AS category_name
    FROM communities
    INNER JOIN categories ON categories.id = communities.category_id
    ${filters.whereClause}
    ORDER BY ${orderBy}
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;
  const countQuery = `
    SELECT COUNT(communities.id)::integer AS total
    FROM communities
    INNER JOIN categories ON categories.id = communities.category_id
    ${filters.whereClause}
  `;

  const [itemsResult, countResult] = await Promise.all([
    pool.query(itemQuery, itemValues),
    pool.query(countQuery, filters.values),
  ]);

  sendJson(res, 200, {
    items: itemsResult.rows.map(publicCommunity),
    total: countResult.rows[0].total,
    limit: filters.limit,
    offset: filters.offset,
  });
}

export async function getCommunity(req, res, { params }) {
  if (!isValidCommunityId(params.id)) {
    sendJson(res, 404, { error: "Community not found" });
    return;
  }

  const result = await pool.query(`
    SELECT
      communities.id,
      communities.name,
      communities.description,
      communities.platform,
      communities.member_count,
      communities.image_url,
      communities.created_at,
      categories.slug AS category_slug,
      categories.name AS category_name
    FROM communities
    INNER JOIN categories ON categories.id = communities.category_id
    WHERE communities.id = $1
      AND communities.status = 'approved'
  `, [Number(params.id)]);

  if (!result.rowCount) {
    sendJson(res, 404, { error: "Community not found" });
    return;
  }

  sendJson(res, 200, publicCommunity(result.rows[0]));
}

export async function getCommunityJoinLink(req, res, { params }) {
  if (!requireAuth(req, res)) return;

  if (!isValidCommunityId(params.id)) {
    sendJson(res, 404, { error: "Community not found" });
    return;
  }

  const result = await pool.query(
    "SELECT communities.invite_link FROM communities WHERE communities.id = $1 AND communities.status = 'approved'",
    [Number(params.id)],
  );

  if (!result.rowCount) {
    sendJson(res, 404, { error: "Community not found" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  sendJson(res, 200, { invite_link: result.rows[0].invite_link });
}

export async function createCommunity(req, res) {
  if (!requireAuth(req, res)) return;

  const limitCheck = submissionLimiter.isLimited(String(req.user.id));
  if (!limitCheck.allowed) {
    res.setHeader("Retry-After", String(limitCheck.retryAfter));
    sendJson(res, 429, { error: "Too many requests" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, err.statusCode || 400, { error: err.message });
    return;
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendBadRequest(res, "Request body must be a JSON object");
    return;
  }

  if (typeof body.name !== "string") {
    sendBadRequest(res, "Name must be a string");
    return;
  }
  const name = body.name.trim();
  if (name.length < 3 || name.length > 80 || /[\x00-\x1F\x7F]/.test(name)) {
    sendBadRequest(res, "Name must be between 3 and 80 characters without control characters");
    return;
  }

  let description = null;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") {
      sendBadRequest(res, "Description must be a string");
      return;
    }
    const desc = body.description.trim();
    if (desc.length > 500) {
      sendBadRequest(res, "Description must be 500 characters or fewer");
      return;
    }
    description = desc || null;
  }

  if (typeof body.category !== "string" || !body.category.trim()) {
    sendBadRequest(res, "Category slug is required");
    return;
  }
  const categorySlug = body.category.trim().toLowerCase();
  const catResult = await pool.query(
    "SELECT id FROM categories WHERE slug = $1",
    [categorySlug]
  );
  if (!catResult.rowCount) {
    sendBadRequest(res, "Category not found");
    return;
  }
  const categoryId = catResult.rows[0].id;

  if (typeof body.platform !== "string") {
    sendBadRequest(res, "Platform is required");
    return;
  }
  const platform = body.platform.trim().toLowerCase();
  if (!PLATFORM_VALUES.includes(platform)) {
    sendBadRequest(res, `Platform must be one of: ${PLATFORM_VALUES.join(", ")}`);
    return;
  }

  if (typeof body.invite_link !== "string" || !body.invite_link.trim()) {
    sendBadRequest(res, "Invite link is required");
    return;
  }
  const classified = classifyInviteLink(body.invite_link.trim());
  if (!classified) {
    sendBadRequest(res, "Invalid invite link");
    return;
  }
  if (classified.platform !== platform) {
    sendBadRequest(res, "Invite link does not match selected platform");
    return;
  }

  const canonicalLink = canonicalizeLink(body.invite_link.trim());

  const existing = await pool.query(
    "SELECT id FROM communities WHERE canonical_link = $1",
    [canonicalLink]
  );
  if (existing.rowCount > 0) {
    sendJson(res, 409, { error: "This community is already listed" });
    return;
  }

  try {
    submissionLimiter.attempt(String(req.user.id));
    const insertResult = await pool.query(`
      INSERT INTO communities (
        category_id,
        name,
        description,
        platform,
        member_count,
        invite_link,
        image_url,
        canonical_link,
        status,
        submitted_by
      ) VALUES ($1, $2, $3, $4, 0, $5, NULL, $6, 'pending', $7)
      RETURNING id, status
    `, [
      categoryId,
      name,
      description,
      platform,
      body.invite_link.trim(),
      canonicalLink,
      req.user.id,
    ]);

    sendJson(res, 201, {
      id: insertResult.rows[0].id,
      status: insertResult.rows[0].status,
    });
  } catch (err) {
    if (err.code === "23505") {
      sendJson(res, 409, { error: "This community is already listed" });
      return;
    }
    throw err;
  }
}

export async function listMyCommunities(req, res) {
  if (!requireAuth(req, res)) return;

  const result = await pool.query(`
    SELECT
      communities.id,
      communities.name,
      communities.platform,
      communities.status,
      communities.review_note,
      communities.created_at,
      (communities.owner_id = $1) AS is_owner,
      categories.slug AS category_slug,
      categories.name AS category_name
    FROM communities
    INNER JOIN categories ON categories.id = communities.category_id
    WHERE communities.submitted_by = $1 OR communities.owner_id = $1
    ORDER BY communities.created_at DESC, communities.id DESC
  `, [req.user.id]);

  const items = result.rows.map((row) => {
    const item = {
      id: row.id,
      name: row.name,
      platform: row.platform,
      status: row.status,
      created_at: row.created_at,
      is_owner: Boolean(row.is_owner),
      category: {
        slug: row.category_slug,
        name: row.category_name,
      },
    };
    if (row.status === "rejected") {
      item.review_note = row.review_note;
    }
    return item;
  });

  sendJson(res, 200, { items });
}

export async function claimCommunity(req, res, { params }) {
  if (!requireAuth(req, res)) return;

  if (!isValidCommunityId(params.id)) {
    sendJson(res, 404, { error: "Community not found" });
    return;
  }

  const result = await startClaim(req.user.id, Number(params.id));

  if (result.error === "rate_limited") {
    res.setHeader("Retry-After", String(result.retryAfter));
    sendJson(res, 429, { error: "Too many requests" });
    return;
  }

  if (result.error === "not_found") {
    sendJson(res, 404, { error: "Community not found" });
    return;
  }

  if (result.error === "conflict") {
    sendJson(res, 409, {
      error: "Claim already in progress",
      minutes_left: result.minutesLeft,
    });
    return;
  }

  if (result.type === "review") {
    sendJson(res, 202, { review: true });
    return;
  }

  if (result.type === "code") {
    sendJson(res, 200, {
      code: result.code,
      expires_at: result.expires_at,
      command: result.command,
    });
  }
}
