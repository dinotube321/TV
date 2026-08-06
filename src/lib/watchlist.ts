import type { Title, TitleType } from "../data/types";
import { getGuestId } from "./guestId";
import { getStoredUser } from "./auth";

export interface WatchlistEntry {
  id: string;
  type: TitleType;
  title: string;
  poster: string;
  year?: number;
  addedAt: number;
}

const STORAGE_PREFIX = "pulse.watchlist.";

function storageKey(): string {
  const user = getStoredUser();
  if (user?.id) return `${STORAGE_PREFIX}user.${user.id}`;
  return `${STORAGE_PREFIX}${getGuestId()}`;
}

function guestKey(): string {
  return `${STORAGE_PREFIX}${getGuestId()}`;
}

function readRawFor(key: string): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is WatchlistEntry =>
        e &&
        typeof e.id === "string" &&
        typeof e.title === "string" &&
        (e.type === "movie" || e.type === "show"),
    );
  } catch {
    return [];
  }
}

function readRaw(): WatchlistEntry[] {
  return readRawFor(storageKey());
}

function writeRaw(entries: WatchlistEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(entries));
    window.dispatchEvent(
      new CustomEvent("pulse:watchlist", {
        detail: { ids: entries.map((e) => e.id) },
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

/** After login, fold guest watchlist into the signed-in user’s list. */
export function mergeGuestWatchlistIntoUser(userId: string) {
  if (typeof window === "undefined") return;
  const userKey = `${STORAGE_PREFIX}user.${userId}`;
  const guest = readRawFor(guestKey());
  if (!guest.length) return;
  const existing = readRawFor(userKey);
  const byId = new Map<string, WatchlistEntry>();
  for (const e of existing) byId.set(e.id, e);
  for (const e of guest) {
    if (!byId.has(e.id)) byId.set(e.id, e);
  }
  const merged = [...byId.values()].sort((a, b) => b.addedAt - a.addedAt);
  try {
    window.localStorage.setItem(userKey, JSON.stringify(merged));
    window.dispatchEvent(
      new CustomEvent("pulse:watchlist", {
        detail: { ids: merged.map((e) => e.id) },
      }),
    );
  } catch {
    /* ignore */
  }
}

export function loadWatchlist(): WatchlistEntry[] {
  return readRaw().sort((a, b) => b.addedAt - a.addedAt);
}

export function watchlistIds(): Set<string> {
  return new Set(readRaw().map((e) => e.id));
}

export function isInWatchlist(titleId: string): boolean {
  return readRaw().some((e) => e.id === titleId);
}

export function toWatchlistEntry(title: Title): WatchlistEntry {
  return {
    id: title.id,
    type: title.type,
    title: title.title,
    poster: title.poster,
    year: title.year,
    addedAt: Date.now(),
  };
}

/** Add (or bump) a title. Returns the new list. */
export function addToWatchlist(title: Title): WatchlistEntry[] {
  const list = readRaw().filter((e) => e.id !== title.id);
  list.unshift(toWatchlistEntry(title));
  writeRaw(list);
  return list;
}

/** Remove by id. Returns the new list. */
export function removeFromWatchlist(titleId: string): WatchlistEntry[] {
  const list = readRaw().filter((e) => e.id !== titleId);
  writeRaw(list);
  return list;
}

/** Toggle membership. Returns whether the title is now on the list. */
export function toggleWatchlist(title: Title): boolean {
  if (isInWatchlist(title.id)) {
    removeFromWatchlist(title.id);
    return false;
  }
  addToWatchlist(title);
  return true;
}
