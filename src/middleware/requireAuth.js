export function requireAuth(req, res) {
  if (req.user === null) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Sign in required" }));
    return false;
  }

  return true;
}
