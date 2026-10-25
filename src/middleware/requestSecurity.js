import { sendJson } from "../utils/http.js";

export function validatePostRequest(req, res) {
  const contentType = (req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    sendJson(res, 415, { error: "Content-Type must be application/json" });
    return false;
  }

  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) {
        sendJson(res, 403, { error: "Invalid origin" });
        return false;
      }
    } catch {
      sendJson(res, 403, { error: "Invalid origin" });
      return false;
    }
  }

  return true;
}
