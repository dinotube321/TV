import { createRequire } from "node:module";
import path from "node:path";
import type { Express, RequestHandler } from "express";

/** Paths that belong to the hotlinking embed/player service. */
export function isStreamPath(pathname: string): boolean {
  return (
    pathname.startsWith("/embed") ||
    pathname.startsWith("/proxy") ||
    pathname.startsWith("/bingr") ||
    pathname.startsWith("/js/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/ads") ||
    pathname.startsWith("/adblocker") ||
    pathname.startsWith("/api/embed") ||
    pathname.startsWith("/api/backup") ||
    pathname.startsWith("/api/vast") ||
    pathname.startsWith("/api/extract") ||
    pathname.startsWith("/api/source-pref") ||
    pathname.startsWith("/api/cache")
  );
}

/**
 * Mount the hotlinking Express app in-process (no localhost HTTP hop).
 * Classic HLS segments are large; proxying through a sibling process on Render
 * was timing out and leaving the player stuck on reload.
 */
export function mountStreamApp(repoRoot: string): RequestHandler {
  const require = createRequire(import.meta.url);
  const hotlinkPath = path.resolve(repoRoot, "hotlinking", "server.js");
  const { app: hotlinkApp } = require(hotlinkPath) as { app: Express };

  return (req, res, next) => {
    if (!isStreamPath(req.path)) {
      next();
      return;
    }
    // Hand off fully — do not fall through to the site SPA.
    hotlinkApp(req, res, next);
  };
}
