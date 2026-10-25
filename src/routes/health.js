import { pool } from "../db/pool.js";
import { sendJson } from "../utils/http.js";

export async function handleHealthCheck(req, res) {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");
    sendJson(res, 200, {
      status: "ok",
      db_time: result.rows[0].current_time,
    });
  } catch (err) {
    console.error("Database connection failed:", err.message, "code:", err.code);
    sendJson(res, 500, { status: "error" });
  }
}
