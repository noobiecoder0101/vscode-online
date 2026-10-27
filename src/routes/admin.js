// src/routes/admin.js
// Staff and admin community review routes.

import { pool } from '../db/pool.js';
import { requireRole } from '../middleware/requireRole.js';
import { readJsonBody, sendJson } from '../utils/http.js';

const MAX_ID = 2_147_483_647;

function isValidId(value) {
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_ID;
}

export async function listAdminCommunities(req, res, { url }) {
  if (!await requireRole(req, res, ['staff', 'admin'])) return;

  const rawStatus = url.searchParams.get('status') || 'pending';
  const status = rawStatus.trim().toLowerCase();
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    sendJson(res, 400, { error: 'status must be pending, approved, or rejected' });
    return;
  }

  const rawLimit = url.searchParams.get('limit') || '20';
  const rawOffset = url.searchParams.get('offset') || '0';

  if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100) {
    sendJson(res, 400, { error: 'limit must be an integer between 1 and 100' });
    return;
  }

  if (!/^\d+$/.test(rawOffset) || Number(rawOffset) > MAX_ID) {
    sendJson(res, 400, { error: 'offset must be a non-negative integer' });
    return;
  }

  const limit = Number(rawLimit);
  const offset = Number(rawOffset);

  const [itemsResult, countResult] = await Promise.all([
    pool.query(`
      SELECT
        communities.id,
        communities.name,
        communities.description,
        communities.platform,
        communities.member_count,
        communities.invite_link,
        communities.canonical_link,
        communities.status,
        communities.submitted_by,
        communities.reviewed_by,
        communities.review_note,
        communities.reviewed_at,
        communities.created_at,
        categories.slug AS category_slug,
        categories.name AS category_name
      FROM communities
      INNER JOIN categories ON categories.id = communities.category_id
      WHERE communities.status = $1
      ORDER BY communities.created_at ASC, communities.id ASC
      LIMIT $2 OFFSET $3
    `, [status, limit, offset]),
    pool.query(
      'SELECT COUNT(*)::integer AS total FROM communities WHERE status = $1',
      [status]
    ),
  ]);

  res.setHeader('Cache-Control', 'no-store');
  sendJson(res, 200, {
    items: itemsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      platform: row.platform,
      member_count: row.member_count,
      invite_link: row.invite_link,
      canonical_link: row.canonical_link,
      status: row.status,
      submitted_by: row.submitted_by,
      reviewed_by: row.reviewed_by,
      review_note: row.review_note,
      reviewed_at: row.reviewed_at,
      created_at: row.created_at,
      category: {
        slug: row.category_slug,
        name: row.category_name,
      },
    })),
    total: countResult.rows[0].total,
    limit,
    offset,
  });
}

export async function approveCommunity(req, res, { params }) {
  if (!await requireRole(req, res, ['staff', 'admin'])) return;

  if (!isValidId(params.id)) {
    sendJson(res, 404, { error: 'Community not found' });
    return;
  }

  const result = await pool.query(`
    UPDATE communities
    SET status = 'approved',
        reviewed_by = $1,
        reviewed_at = now()
    WHERE id = $2
    RETURNING id, status
  `, [req.user.id, Number(params.id)]);

  if (result.rowCount === 0) {
    sendJson(res, 404, { error: 'Community not found' });
    return;
  }

  sendJson(res, 200, { id: result.rows[0].id, status: result.rows[0].status });
}

export async function rejectCommunity(req, res, { params }) {
  if (!await requireRole(req, res, ['staff', 'admin'])) return;

  if (!isValidId(params.id)) {
    sendJson(res, 404, { error: 'Community not found' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, err.statusCode || 400, { error: err.message });
    return;
  }

  if (typeof body?.reason !== 'string') {
    sendJson(res, 400, { error: 'reason must be a string between 3 and 300 characters' });
    return;
  }

  const reason = body.reason.trim();
  if (reason.length < 3 || reason.length > 300) {
    sendJson(res, 400, { error: 'reason must be between 3 and 300 characters' });
    return;
  }

  const result = await pool.query(`
    UPDATE communities
    SET status = 'rejected',
        review_note = $1,
        reviewed_by = $2,
        reviewed_at = now()
    WHERE id = $3
    RETURNING id, status, review_note
  `, [reason, req.user.id, Number(params.id)]);

  if (result.rowCount === 0) {
    sendJson(res, 404, { error: 'Community not found' });
    return;
  }

  sendJson(res, 200, {
    id: result.rows[0].id,
    status: result.rows[0].status,
    review_note: result.rows[0].review_note,
  });
}

export async function listClaimReviews(req, res, { url }) {
  if (!await requireRole(req, res, ['staff', 'admin'])) return;

  const rawStatus = url.searchParams.get('status') || 'pending';
  const status = rawStatus.trim().toLowerCase();
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    sendJson(res, 400, { error: 'status must be pending, approved, or rejected' });
    return;
  }

  const result = await pool.query(`
    SELECT
      claim_reviews.id,
      claim_reviews.community_id,
      claim_reviews.requested_by,
      claim_reviews.reason,
      claim_reviews.evidence,
      claim_reviews.status,
      claim_reviews.created_at,
      communities.name AS community_name,
      communities.platform,
      communities.invite_link,
      users.email AS requester_email
    FROM claim_reviews
    INNER JOIN communities ON communities.id = claim_reviews.community_id
    LEFT JOIN users ON users.id = claim_reviews.requested_by
    WHERE claim_reviews.status = $1
    ORDER BY claim_reviews.created_at ASC, claim_reviews.id ASC
  `, [status]);

  res.setHeader('Cache-Control', 'no-store');
  sendJson(res, 200, { items: result.rows });
}

export async function approveClaimReview(req, res, { params }) {
  if (!await requireRole(req, res, ['staff', 'admin'])) return;

  if (!isValidId(params.id)) {
    sendJson(res, 404, { error: 'Claim review not found' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reviewRes = await client.query(`
      UPDATE claim_reviews
      SET status = 'approved',
          resolved_by = $1,
          resolved_at = now()
      WHERE id = $2 AND status = 'pending'
      RETURNING id, community_id, requested_by
    `, [req.user.id, Number(params.id)]);

    if (reviewRes.rowCount === 0) {
      await client.query('ROLLBACK');
      sendJson(res, 404, { error: 'Claim review not found or already resolved' });
      return;
    }

    const { community_id, requested_by } = reviewRes.rows[0];

    await client.query(`
      UPDATE communities
      SET owner_id = $1,
          claim_code = NULL,
          claim_code_expires_at = NULL,
          claim_requested_by = NULL
      WHERE id = $2
    `, [requested_by, community_id]);

    await client.query('COMMIT');
    sendJson(res, 200, { id: Number(params.id), status: 'approved' });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export async function rejectClaimReview(req, res, { params }) {
  if (!await requireRole(req, res, ['staff', 'admin'])) return;

  if (!isValidId(params.id)) {
    sendJson(res, 404, { error: 'Claim review not found' });
    return;
  }

  const result = await pool.query(`
    UPDATE claim_reviews
    SET status = 'rejected',
        resolved_by = $1,
        resolved_at = now()
    WHERE id = $2 AND status = 'pending'
    RETURNING id, status
  `, [req.user.id, Number(params.id)]);

  if (result.rowCount === 0) {
    sendJson(res, 404, { error: 'Claim review not found or already resolved' });
    return;
  }

  sendJson(res, 200, { id: result.rows[0].id, status: result.rows[0].status });
}
