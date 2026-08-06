import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { config } from "./lib/config.js";
import { ensureContentDirs, paths } from "./lib/store.js";
import { readSettings } from "./lib/settings.js";
import { verifySiteToken } from "./lib/auth.js";
import { findUserById } from "./lib/users.js";
import { createMediaRequest } from "./lib/mediaRequests.js";
import { rateLimit } from "./lib/rateLimit.js";
import { adminRouter } from "./routes/admin.js";
import { catalogRouter } from "./routes/catalog.js";
import { authRouter } from "./routes/auth.js";
import { contentImageFallback } from "./middleware/contentImageFallback.js";
import {
  isStreamPath,
  mountStreamApp,
} from "./lib/streamService.js";

async function main() {
  await ensureContentDirs();
  await fs.mkdir(config.dataDir, { recursive: true });

  const app = express();

  // Embed player in-process before body parsers / SPA fallback.
  // Set ENABLE_STREAM=0 to disable (local API-only).
  if (process.env.ENABLE_STREAM !== "0") {
    try {
      const streamMount = mountStreamApp(config.root);
      app.use((req, res, next) => {
        if (isStreamPath(req.path)) {
          streamMount(req, res, next);
          return;
        }
        next();
      });
      console.log("Stream player mounted in-process");
    } catch (err) {
      console.error("Failed to mount stream player:", err);
      if (config.isProd) throw err;
    }
  }

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || config.corsOrigins.includes(origin)) {
          cb(null, true);
          return;
        }
        cb(null, false);
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "2mb" }));

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  /** Site-wide ads + optional per-user override when Bearer site token is sent. */
  app.get("/api/settings", async (req, res) => {
    const settings = await readSettings();
    let adsEnabled = settings.adsEnabled !== false;
    let userAdsEnabled: boolean | null = null;

    const header = req.headers.authorization;
    if (adsEnabled && header?.startsWith("Bearer ")) {
      try {
        const payload = await verifySiteToken(header.slice(7));
        const user = await findUserById(payload.sub);
        if (user) {
          const ver = typeof payload.ver === "number" ? payload.ver : 0;
          if (ver === (user.tokenVersion ?? 0)) {
            userAdsEnabled = user.adsEnabled !== false;
            adsEnabled = userAdsEnabled;
          }
        }
      } catch {
        /* ignore invalid token — fall back to site setting */
      }
    }

    res.json({
      adsEnabled,
      siteAdsEnabled: settings.adsEnabled !== false,
      userAdsEnabled,
      streamServerOrder: settings.streamServerOrder,
      streamServersEnabled: settings.streamServersEnabled,
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api", catalogRouter);
  app.use("/api/admin", adminRouter);

  const mediaRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "Too many title requests. Try again later.",
  });

  app.post("/api/media-requests", mediaRequestLimiter, async (req, res) => {
    try {
      const entry = await createMediaRequest(req.body || {});
      res.status(201).json({ ok: true, request: entry });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      res.status(400).json({ ok: false, error: msg });
    }
  });

  // Never expose private credential / config files from the content tree
  app.use("/content", (req, res, next) => {
    const p = decodeURIComponent(req.path).toLowerCase();
    if (
      p.includes("..") ||
      p.endsWith("users.json") ||
      p.endsWith(".env") ||
      p.includes("/server/data")
    ) {
      res.status(404).end();
      return;
    }
    next();
  });
  // Local poster/hero webps are gitignored — fall back to TMDB CDN on Render
  app.get("/content/poster/:file", contentImageFallback("poster"));
  app.get("/content/hero/:file", contentImageFallback("hero"));
  app.use("/content", express.static(paths().root, { maxAge: "1h", etag: true }));

  // Production: serve built public site + admin SPA from the same process
  const siteDist = path.join(config.root, "dist");
  const adminDist = path.join(config.root, "admin", "dist");

  if (fsSync.existsSync(adminDist)) {
    app.use(
      "/admin",
      express.static(adminDist, { maxAge: "1h", etag: true, index: false }),
    );
    app.get(/^\/admin(?:\/.*)?$/, (_req, res) => {
      res.sendFile(path.join(adminDist, "index.html"));
    });
  }

  if (fsSync.existsSync(siteDist)) {
    app.use(express.static(siteDist, { maxAge: "1h", etag: true }));
    app.get(
      /^(?!\/(?:api|content|admin|embed|proxy|bingr|js|icons|ads|adblocker)(?:\/|$)).*/,
      (_req, res) => {
        res.sendFile(path.join(siteDist, "index.html"));
      },
    );
  }


  app.listen(config.port, () => {
    console.log(`TV content server on http://localhost:${config.port}`);
    console.log(`Content dir: ${paths().root}`);
    console.log(`Data dir: ${config.dataDir}`);
    if (fsSync.existsSync(siteDist)) {
      console.log(`Site UI: ${siteDist}`);
    }
    if (fsSync.existsSync(adminDist)) {
      console.log(`Admin UI: /admin → ${adminDist}`);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
