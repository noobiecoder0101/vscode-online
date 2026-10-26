/**
 * ONINNA Shared Client API & Navigation Helpers
 */

/**
 * Safe fetch wrapper that handles JSON formatting, headers, credentials,
 * and error extraction.
 *
 * @param {string} path - Target API URL or path (e.g. "/api/categories")
 * @param {object} [options] - Standard fetch options plus body helper
 * @returns {Promise<{ ok: boolean, status: number, data: any, retryAfter: number | null, error?: string }>}
 */
export async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { ...options.headers };

  let body = options.body;
  if (body !== undefined && typeof body === "object" && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }

  const fetchOptions = {
    method,
    headers,
    credentials: options.credentials || "same-origin",
    signal: options.signal,
  };

  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    fetchOptions.body = body;
  }

  try {
    const res = await fetch(path, fetchOptions);
    const contentType = res.headers.get("content-type") || "";
    let data = null;

    if (contentType.includes("application/json")) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      const text = await res.text();
      data = text ? { message: text } : null;
    }

    const retryAfter = Number(res.headers.get("retry-after")) || null;

    return {
      ok: res.ok,
      status: res.status,
      data,
      retryAfter,
    };
  } catch (err) {
    if (err.name === "AbortError") {
      throw err;
    }
    return {
      ok: false,
      status: 0,
      data: null,
      retryAfter: null,
      error: err.message || "Network error",
    };
  }
}

/**
 * Initializes navigation bar authentication UI across public pages.
 * Fetches the current session and populates sign-in / user + sign-out elements.
 *
 * @returns {Promise<object | null>} Current user or null
 */
export async function initNav() {
  const authContainers = document.querySelectorAll(".nav-auth, #navAuth");
  if (!authContainers.length) return null;

  try {
    const res = await api("/api/auth/me");
    const user = res.ok && res.data && res.data.user ? res.data.user : null;

    for (const container of authContainers) {
      container.innerHTML = "";
      if (user) {
        const userSpan = document.createElement("span");
        userSpan.className = "nav-user";
        userSpan.textContent = user.email;

        const signOutBtn = document.createElement("button");
        signOutBtn.type = "button";
        signOutBtn.className = "btn-signout";
        signOutBtn.textContent = "Sign out";
        signOutBtn.addEventListener("click", async () => {
          signOutBtn.disabled = true;
          await api("/api/auth/logout", { method: "POST" });
          location.reload();
        });

        container.appendChild(userSpan);
        container.appendChild(signOutBtn);
      } else {
        const signInLink = document.createElement("a");
        signInLink.href = loginUrl();
        signInLink.className = "btn-signin";
        signInLink.textContent = "Sign in";
        container.appendChild(signInLink);
      }
    }

    return user;
  } catch {
    return null;
  }
}

/**
 * Generates a login URL preserving the current location as the return target.
 *
 * @param {string} [nextUrl] - Optional explicit return target
 * @returns {string} Login URL with encoded next parameter
 */
export function loginUrl(nextUrl) {
  const target = nextUrl || (location.pathname + location.search);
  const safe = safeNext(target, "communities.html");
  return `login.html?next=${encodeURIComponent(safe)}`;
}

/**
 * Returns a human-readable display label for supported community platforms.
 *
 * @param {string} platform - Internal platform identifier
 * @returns {string} Display label
 */
export function platformLabel(platform) {
  const map = {
    telegram: "Telegram",
    discord: "Discord",
    whatsapp: "WhatsApp",
    reddit: "Reddit",
    slack: "Slack",
    signal: "Signal",
    facebook: "Facebook",
    x: "X (Twitter)",
  };
  return map[String(platform).toLowerCase()] || (platform ? String(platform) : "Community");
}

/**
 * Validates that an image URL is safe to render in the DOM.
 *
 * @param {string} url - Target image URL
 * @returns {string | null} Safe URL or null
 */
export function safeImage(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed, location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {}
  return null;
}

/**
 * Validates that an external/internal invite URL is safe to visit.
 *
 * @param {string} url - External invite link
 * @returns {string | null} Safe URL or null
 */
export function safeUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed, location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "tg:") {
      return parsed.href;
    }
  } catch {}
  return null;
}

/**
 * Validates a redirection target to prevent open redirect vulnerabilities.
 *
 * @param {string} next - Input URL to validate
 * @param {string} [fallback="communities.html"] - Safe fallback if invalid
 * @returns {string} Safe relative target
 */
export function safeNext(next, fallback = "communities.html") {
  if (!next || typeof next !== "string") return fallback;
  const trimmed = next.trim();
  // Reject protocol-relative // URLs or absolute schemes
  if (trimmed.startsWith("//") || trimmed.includes(":") || /[\r\n]/.test(trimmed)) {
    return fallback;
  }
  // Allow relative URLs or relative filenames
  if (trimmed.startsWith("/") || /^[a-zA-Z0-9_\-./]+(\?[a-zA-Z0-9_=&%-]*)?$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}
