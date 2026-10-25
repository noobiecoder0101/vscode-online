import { verifyToken } from "../utils/auth.js";
import { parseCookies } from "../utils/http.js";

export function attachUser(req, res) {
  const cookies = parseCookies(req.headers.cookie);

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
