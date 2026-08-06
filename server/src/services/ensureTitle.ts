import { readInfo, getCatalogMap } from "../lib/store.js";
import { tmdbConfigured } from "../lib/config.js";
import { importFromTmdb } from "./importTitle.js";
import type { Title } from "../types.js";

const inFlight = new Map<string, Promise<{ title: Title; created: boolean }>>();

/** Simple global throttle for public auto-import. */
const recentImports: number[] = [];
const MAX_PER_MINUTE = 20;
const MAX_CONCURRENT = 3;
let concurrent = 0;

function allowImport() {
  const now = Date.now();
  while (recentImports.length && now - recentImports[0]! > 60_000) {
    recentImports.shift();
  }
  return recentImports.length < MAX_PER_MINUTE && concurrent < MAX_CONCURRENT;
}

export function parseLocalId(
  id: string,
): { tmdbId: number; type: "movie" | "tv" } | null {
  const m = /^((?:movie)|(?:tv))-(\d+)$/.exec(id.trim());
  if (!m) return null;
  return {
    type: m[1] as "movie" | "tv",
    tmdbId: Number(m[2]),
  };
}

/**
 * Return local title if present; otherwise import from TMDB.
 * Dedupes concurrent requests for the same id.
 */
export async function ensureFromTmdb(
  tmdbId: number,
  mediaType: "movie" | "tv",
): Promise<{ title: Title; created: boolean }> {
  const localId = `${mediaType === "movie" ? "movie" : "tv"}-${tmdbId}`;
  const existing = await readInfo(localId);
  if (existing) return { title: existing, created: false };

  const pending = inFlight.get(localId);
  if (pending) return pending;

  if (!allowImport()) {
    throw Object.assign(new Error("Import rate limited — try again shortly"), {
      status: 429,
    });
  }

  const job = (async () => {
    concurrent += 1;
    recentImports.push(Date.now());
    try {
      // Re-check after waiting in queue
      const again = await readInfo(localId);
      if (again) return { title: again, created: false };
      const { title } = await importFromTmdb(tmdbId, mediaType);
      return { title, created: true };
    } finally {
      concurrent -= 1;
      inFlight.delete(localId);
    }
  })();

  inFlight.set(localId, job);
  return job;
}

export async function ensureByLocalId(id: string) {
  const parsed = parseLocalId(id);
  if (!parsed) {
    throw Object.assign(new Error("Invalid title id"), { status: 400 });
  }
  const existing = await readInfo(id);
  if (existing) return { title: existing, created: false };
  if (!tmdbConfigured()) {
    throw Object.assign(new Error("TMDB is not configured"), { status: 503 });
  }
  return ensureFromTmdb(parsed.tmdbId, parsed.type);
}

export async function isLocalTitle(id: string) {
  const map = await getCatalogMap();
  return map.has(id);
}
