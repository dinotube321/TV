import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Title } from "../data/types";
import {
  isInWatchlist,
  loadWatchlist,
  toggleWatchlist as toggleStored,
  type WatchlistEntry,
  watchlistIds,
} from "../lib/watchlist";
import { getGuestId } from "../lib/guestId";

let snapshot = watchlistIds();
const listeners = new Set<() => void>();

function emit() {
  snapshot = watchlistIds();
  listeners.forEach((l) => l());
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return snapshot;
}

// Keep store in sync with storage events (other tabs) + our custom event
if (typeof window !== "undefined") {
  window.addEventListener("pulse:watchlist", () => emit());
  window.addEventListener("storage", (e) => {
    if (e.key && e.key.startsWith("pulse.watchlist.")) emit();
  });
}

/** Reactive set of watchlist title ids for the current guest. */
export function useWatchlistIds(): Set<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsInWatchlist(titleId: string): boolean {
  const ids = useWatchlistIds();
  return ids.has(titleId);
}

export function useWatchlist() {
  const ids = useWatchlistIds();
  const [entries, setEntries] = useState<WatchlistEntry[]>(() => loadWatchlist());

  useEffect(() => {
    setEntries(loadWatchlist());
  }, [ids]);

  const toggle = useCallback((title: Title) => {
    return toggleStored(title);
  }, []);

  const has = useCallback((titleId: string) => isInWatchlist(titleId), [ids]);

  return {
    guestId: typeof window !== "undefined" ? getGuestId() : "",
    ids,
    entries,
    has,
    isInWatchlist: (titleId: string) => ids.has(titleId),
    toggle,
  };
}
