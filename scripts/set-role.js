// scripts/set-role.js
// Sets a user role in the database.
// Usage: node scripts/set-role.js <email> <role>

import 'dotenv/config';
import { pool } from '../src/db/pool.js';

const VALID_ROLES = ['user', 'staff', 'admin'];

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const [emailInput, roleInput] = args;

  if (!emailInput || !roleInput) {
    console.error('Usage: npm run user:role -- <email> <role>');
    process.exit(1);
  }

  const email = emailInput.trim().toLowerCase();
  const role = roleInput.trim().toLowerCase();

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  try {
    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE email = $2 RETURNING id, email, role',
      [role, email]
    );

    if (result.rowCount === 0) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }

    console.log(`${result.rows[0].email}: ${result.rows[0].role}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
