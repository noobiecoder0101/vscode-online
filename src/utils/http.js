export function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export function readJsonBody(req, maxBytes = 10_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        const error = new Error("Request body is too large");
        error.statusCode = 413;
        reject(error);
        req.resume();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        const error = new Error("Invalid JSON body");
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export function parseCookies(cookieHeader = "") {
  const cookies = {};
  for (const piece of cookieHeader.split(";")) {
    const separatorIndex = piece.indexOf("=");
    if (separatorIndex === -1) continue;
    const name = piece.slice(0, separatorIndex).trim();
    const value = piece.slice(separatorIndex + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}
