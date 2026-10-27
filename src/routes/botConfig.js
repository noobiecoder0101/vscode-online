// src/routes/botConfig.js
// Owner bot configuration API.

import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { readJsonBody, sendJson } from '../utils/http.js';

const MAX_ID = 2_147_483_647;

function isValidId(value) {
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_ID;
}

function stripControlChars(str) {
  return str.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export async function getBotConfig(req, res, { params }) {
  if (!requireAuth(req, res)) return;

  if (!isValidId(params.id)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  const result = await pool.query(`
    SELECT
      communities.id,
      communities.owner_id,
      bot_installs.id AS install_id,
      bot_installs.config,
      bot_installs.is_active
    FROM communities
    INNER JOIN bot_installs ON bot_installs.community_id = communities.id
    WHERE communities.id = $1
  `, [Number(params.id)]);

  if (result.rowCount === 0) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  const row = result.rows[0];
  if (row.owner_id !== req.user.id) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  const config = row.config || {};
  sendJson(res, 200, {
    greeting_template: config.greeting_template || 'Welcome {user} to {group_name}! Please read {rules}',
    rules_text: config.rules_text || '',
    enabled: row.is_active,
  });
}

export async function updateBotConfig(req, res, { params }) {
  if (!requireAuth(req, res)) return;

  if (!isValidId(params.id)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  const check = await pool.query(`
    SELECT
      communities.id,
      communities.owner_id,
      bot_installs.id AS install_id,
      bot_installs.config,
      bot_installs.is_active
    FROM communities
    INNER JOIN bot_installs ON bot_installs.community_id = communities.id
    WHERE communities.id = $1
  `, [Number(params.id)]);

  if (check.rowCount === 0) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  const row = check.rows[0];
  if (row.owner_id !== req.user.id) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, err.statusCode || 400, { error: err.message });
    return;
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    sendJson(res, 400, { error: 'Request body must be a JSON object' });
    return;
  }

  if (typeof body.greeting_template !== 'string') {
    sendJson(res, 400, { error: 'greeting_template must be a string' });
    return;
  }

  const greetingTemplate = stripControlChars(body.greeting_template);
  if (greetingTemplate.length < 1 || greetingTemplate.length > 500) {
    sendJson(res, 400, { error: 'greeting_template must be between 1 and 500 characters' });
    return;
  }

  let rulesText = '';
  if (body.rules_text !== undefined && body.rules_text !== null) {
    if (typeof body.rules_text !== 'string') {
      sendJson(res, 400, { error: 'rules_text must be a string' });
      return;
    }
    rulesText = stripControlChars(body.rules_text);
    if (rulesText.length > 1000) {
      sendJson(res, 400, { error: 'rules_text must be 1000 characters or fewer' });
      return;
    }
  }

  if (typeof body.enabled !== 'boolean') {
    sendJson(res, 400, { error: 'enabled must be a boolean' });
    return;
  }

  const newConfig = {
    greeting_template: greetingTemplate,
    rules_text: rulesText,
  };

  const updateResult = await pool.query(`
    UPDATE bot_installs
    SET config = $1,
        is_active = $2
    WHERE id = $3
    RETURNING config, is_active
  `, [JSON.stringify(newConfig), body.enabled, row.install_id]);

  sendJson(res, 200, {
    greeting_template: greetingTemplate,
    rules_text: rulesText,
    enabled: updateResult.rows[0].is_active,
  });
}
