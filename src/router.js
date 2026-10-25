import { attachUser } from "./middleware/attachUser.js";
import { validatePostRequest } from "./middleware/requestSecurity.js";
import { login, logout, me, register } from "./routes/auth.js";
import { listCategories } from "./routes/categories.js";
import { getCommunity, getCommunityJoinLink, listCommunities } from "./routes/communities.js";
import { handleHealthCheck } from "./routes/health.js";
import { sendJson } from "./utils/http.js";

const BAD_REQUEST = Symbol("BAD_REQUEST");

function matchPath(pattern, pathname) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathPart = pathParts[index];
    if (patternPart.startsWith(":")) {
      try {
        params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      } catch {
        return BAD_REQUEST;
      }
    } else if (patternPart !== pathPart) {
      return null;
    }
  }
  return params;
}

export function createRouter() {
  const routes = [];
  function register(method, pattern, handler) {
    routes.push({ method, pattern, handler });
  }
  async function handle(req, res) {
    attachUser(req, res);
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;
    if (req.method === "POST" && !validatePostRequest(req, res)) return true;
    try {
      decodeURIComponent(url.pathname);
    } catch {
      sendJson(res, 400, { error: "Bad request" });
      return true;
    }
    for (const route of routes) {
      if (route.method !== req.method) continue;
      const params = matchPath(route.pattern, url.pathname);
      if (params === BAD_REQUEST) {
        sendJson(res, 400, { error: "Bad request" });
        return true;
      }
      if (params !== null) {
        await route.handler(req, res, { params, url });
        return true;
      }
    }
    sendJson(res, 404, { error: "API route not found" });
    return true;
  }
  return { register, handle };
}

export const router = createRouter();
router.register("GET", "/api/health", handleHealthCheck);
router.register("GET", "/api/categories", listCategories);
router.register("GET", "/api/communities", listCommunities);
router.register("GET", "/api/communities/:id/join", getCommunityJoinLink);
router.register("GET", "/api/communities/:id", getCommunity);
router.register("POST", "/api/auth/register", register);
router.register("POST", "/api/auth/login", login);
router.register("POST", "/api/auth/logout", logout);
router.register("GET", "/api/auth/me", me);
