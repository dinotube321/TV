import type { Title } from "../data/types";

/** Resolve numeric TMDB id from a local catalog title. */
export function tmdbIdOf(title: Title): number | null {
  if (title.tmdbId && title.tmdbId > 0) return title.tmdbId;
  const m = /^(?:movie|tv)-(\d+)$/.exec(title.id);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Same-origin embed path for the hotlinking player
 * (proxied to the stream server in dev).
 */
export function streamEmbedPath(
  title: Title,
  opts: { season?: number; episode?: number } = {},
): string | null {
  const id = tmdbIdOf(title);
  if (!id) return null;

  if (title.type === "movie") {
    return `/embed/movies/${id}?v=7`;
  }

  const season = Math.max(1, opts.season ?? 1);
  const episode = Math.max(1, opts.episode ?? 1);
  return `/embed/shows/${id}/${season}/${episode}?v=7`;
}
