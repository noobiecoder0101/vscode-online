import { pool } from "../db/pool.js";
import { sendJson } from "../utils/http.js";

export async function listCategories(req, res) {
  const result = await pool.query(`
    SELECT
      categories.id,
      categories.slug,
      categories.name,
      categories.icon,
      COUNT(communities.id)::integer AS community_count
    FROM categories
    LEFT JOIN communities ON communities.category_id = categories.id
    GROUP BY categories.id, categories.slug, categories.name, categories.icon
    ORDER BY categories.id
  `);

  sendJson(res, 200, result.rows);
}
