import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { isSafeUserRecordId } from "./safePath.js";

const MAX_ITEMS = 24;
const PLAYBACK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type ContinueWatchEntry = {
  id: string;
  type: "movie" | "show";
  tmdbId: number;
  title: string;
  poster: string;
  image: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  updatedAt: number;
  /** Playback position seconds */
  t: number;
  duration: number;
  paused?: boolean;
  playUrl?: string | null;
  server?: string | null;
  quality?: string | null;
};

interface ContinueFile {
  entries: ContinueWatchEntry[];
}

let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function storeDir() {
  const dir = path.join(config.dataDir, "continue");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function fileForUser(userId: string) {
  if (!isSafeUserRecordId(userId)) {
    throw new Error("Invalid user id");
  }
  return path.join(config.dataDir, "continue", `${userId}.json`);
}

function isValidEntry(e: unknown): e is ContinueWatchEntry {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    (o.type === "movie" || o.type === "show") &&
    typeof o.tmdbId === "number" &&
    Number.isFinite(o.tmdbId) &&
    o.tmdbId > 0 &&
    typeof o.title === "string" &&
    typeof o.updatedAt === "number"
  );
}

function normalizeEntry(raw: ContinueWatchEntry): ContinueWatchEntry | null {
  if (!isValidEntry(raw)) return null;
  const t = Math.max(0, Number(raw.t) || 0);
  const duration = Math.max(0, Number(raw.duration) || 0);
  const updatedAt = Number(raw.updatedAt) || Date.now();
  if (Date.now() - updatedAt > PLAYBACK_TTL_MS) return null;
  if (t < 2) return null;
  if (duration > 30 && t >= duration - 12) return null;

  const type = raw.type === "show" ? "show" : "movie";
  const tmdbId = Math.floor(Number(raw.tmdbId));
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : type === "show"
        ? `tv-${tmdbId}`
        : `movie-${tmdbId}`;

  const out: ContinueWatchEntry = {
    id,
    type,
    tmdbId,
    title: String(raw.title || "").trim() || "Untitled",
    poster: String(raw.poster || ""),
    image: String(raw.image || raw.poster || ""),
    updatedAt,
    t,
    duration,
  };
  if (type === "show") {
    out.season = Math.max(1, Math.floor(Number(raw.season) || 1));
    out.episode = Math.max(1, Math.floor(Number(raw.episode) || 1));
    if (raw.episodeTitle) out.episodeTitle = String(raw.episodeTitle);
  }
  if (typeof raw.paused === "boolean") out.paused = raw.paused;
  if (raw.playUrl != null) out.playUrl = String(raw.playUrl);
  if (raw.server != null) out.server = String(raw.server);
  if (raw.quality != null) out.quality = String(raw.quality);
  return out;
}

function pruneAndSort(entries: ContinueWatchEntry[]): ContinueWatchEntry[] {
  const byId = new Map<string, ContinueWatchEntry>();
  for (const raw of entries) {
    const e = normalizeEntry(raw);
    if (!e) continue;
    const prev = byId.get(e.id);
    if (!prev || e.updatedAt >= prev.updatedAt) byId.set(e.id, e);
  }
  return [...byId.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_ITEMS);
}

async function readRaw(userId: string): Promise<ContinueWatchEntry[]> {
  try {
    const raw = await fs.readFile(fileForUser(userId), "utf8");
    const parsed = JSON.parse(raw) as ContinueFile;
    if (!Array.isArray(parsed.entries)) return [];
    return pruneAndSort(parsed.entries);
  } catch {
    return [];
  }
}

async function writeRaw(userId: string, entries: ContinueWatchEntry[]) {
  await storeDir();
  const cleaned = pruneAndSort(entries);
  await fs.writeFile(
    fileForUser(userId),
    `${JSON.stringify({ entries: cleaned }, null, 2)}\n`,
    "utf8",
  );
  return cleaned;
}

export async function getContinueWatching(
  userId: string,
): Promise<ContinueWatchEntry[]> {
  return readRaw(userId);
}

/** Replace list (used after client merge). */
export async function putContinueWatching(
  userId: string,
  entries: unknown[],
): Promise<ContinueWatchEntry[]> {
  return withLock(async () => {
    const list = Array.isArray(entries) ? entries : [];
    return writeRaw(userId, list as ContinueWatchEntry[]);
  });
}

/** Upsert one entry — keeps newer updatedAt. */
export async function upsertContinueWatchingEntry(
  userId: string,
  entry: unknown,
): Promise<ContinueWatchEntry[]> {
  return withLock(async () => {
    const next = normalizeEntry(entry as ContinueWatchEntry);
    const current = await readRaw(userId);
    if (!next) {
      // Finished / invalid → drop matching id if present
      const id =
        entry &&
        typeof entry === "object" &&
        typeof (entry as { id?: unknown }).id === "string"
          ? String((entry as { id: string }).id)
          : null;
      if (!id) return current;
      return writeRaw(
        userId,
        current.filter((e) => e.id !== id),
      );
    }
    const rest = current.filter((e) => e.id !== next.id);
    const prev = current.find((e) => e.id === next.id);
    if (prev && prev.updatedAt > next.updatedAt) {
      return writeRaw(userId, current);
    }
    return writeRaw(userId, [next, ...rest]);
  });
}

export async function removeContinueWatchingEntry(
  userId: string,
  id: string,
): Promise<ContinueWatchEntry[]> {
  return withLock(async () => {
    const current = await readRaw(userId);
    return writeRaw(
      userId,
      current.filter((e) => e.id !== id),
    );
  });
}
