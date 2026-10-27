// src/db/seed.js
// Runs seed.sql only when the communities table is empty.
// Skips without error if rows already exist.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, 'seed.sql');

async function run() {
  const client = await pool.connect();
  try {
    const countResult = await client.query(
      'SELECT COUNT(*)::integer AS cnt FROM communities'
    );
    if (countResult.rows[0].cnt > 0) {
      console.log('Seed skipped: communities table is not empty.');
      return;
    }
    const sql = await readFile(SEED_FILE, 'utf8');
    await client.query(sql);
    console.log('Seed complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
