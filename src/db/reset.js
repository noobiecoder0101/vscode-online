// src/db/reset.js
// Drops all tables (including schema_migrations), then runs migrate and seed.
// Refuses to run in production. Requires --yes flag.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import 'dotenv/config';
import { pool } from './pool.js';

const execFileP = promisify(execFile);

async function run() {
  if (process.env.NODE_ENV === 'production') {
    console.error('db:reset refused in production.');
    process.exit(1);
  }
  if (!process.argv.includes('--yes')) {
    console.error('Usage: node src/db/reset.js --yes');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    // Drop all tables in reverse dependency order
    await client.query(`
      DROP TABLE IF EXISTS
        reports,
        verification_logs,
        claim_reviews,
        bot_installs,
        bots,
        communities,
        users,
        categories,
        schema_migrations
      CASCADE
    `);
    console.log('All tables dropped.');
  } finally {
    client.release();
    await pool.end();
  }

  const node = process.execPath;
  const { stdout: migrateOut } = await execFileP(node, ['src/db/migrate.js']);
  process.stdout.write(migrateOut);
  const { stdout: seedOut } = await execFileP(node, ['src/db/seed.js']);
  process.stdout.write(seedOut);
  console.log('Reset complete.');
}

run().catch(err => {
  console.error('Reset error:', err.message);
  process.exit(1);
});
