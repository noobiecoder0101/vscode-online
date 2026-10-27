// src/db/migrate.js
// Runs pending SQL migration files from src/db/migrations/ in order.
// Each file is applied in its own transaction and tracked in schema_migrations.

import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getApplied(client) {
  const result = await client.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return new Set(result.rows.map(r => r.filename));
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return result.rowCount > 0;
}

async function run() {
  const client = await pool.connect();
  try {
    // Create tracking table if missing
    await ensureMigrationsTable(client);

    const applied = await getApplied(client);

    // Bootstrap: if schema_migrations is empty but communities already exists,
    // record 001 as applied without running it.
    if (applied.size === 0 && await tableExists(client, 'communities')) {
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        ['001_initial.sql']
      );
      applied.add('001_initial.sql');
      console.log('Recorded 001_initial.sql as applied (table already exists).');
    }

    const files = (await readdir(MIGRATIONS_DIR))
      .filter(f => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Skip ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`Applied ${file}`);
        ran += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Migration failed on ${file}: ${err.message}`);
        process.exit(1);
      }
    }

    if (ran === 0) console.log('No new migrations to apply.');
    else console.log(`Done. ${ran} migration(s) applied.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
