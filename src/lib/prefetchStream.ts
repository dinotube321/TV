import type { Title } from "../data/types";
import { streamEmbedPath, tmdbIdOf } from "./streamEmbed";

/** Match the embed player's extract URL (full + backup) so TV doesn't warm Classic-only. */
export function extractApiPath(
  title: Title,
  opts: { season?: number; episode?: number } = {},
): string | null {
  const id = tmdbIdOf(title);
  if (!id) return null;
  if (title.type === "movie") {
    return `/api/embed/movies/${id}?full=1&backup=1`;
  }
  const s = Math.max(1, opts.season ?? title.episodes?.[0]?.season ?? 1);
  const e = Math.max(1, opts.episode ?? title.episodes?.[0]?.number ?? 1);
  return `/api/embed/shows/${id}/${s}/${e}?full=1&backup=1`;
}

export function extractStorageKey(apiPath: string): string {
  return `pulse.extract.v4:${apiPath}`;
}

const warmed = new Set<string>();
const inflight = new Map<string, Promise<void>>();

const STORAGE_TTL_MS = 12 * 60_000;

function writeExtractCache(apiPath: string, data: unknown) {
  try {
    // localStorage (not sessionStorage): same-origin iframes share it; sessionStorage does not
    localStorage.setItem(
      extractStorageKey(apiPath),
      JSON.stringify({ savedAt: Date.now(), data }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function readExtractCache(apiPath: string): unknown | null {
  try {
    const raw = localStorage.getItem(extractStorageKey(apiPath));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: unknown };
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > STORAGE_TTL_MS) {
      localStorage.removeItem(extractStorageKey(apiPath));
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Warm the stream extract cache (server + localStorage) while the user
 * is on the info page so Play can start from a warm result.
 */
export function prefetchStream(
  title: Title,
  opts: { season?: number; episode?: number } = {},
): void {
  const api = extractApiPath(title, opts);
  if (!api) return;
  if (warmed.has(api) || inflight.has(api)) return;

  const run = (async () => {
    try {
      const res = await fetch(api, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok) {
        writeExtractCache(api, data);
        warmed.add(api);
      }
    } catch {
      /* Play will extract normally */
    } finally {
      inflight.delete(api);
    }
  })();

  inflight.set(api, run);

  const embed = streamEmbedPath(title, opts);
  if (embed && typeof document !== "undefined") {
    try {
      const existing = document.head.querySelector(
        `link[data-pulse-prefetch="${embed}"]`,
      );
      if (!existing) {
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = embed;
        link.as = "document";
        link.dataset.pulsePrefetch = embed;
        document.head.appendChild(link);
      }
    } catch {
      /* ignore */
    }
  }
}

export function prefetchStreamForTitle(title: Title): void {
  if (title.type === "show") {
    const ep = title.episodes?.[0];
    prefetchStream(title, {
      season: ep?.season ?? 1,
      episode: ep?.number ?? 1,
    });
    return;
  }
  prefetchStream(title);
}
