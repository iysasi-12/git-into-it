import type { RequestHandler } from "express";
import { AppError } from "../errors.js";

/**
 * Per-IP fixed-window limiter (in memory; one server process). Protects the Aivana key
 * on the public URL: past the limit, the request gets a 429 instead of an AI call.
 * Keep it generous: judges on the same venue Wi-Fi share one IP, and one demo run makes
 * about 15 AI calls (parse, what-ifs, a recommend after each, memo).
 */
export function rateLimit(opts: { limit: number; windowMs: number; now?: () => number }): RequestHandler {
  const now = opts.now ?? Date.now;
  let windowStart = now();
  let counts = new Map<string, number>();

  return (req, res, next) => {
    const t = now();
    if (t - windowStart >= opts.windowMs) {
      windowStart = t;
      counts = new Map(); // drop old IPs so the map can't grow without bound
    }
    const key = req.ip ?? "unknown";
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (n > opts.limit) {
      const retryAfter = Math.ceil((windowStart + opts.windowMs - t) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      const minutes = Math.ceil(retryAfter / 60);
      next(new AppError(429, "RATE_LIMITED", `Too many AI requests from your network. Try again in ${minutes} min.`));
      return;
    }
    next();
  };
}
