const evictionInterval = 60_000;

export function createRateLimiter(maxAttempts, windowMs) {
  const entries = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key);
    }
  }, evictionInterval);
  timer.unref();

  function getEntry(key) {
    const now = Date.now();
    const entry = entries.get(key);
    if (!entry || entry.resetAt <= now) {
      const freshEntry = { count: 0, resetAt: now + windowMs };
      entries.set(key, freshEntry);
      return freshEntry;
    }
    return entry;
  }

  function retryAfter(entry) {
    return Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
  }

  return {
    attempt(key) {
      const entry = getEntry(key);
      if (entry.count >= maxAttempts) return { allowed: false, retryAfter: retryAfter(entry) };
      entry.count += 1;
      return { allowed: true };
    },
    isLimited(key) {
      const entry = getEntry(key);
      if (entry.count >= maxAttempts) return { allowed: false, retryAfter: retryAfter(entry) };
      return { allowed: true };
    },
  };
}

export function getClientIp(req) {
  if (process.env.TRUST_PROXY === "true") {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
      return forwardedFor.split(",")[0].trim();
    }
  }
  return req.socket.remoteAddress || "unknown";
}
