// test/migrations.test.js
// Task 1 checkpoint: idempotency and seeded rows status.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { pool } from '../src/db/pool.js';

const execFileP = promisify(execFile);

test('migrations are idempotent and seeded communities are approved', async (t) => {
  t.after(async () => { await pool.end(); });

  // Run migrate twice - second run must be a no-op
  const run1 = await execFileP(process.execPath, ['src/db/migrate.js']);
  assert.match(run1.stdout, /No new migrations|already applied/);

  const run2 = await execFileP(process.execPath, ['src/db/migrate.js']);
  assert.match(run2.stdout, /No new migrations|already applied/);

  // All 15 seeded communities must be status = 'approved'
  const result = await pool.query(
    "SELECT COUNT(*)::integer AS cnt FROM communities WHERE status != 'approved'"
  );
  assert.equal(result.rows[0].cnt, 0, 'All seeded communities must have status approved');
});
