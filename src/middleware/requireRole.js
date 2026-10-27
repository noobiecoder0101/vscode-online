// src/middleware/requireRole.js
// Loads the user role from database on every call (not from token).

import { pool } from '../db/pool.js';
import { sendJson } from '../utils/http.js';

export async function requireRole(req, res, allowedRoles = ['staff', 'admin']) {
  if (!req.user || !req.user.id) {
    sendJson(res, 401, { error: 'Sign in required' });
    return false;
  }

  const result = await pool.query(
    'SELECT users.role FROM users WHERE users.id = $1',
    [req.user.id]
  );

  if (!result.rowCount) {
    sendJson(res, 401, { error: 'Sign in required' });
    return false;
  }

  const role = result.rows[0].role;
  req.user.role = role;

  const validRoles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!validRoles.includes(role)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return false;
  }

  return true;
}
