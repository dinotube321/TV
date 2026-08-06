import {
  ensureTitle,
  fetchBrowse,
  fetchSearch,
  fetchShelfResolved,
  fetchTitlesByIds,
  loadTitleInfo,
} from "./api";
import type { Episode, Shelf, Title, TrailerClip } from "./types";

export type {
  CastMember,
  Episode,
  TrailerClip,
  Title,
  TitleType,
  Shelf,
  ShelfRule,
  Category,
  CategoryRule,
  SearchIndexEntry,
} from "./types";

export async function getTitles(ids: string[]): Promise<Title[]> {
  return fetchTitlesByIds(ids);
}

export async function getMovies(): Promise<Title[]> {
  const page = await fetchBrowse({ type: "movie", limit: 80 });
  return page.items;
}

export async function getShows(): Promise<Title[]> {
  const page = await fetchBrowse({ type: "show", limit: 80 });
  return page.items;
}

export function looksLikeTmdbId(id: string) {
  return /^(movie|tv)-\d+$/.test(id);
}

/** Recover a YouTube id from stored clip fields / thumbnail URL. */
function withPlayableMeta(clips: TrailerClip[] | undefined): TrailerClip[] | undefined {
  if (!clips?.length) return undefined;
  return clips.map((c) => {
    if (c.youtubeKey) return c;
    const fromThumb = c.image?.match(/ytimg\.com\/vi\/([\w-]{11})\//)?.[1];
    const fromUrl = c.videoUrl?.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1];
    const key = fromThumb || fromUrl;
    if (!key) return c;
    return {
      ...c,
      youtubeKey: key,
      videoUrl: c.videoUrl || `https://www.youtube.com/watch?v=${key}`,
    };
  });
}

function enrichTitle(base: Title): Title {
  const director =
    base.director ??
    base.cast?.find((c) => /director/i.test(c.role))?.name ??
    undefined;

  // Only keep real TMDB-backed clips — never invent fake trailers/bonus.
  const trailers = withPlayableMeta(base.trailers);
  const bonus = withPlayableMeta(base.bonus);

  return {
    ...base,
    cast: base.cast ?? [],
    director,
    trailers,
    bonus,
    regions: base.regions ?? ["United States"],
    ratedNote:
      base.ratedNote ??
      (base.type === "movie" ? `${base.rating} for thematic material.` : undefined),
  };
}

/** Load a title that is already on disk (no import). */
export async function getTitleDetails(id: string): Promise<Title | undefined> {
  const base = await loadTitleInfo(id);
  return base ? enrichTitle(base) : undefined;
}

/** Import from TMDB then return enriched title. */
export async function importAndGetTitle(id: string): Promise<Title> {
  const base = await ensureTitle(id);
  return enrichTitle(base);
}

export async function relatedTitles(title: Title, limit = 8): Promise<Title[]> {
  const page = await fetchBrowse({
    type: title.type,
    limit: limit + 4,
  });
  return page.items.filter((t) => t.id !== title.id).slice(0, limit);
}

export async function searchTitles(query: string): Promise<Title[]> {
  return fetchSearch(query, 40);
}

export async function resolveShelfItems(shelf: Shelf): Promise<Title[]> {
  if (shelf.items?.length) return shelf.items;
  if (shelf.rule) {
    const resolved = await fetchShelfResolved(shelf.id);
    return resolved.items;
  }
  return fetchTitlesByIds(shelf.titleIds ?? []);
}

export function buildTypeShelves(
  titles: Title[],
  kind: "movie" | "show",
): Shelf[] {
  const label = kind === "movie" ? "Movies" : "TV Shows";
  return [
    {
      id: `${kind}-featured`,
      title: `Featured ${label}`,
      titleIds: titles.slice(0, 12).map((t) => t.id),
      items: titles.slice(0, 12),
      variant: "top10",
    },
    {
      id: `${kind}-all`,
      title: `All ${label}`,
      titleIds: titles.map((t) => t.id),
      items: titles,
    },
  ];
}

export function seasonsForTitle(title: Title): number[] {
  const eps = title.episodes ?? [];
  if (!eps.length && title.seasons) {
    return Array.from({ length: title.seasons }, (_, i) => i + 1);
  }
  return [...new Set(eps.map((e: Episode) => e.season ?? 1))].sort((a, b) => a - b);
}

export function starringLine(title: Title, limit = 3): string {
  const actors = (title.cast ?? []).filter((c) => !/director|producer/i.test(c.role));
  return actors
    .slice(0, limit)
    .map((c) => c.name)
    .join(", ");
}

/** @deprecated sync helpers removed — use async loaders */
export const titles: Title[] = [];
export const movies: Title[] = [];
export const shows: Title[] = [];
export const heroIds: string[] = [];
export const homeShelves: Shelf[] = [];
export const movieShelves: Shelf[] = [];
export const tvShelves: Shelf[] = [];
