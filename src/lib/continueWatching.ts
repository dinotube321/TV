import type { Title, TitleType } from "../data/types";
import { tmdbIdOf } from "./streamEmbed";
import { getAuthToken } from "./auth";

const INDEX_KEY = "pulse.continue.v1";
const PLAYBACK_PREFIX = "pulse.playback.v1:";
const MAX_ITEMS = 24;
const PLAYBACK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type ContinueEntry = {
  id: string;
  type: TitleType;
  tmdbId: number;
  title: string;
  poster: string;
  /** 16:9 card art — backdrop preferred */
  image: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  updatedAt: number;
};

export type ContinueItem = ContinueEntry & {
  currentTime: number;
  duration: number;
  /** 0–1 progress through the title/episode */
  progress: number;
  watchPath: string;
};

/** Full row used for server sync (index + playback). */
export type ContinueSyncEntry = ContinueEntry & {
  t: number;
  duration: number;
  paused?: boolean;
  playUrl?: string | null;
  server?: string | null;
  quality?: string | null;
};

function readIndex(): ContinueEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ContinueEntry =>
        !!e &&
        typeof e.id === "string" &&
        typeof e.title === "string" &&
        (e.type === "movie" || e.type === "show") &&
        typeof e.tmdbId === "number",
    );
  } catch {
    return [];
  }
}

function writeIndex(entries: ContinueEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(entries.slice(0, MAX_ITEMS)));
    window.dispatchEvent(new CustomEvent("pulse:continue"));
  } catch {
    /* quota / private mode */
  }
}

function playbackKey(entry: Pick<ContinueEntry, "type" | "tmdbId" | "season" | "episode">) {
  if (entry.type === "show") {
    const s = entry.season || 1;
    const e = entry.episode || 1;
    return `${PLAYBACK_PREFIX}tv:${entry.tmdbId}:${s}:${e}`;
  }
  return `${PLAYBACK_PREFIX}movie:${entry.tmdbId}`;
}

function readPlayback(key: string): {
  t: number;
  duration: number;
  savedAt: number;
  paused?: boolean;
  playUrl?: string | null;
  server?: string | null;
  quality?: string | null;
} | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt) return null;
    if (Date.now() - Number(parsed.savedAt) > PLAYBACK_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    const t = Number(parsed.t) || 0;
    if (t < 2) return null;
    const duration = Number(parsed.duration) || 0;
    if (duration > 30 && t >= duration - 12) {
      window.localStorage.removeItem(key);
      return null;
    }
    return {
      t,
      duration,
      savedAt: Number(parsed.savedAt) || 0,
      paused: !!parsed.paused,
      playUrl: parsed.playUrl || null,
      server: parsed.server || null,
      quality: parsed.quality || null,
    };
  } catch {
    return null;
  }
}

function writePlayback(
  entry: Pick<ContinueEntry, "type" | "tmdbId" | "season" | "episode">,
  pb: {
    t: number;
    duration: number;
    savedAt: number;
    paused?: boolean;
    playUrl?: string | null;
    server?: string | null;
    quality?: string | null;
  },
) {
  try {
    window.localStorage.setItem(
      playbackKey(entry),
      JSON.stringify({
        savedAt: pb.savedAt,
        t: pb.t,
        duration: pb.duration > 0 ? pb.duration : null,
        paused: !!pb.paused,
        playUrl: pb.playUrl || null,
        server: pb.server || null,
        quality: pb.quality || null,
      }),
    );
  } catch {
    /* ignore */
  }
}

export function continueWatchPath(entry: ContinueEntry): string {
  if (entry.type === "show" && entry.season && entry.episode) {
    return `/watch/${entry.id}?s=${entry.season}&e=${entry.episode}`;
  }
  return `/watch/${entry.id}`;
}

/** Call when opening the player so the homepage can show this title. */
export function upsertContinueWatching(
  title: Title,
  opts: { season?: number; episode?: number; episodeTitle?: string } = {},
) {
  const tmdbId = tmdbIdOf(title);
  if (!tmdbId) return;

  const next: ContinueEntry = {
    id: title.id,
    type: title.type,
    tmdbId,
    title: title.title,
    poster: title.poster || "",
    image: title.backdrop || title.poster || "",
    season: title.type === "show" ? Math.max(1, opts.season ?? 1) : undefined,
    episode: title.type === "show" ? Math.max(1, opts.episode ?? 1) : undefined,
    episodeTitle: opts.episodeTitle,
    updatedAt: Date.now(),
  };

  const prev = readIndex().filter((e) => e.id !== next.id);
  writeIndex([next, ...prev]);
}

export function removeContinueWatching(id: string) {
  writeIndex(readIndex().filter((e) => e.id !== id));
  const token = getAuthToken();
  if (token) {
    void fetch(`/api/auth/continue-watching/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
}

function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

/** Apple-style short duration on the chin (e.g. "24m", "1h 12m"). */
export function formatContinueDuration(item: ContinueItem): string {
  if (item.duration > item.currentTime + 5) {
    return formatRemaining(item.duration - item.currentTime);
  }
  if (item.duration > 0) {
    return formatRemaining(item.duration);
  }
  if (item.currentTime > 0) {
    return formatRemaining(item.currentTime);
  }
  return "–";
}

/** @deprecated use formatContinueDuration */
export function formatContinueMeta(item: ContinueItem): string {
  const bits: string[] = [];
  if (item.type === "show" && item.season && item.episode) {
    bits.push(`S${item.season} · E${item.episode}`);
  }
  bits.push(formatContinueDuration(item));
  return bits.join(" · ");
}

/** Local rows that have real playback progress. */
export function collectLocalSyncEntries(): ContinueSyncEntry[] {
  if (typeof window === "undefined") return [];
  const out: ContinueSyncEntry[] = [];
  for (const entry of readIndex()) {
    const pb = readPlayback(playbackKey(entry));
    if (!pb) continue;
    out.push({
      ...entry,
      updatedAt: Math.max(entry.updatedAt, pb.savedAt),
      t: pb.t,
      duration: pb.duration,
      paused: pb.paused,
      playUrl: pb.playUrl,
      server: pb.server,
      quality: pb.quality,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ITEMS);
}

/** Apply a synced entry into local index + playback keys. */
function applySyncEntry(entry: ContinueSyncEntry) {
  const meta: ContinueEntry = {
    id: entry.id,
    type: entry.type,
    tmdbId: entry.tmdbId,
    title: entry.title,
    poster: entry.poster || "",
    image: entry.image || entry.poster || "",
    season: entry.season,
    episode: entry.episode,
    episodeTitle: entry.episodeTitle,
    updatedAt: entry.updatedAt,
  };
  writePlayback(meta, {
    t: entry.t,
    duration: entry.duration,
    savedAt: entry.updatedAt,
    paused: entry.paused,
    playUrl: entry.playUrl,
    server: entry.server,
    quality: entry.quality,
  });
  return meta;
}

function mergeSyncLists(
  local: ContinueSyncEntry[],
  remote: ContinueSyncEntry[],
): ContinueSyncEntry[] {
  const byId = new Map<string, ContinueSyncEntry>();
  for (const e of [...remote, ...local]) {
    if (!e?.id || !(e.t >= 2)) continue;
    const prev = byId.get(e.id);
    if (!prev || e.updatedAt >= prev.updatedAt) byId.set(e.id, e);
  }
  return [...byId.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_ITEMS);
}

function applyMergedToLocal(merged: ContinueSyncEntry[]) {
  const index: ContinueEntry[] = [];
  for (const e of merged) {
    index.push(applySyncEntry(e));
  }
  writeIndex(index);
}

async function authFetch(path: string, init: RequestInit = {}) {
  const token = getAuthToken();
  if (!token) return null;
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`continue-watching ${res.status}`);
  return res.json() as Promise<{ entries: ContinueSyncEntry[] }>;
}

/**
 * Pull server list, merge with this device, write local, push merged up.
 * Call on login and when the continue shelf becomes visible.
 */
export async function syncContinueWatchingWithServer(): Promise<ContinueItem[]> {
  if (typeof window === "undefined") return loadContinueWatching();
  const token = getAuthToken();
  if (!token) return loadContinueWatching();

  try {
    const data = await authFetch("/api/auth/continue-watching");
    if (!data) return loadContinueWatching();

    const remote = Array.isArray(data.entries)
      ? (data.entries as ContinueSyncEntry[])
      : [];
    const local = collectLocalSyncEntries();
    const merged = mergeSyncLists(local, remote);
    applyMergedToLocal(merged);

    // Push union so other devices get this browser’s progress too
    await authFetch("/api/auth/continue-watching", {
      method: "PUT",
      body: JSON.stringify({ entries: merged }),
    });

    return loadContinueWatching();
  } catch {
    return loadContinueWatching();
  }
}

/** Push one progress row (from player/embed) when signed in. */
export async function pushContinueProgress(entry: ContinueSyncEntry) {
  const token = getAuthToken();
  if (!token || !entry?.id || entry.t < 2) return;
  try {
    // Keep local index metadata fresh
    const prev = readIndex().filter((e) => e.id !== entry.id);
    writeIndex([
      {
        id: entry.id,
        type: entry.type,
        tmdbId: entry.tmdbId,
        title: entry.title,
        poster: entry.poster || "",
        image: entry.image || entry.poster || "",
        season: entry.season,
        episode: entry.episode,
        episodeTitle: entry.episodeTitle,
        updatedAt: entry.updatedAt,
      },
      ...prev,
    ]);
    writePlayback(entry, {
      t: entry.t,
      duration: entry.duration,
      savedAt: entry.updatedAt,
      paused: entry.paused,
      playUrl: entry.playUrl,
      server: entry.server,
      quality: entry.quality,
    });

    await authFetch("/api/auth/continue-watching", {
      method: "POST",
      body: JSON.stringify(entry),
    });
  } catch {
    /* offline / private */
  }
}

/** Entries with real playback progress, newest first. */
export function loadContinueWatching(): ContinueItem[] {
  if (typeof window === "undefined") return [];
  const index = readIndex();
  const items: ContinueItem[] = [];
  const keep: ContinueEntry[] = [];

  for (const entry of index) {
    const pb = readPlayback(playbackKey(entry));
    if (!pb) continue;
    keep.push(entry);
    const duration = pb.duration > 0 ? pb.duration : 0;
    const progress =
      duration > 0 ? Math.min(0.97, Math.max(0.02, pb.t / duration)) : 0.08;
    items.push({
      ...entry,
      currentTime: pb.t,
      duration,
      progress,
      watchPath: continueWatchPath(entry),
      updatedAt: Math.max(entry.updatedAt, pb.savedAt),
    });
  }

  if (keep.length !== index.length) writeIndex(keep);

  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function subscribeContinueWatching(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener("pulse:continue", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("pulse:continue", handler);
    window.removeEventListener("storage", handler);
  };
}
