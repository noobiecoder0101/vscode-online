import { verifyToken } from "../utils/auth.js";

export function attachUser(req, res) {
  const cookies = {};
  const cookieHeader = req.headers.cookie;

  if (cookieHeader) {
    for (const piece of cookieHeader.split("; ")) {
      const separatorIndex = piece.indexOf("=");

      if (separatorIndex !== -1) {
        const name = piece.slice(0, separatorIndex);
        const value = piece.slice(separatorIndex + 1);
        cookies[name] = value;
      }
    }
  }

  if (!cookies.token) {
    req.user = null;
    return;
  }

  try {
    req.user = verifyToken(cookies.token);
  } catch {
    req.user = null;
  }
}
