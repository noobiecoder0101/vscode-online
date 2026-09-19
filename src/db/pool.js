import { Pool } from "pg";
import "dotenv/config";

export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "oninna",
  password: process.env.DB_PASSWORD || "oninna_dev_password",
  database: process.env.DB_NAME || "oninna",
});
