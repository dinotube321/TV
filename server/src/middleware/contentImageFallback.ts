import type { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { paths } from "../lib/store.js";
import { tmdbConfigured, tmdbGet, tmdbImage } from "../services/tmdb.js";

type ImageKind = "poster" | "hero";

const resolved = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function parseAssetName(file: string): { media: "movie" | "tv"; tmdbId: number } | null {
  const base = path.basename(file);
  const m = /^(movie|tv)-(\d+)\.webp$/i.exec(base);
  if (!m) return null;
  return { media: m[1].toLowerCase() as "movie" | "tv", tmdbId: Number(m[2]) };
}

async function resolveTmdbUrl(kind: ImageKind, media: "movie" | "tv", tmdbId: number) {
  const key = `${kind}:${media}:${tmdbId}`;
  const cached = resolved.get(key);
  if (cached !== undefined) return cached;

  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      if (!tmdbConfigured()) return "";
      try {
        const details = await tmdbGet<{
          poster_path: string | null;
          backdrop_path: string | null;
        }>(`/${media === "movie" ? "movie" : "tv"}/${tmdbId}?language=en-US`);
        const size = kind === "poster" ? "w500" : "w1280";
        const imgPath =
          kind === "poster"
            ? details.poster_path
            : details.backdrop_path || details.poster_path;
        return tmdbImage(imgPath, size);
      } catch {
        return "";
      }
    })().then((url) => {
      resolved.set(key, url);
      inflight.delete(key);
      return url;
    });
    inflight.set(key, pending);
  }
  return pending;
}

/** Serve local poster/hero files; if missing (common on Render), redirect to TMDB CDN. */
export function contentImageFallback(kind: ImageKind) {
  const dir = () => (kind === "poster" ? paths().poster : paths().hero);

  return async (req: Request, res: Response, next: NextFunction) => {
    const file = path.basename(req.path);
    if (!file || file === "/" || file.includes("..")) {
      next();
      return;
    }

    const localPath = path.join(dir(), file);
    if (fs.existsSync(localPath)) {
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.sendFile(localPath);
      return;
    }

    const parsed = parseAssetName(file);
    if (!parsed) {
      res.status(404).end();
      return;
    }

    const url = await resolveTmdbUrl(kind, parsed.media, parsed.tmdbId);
    if (!url) {
      res.status(404).end();
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=86400");
    res.redirect(302, url);
  };
}
