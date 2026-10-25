import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { sendJson } from "../utils/http.js";

const PLATFORM_VALUES = ["telegram", "discord", "whatsapp", "reddit", "slack", "signal", "facebook", "x"];
const MAX_ID = 2_147_483_647;

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
  const conditions = [];
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
    whereClause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
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
    "SELECT communities.invite_link FROM communities WHERE communities.id = $1",
    [Number(params.id)],
  );

  if (!result.rowCount) {
    sendJson(res, 404, { error: "Community not found" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  sendJson(res, 200, { invite_link: result.rows[0].invite_link });
}
