import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

export type MediaRequestStatus = "open" | "done" | "dismissed";

export type MediaRequest = {
  id: string;
  mediaType: "movie" | "tv";
  tmdbId: string;
  title: string;
  year?: string;
  seasonId?: string;
  episodeId?: string;
  note?: string;
  status: MediaRequestStatus;
  createdAt: string;
  updatedAt: string;
};

interface StoreFile {
  requests: MediaRequest[];
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

async function filePath() {
  await fs.mkdir(config.dataDir, { recursive: true });
  return path.join(config.dataDir, "media-requests.json");
}

async function readFile(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(await filePath(), "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    if (!parsed || !Array.isArray(parsed.requests)) return { requests: [] };
    return parsed;
  } catch {
    return { requests: [] };
  }
}

async function writeFile(data: StoreFile) {
  const p = await filePath();
  const tmp = `${p}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tmp, p);
}

function catalogKey(r: {
  mediaType: string;
  tmdbId: string;
  seasonId?: string;
  episodeId?: string;
}) {
  if (r.mediaType === "tv") {
    return `tv:${r.tmdbId}:${r.seasonId || 1}:${r.episodeId || 1}`;
  }
  return `movie:${r.tmdbId}`;
}

export async function listMediaRequests(): Promise<MediaRequest[]> {
  const data = await readFile();
  return [...data.requests].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function createMediaRequest(input: {
  mediaType?: string;
  tmdbId?: string;
  title?: string;
  year?: string;
  seasonId?: string;
  episodeId?: string;
  note?: string;
}): Promise<MediaRequest> {
  const tmdbId = String(input.tmdbId || "").trim();
  if (!tmdbId || !/^\d+$/.test(tmdbId)) {
    throw new Error("tmdbId must be numeric");
  }
  const rawType = String(input.mediaType || "movie").toLowerCase();
  const mediaType: "movie" | "tv" =
    rawType === "tv" || rawType === "show" || rawType === "anime"
      ? "tv"
      : "movie";
  const title = String(input.title || "").trim() || `TMDB ${tmdbId}`;
  const seasonId =
    mediaType === "tv" ? String(input.seasonId || "1") : undefined;
  const episodeId =
    mediaType === "tv" ? String(input.episodeId || "1") : undefined;
  const note = String(input.note || "").trim().slice(0, 500) || undefined;
  const year = String(input.year || "").trim().slice(0, 12) || undefined;

  return withLock(async () => {
    const data = await readFile();
    const key = catalogKey({ mediaType, tmdbId, seasonId, episodeId });
    const existing = data.requests.find(
      (r) =>
        r.status === "open" &&
        catalogKey(r) === key,
    );
    if (existing) {
      existing.updatedAt = new Date().toISOString();
      if (note) existing.note = note;
      if (title) existing.title = title;
      await writeFile(data);
      return existing;
    }
    const now = new Date().toISOString();
    const entry: MediaRequest = {
      id: crypto.randomUUID(),
      mediaType,
      tmdbId,
      title,
      year,
      seasonId,
      episodeId,
      note,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    data.requests.unshift(entry);
    // Cap history
    if (data.requests.length > 500) {
      data.requests = data.requests.slice(0, 500);
    }
    await writeFile(data);
    return entry;
  });
}

export async function updateMediaRequest(
  id: string,
  patch: { status?: MediaRequestStatus },
): Promise<MediaRequest | null> {
  return withLock(async () => {
    const data = await readFile();
    const entry = data.requests.find((r) => r.id === id);
    if (!entry) return null;
    if (patch.status) entry.status = patch.status;
    entry.updatedAt = new Date().toISOString();
    await writeFile(data);
    return entry;
  });
}

export async function deleteMediaRequest(id: string): Promise<boolean> {
  return withLock(async () => {
    const data = await readFile();
    const before = data.requests.length;
    data.requests = data.requests.filter((r) => r.id !== id);
    if (data.requests.length === before) return false;
    await writeFile(data);
    return true;
  });
}

export async function openRequestCount(): Promise<number> {
  const data = await readFile();
  return data.requests.filter((r) => r.status === "open").length;
}
