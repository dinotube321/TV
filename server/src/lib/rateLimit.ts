import type { Request, Response, NextFunction } from "express";

type Entry = { count: number; resetAt: number };

const buckets = new Map<string, Entry>();

/** Simple in-memory sliding window rate limiter (per-process). */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  /** Extra key suffix (e.g. userId). */
  key?: (req: Request) => string;
  message?: string;
}) {
  const message = opts.message || "Too many requests. Try again later.";
  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (typeof req.headers["x-forwarded-for"] === "string"
        ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
        : "") ||
      req.socket.remoteAddress ||
      "unknown";
    const extra = opts.key?.(req) ?? "";
    const key = `${req.path}|${ip}|${extra}`;
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    const remaining = Math.max(0, opts.max - entry.count);
    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader(
      "X-RateLimit-Reset",
      String(Math.ceil(entry.resetAt / 1000)),
    );
    if (entry.count > opts.max) {
      res.status(429).json({ error: message });
      return;
    }
    next();
  };
}

/** Occasional cleanup so the map doesn't grow forever. */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now >= v.resetAt) buckets.delete(k);
  }
}, 60_000).unref?.();
