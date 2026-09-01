import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";




const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "oninna",
  password: process.env.DB_PASSWORD || "oninna_dev_password",
  database: process.env.DB_NAME || "oninna",
});

function serveStaticFile(req, res) {
    // sets default path to index.html if the request is for / eg  https://onnina.com/ goes to /index.html b deafault 
    //cleans of pesky query parameters from the url so that we can serve the correct file -- and we use [0] so thaat the other half of the split (the query parameters) is discarded and not searched for cause we dont have it as a file (error 404 file not found )
  let requestedPath = req.url === "/" ? "/index.html" : req.url;
  requestedPath = requestedPath.split("?")[0];

  const filePath = path.join(PUBLIC_DIR, requestedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
// an aysnchronous function that reads the file at the specified filePath and sends it to the client. If the file is not found, it sends a 404 error. If there is any other error, it sends a 500 error. If the file is found, it determines the content type based on the file extension and sends the file content to the client with a 200 status code.
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
      } else {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("500 Internal Server Error");
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}

async function handleHealthCheck(req, res) {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      db_time: result.rows[0].current_time,
    }));
  } catch (err) {
    console.error("Database connection failed:", err.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "error", message: err.message }));
  }
}


const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url.startsWith("/api/health")) {
    handleHealthCheck(req, res);
    return;
  }

  serveStaticFile(req, res);
});

server.listen(PORT, () => {
  console.log(`ONINNA server running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});