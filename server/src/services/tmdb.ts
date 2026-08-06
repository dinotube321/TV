import { config, tmdbConfigured } from "../lib/config.js";

const BASE = "https://api.themoviedb.org/3";
export const IMG = "https://image.tmdb.org/t/p";

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/json",
  };
  if (config.tmdbReadToken) {
    h.Authorization = `Bearer ${config.tmdbReadToken}`;
  }
  return h;
}

function withKey(url: string) {
  if (config.tmdbReadToken) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}api_key=${encodeURIComponent(config.tmdbApiKey)}`;
}

export async function tmdbGet<T>(path: string): Promise<T> {
  if (!tmdbConfigured()) {
    throw new Error("TMDB is not configured. Set TMDB_API_KEY or TMDB_READ_TOKEN in .env");
  }
  const url = withKey(`${BASE}${path}`);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: headers() });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`TMDB ${res.status}: ${text.slice(0, 200)}`);
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function tmdbImage(path: string | null | undefined, size = "original") {
  if (!path) return "";
  return `${IMG}/${size}${path}`;
}

export interface TmdbMovie {
  id: number;
  title: string;
  overview: string;
  tagline: string;
  release_date: string;
  runtime: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { id: number; name: string }[];
  origin_country?: string[];
  production_countries?: { iso_3166_1: string; name: string }[];
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
}

export interface TmdbTv {
  id: number;
  name: string;
  overview: string;
  tagline: string;
  first_air_date: string;
  number_of_seasons: number;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { id: number; name: string }[];
  origin_country?: string[];
  episode_run_time?: number[];
  created_by?: { name: string }[];
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
}

export interface TmdbCredits {
  cast: {
    name: string;
    character: string;
    profile_path: string | null;
    order: number;
  }[];
  crew: {
    name: string;
    job: string;
    department: string;
    profile_path: string | null;
  }[];
}

export interface TmdbVideos {
  results: {
    id: string;
    key: string;
    name: string;
    site: string;
    type: string;
    official: boolean;
  }[];
}

export interface TmdbReleaseDates {
  results: {
    iso_3166_1: string;
    release_dates: { certification: string; type: number }[];
  }[];
}

export interface TmdbContentRatings {
  results: { iso_3166_1: string; rating: string }[];
}

export interface TmdbSeason {
  season_number: number;
  episodes: {
    id: number;
    episode_number: number;
    name: string;
    overview: string;
    runtime: number | null;
    still_path: string | null;
  }[];
}

export interface TmdbImageAsset {
  file_path: string;
  iso_639_1: string | null;
  width: number;
  height: number;
  vote_average: number;
  vote_count: number;
}

export interface TmdbImages {
  logos: TmdbImageAsset[];
  backdrops: TmdbImageAsset[];
  posters: TmdbImageAsset[];
}

/** Prefer English (or language-agnostic) logos — typical Apple TV title treatment. */
export function pickBestLogoPath(logos: TmdbImageAsset[]): string | null {
  if (!logos.length) return null;
  const ranked = logos
    .map((logo) => {
      let score = (logo.vote_average || 0) * 10 + Math.min(logo.width / 200, 20);
      if (logo.iso_639_1 === "en") score += 1000;
      else if (logo.iso_639_1 == null) score += 400;
      // Prefer wider wordmarks over square icons
      const ratio = logo.width / Math.max(logo.height, 1);
      if (ratio >= 1.6) score += 80;
      else if (ratio >= 1.2) score += 40;
      return { logo, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.logo.file_path ?? null;
}

export async function fetchImages(tmdbId: number, type: "movie" | "tv") {
  return tmdbGet<TmdbImages>(
    `/${type}/${tmdbId}/images?include_image_language=en,null`,
  );
}

export async function fetchMovieBundle(tmdbId: number) {
  const details = await tmdbGet<TmdbMovie>(`/movie/${tmdbId}?language=en-US`);
  const credits = await tmdbGet<TmdbCredits>(`/movie/${tmdbId}/credits?language=en-US`);
  const videos = await tmdbGet<TmdbVideos>(`/movie/${tmdbId}/videos?language=en-US`);
  const releases = await tmdbGet<TmdbReleaseDates>(`/movie/${tmdbId}/release_dates`);
  const images = await fetchImages(tmdbId, "movie");
  return { details, credits, videos, releases, images };
}

export async function fetchTvBundle(tmdbId: number) {
  const details = await tmdbGet<TmdbTv>(`/tv/${tmdbId}?language=en-US`);
  const credits = await tmdbGet<TmdbCredits>(`/tv/${tmdbId}/credits?language=en-US`);
  const videos = await tmdbGet<TmdbVideos>(`/tv/${tmdbId}/videos?language=en-US`);
  const ratings = await tmdbGet<TmdbContentRatings>(`/tv/${tmdbId}/content_ratings`);
  const images = await fetchImages(tmdbId, "tv");

  const seasonCount = Math.min(details.number_of_seasons || 1, 5);
  const seasons: TmdbSeason[] = [];
  for (let s = 1; s <= seasonCount; s++) {
    try {
      const season = await tmdbGet<TmdbSeason>(
        `/tv/${tmdbId}/season/${s}?language=en-US`,
      );
      seasons.push(season);
    } catch {
      /* skip missing seasons */
    }
  }

  return { details, credits, videos, ratings, seasons, images };
}

export async function tmdbPreview(tmdbId: number, type: "movie" | "tv") {
  if (type === "movie") {
    const m = await tmdbGet<TmdbMovie>(`/movie/${tmdbId}?language=en-US`);
    return {
      tmdbId: m.id,
      type: "movie" as const,
      title: m.title,
      year: Number((m.release_date || "").slice(0, 4)) || 0,
      synopsis: m.overview,
      poster: tmdbImage(m.poster_path, "w342"),
      backdrop: tmdbImage(m.backdrop_path, "w780"),
    };
  }
  const t = await tmdbGet<TmdbTv>(`/tv/${tmdbId}?language=en-US`);
  return {
    tmdbId: t.id,
    type: "tv" as const,
    title: t.name,
    year: Number((t.first_air_date || "").slice(0, 4)) || 0,
    synopsis: t.overview,
    poster: tmdbImage(t.poster_path, "w342"),
    backdrop: tmdbImage(t.backdrop_path, "w780"),
  };
}

export interface TmdbSearchHit {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview?: string;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
}

/**
 * Live TMDB typeahead — movies + TV.
 * Uses /search/movie + /search/tv (more reliable than /search/multi).
 */
export async function tmdbSearchMulti(query: string, page = 1) {
  const q = query.trim();
  if (!q) return [] as TmdbSearchHit[];

  const enc = encodeURIComponent(q);
  const [movies, shows] = await Promise.all([
    tmdbGet<{ results: TmdbSearchHit[] }>(
      `/search/movie?query=${enc}&include_adult=false&language=en-US&page=${page}`,
    ).catch(() => ({ results: [] as TmdbSearchHit[] })),
    tmdbGet<{ results: TmdbSearchHit[] }>(
      `/search/tv?query=${enc}&include_adult=false&language=en-US&page=${page}`,
    ).catch(() => ({ results: [] as TmdbSearchHit[] })),
  ]);

  const hits: TmdbSearchHit[] = [
    ...(movies.results || []).map((r) => ({ ...r, media_type: "movie" as const })),
    ...(shows.results || []).map((r) => ({
      ...r,
      media_type: "tv" as const,
      title: r.name || r.title,
    })),
  ];

  // Prefer movies slightly, then keep TMDB order within each list
  return hits;
}

/** Paginated discover lists for bulk seeding. */
export async function tmdbDiscoverPage(
  type: "movie" | "tv",
  opts: {
    page?: number;
    sort?: string;
    withGenres?: string;
    primaryReleaseYear?: number;
  } = {},
) {
  const page = opts.page ?? 1;
  const sort =
    opts.sort ||
    (type === "movie" ? "popularity.desc" : "popularity.desc");
  const params = new URLSearchParams({
    language: "en-US",
    include_adult: "false",
    sort_by: sort,
    page: String(page),
  });
  if (opts.withGenres) params.set("with_genres", opts.withGenres);
  if (opts.primaryReleaseYear && type === "movie") {
    params.set("primary_release_year", String(opts.primaryReleaseYear));
  }
  const path =
    type === "movie"
      ? `/discover/movie?${params}`
      : `/discover/tv?${params}`;
  const data = await tmdbGet<{
    results: { id: number; title?: string; name?: string }[];
    total_pages: number;
  }>(path);
  return data;
}

export interface TmdbListRow {
  id: number;
  title?: string;
  name?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
}

async function fetchListPages(
  pathForPage: (page: number) => string,
  maxPages: number,
) {
  const rows: TmdbListRow[] = [];
  const seen = new Set<number>();
  for (let page = 1; page <= maxPages; page++) {
    const data = await tmdbGet<{ results: TmdbListRow[] }>(pathForPage(page));
    for (const row of data.results || []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}

/** Trending / popular / top-rated list fetchers for curated shelves. */
export async function tmdbTrending(
  type: "movie" | "tv",
  window: "day" | "week" = "week",
  maxPages = 2,
) {
  return fetchListPages(
    (page) => `/trending/${type}/${window}?language=en-US&page=${page}`,
    maxPages,
  );
}

export async function tmdbPopular(type: "movie" | "tv", maxPages = 2) {
  return fetchListPages(
    (page) => `/${type}/popular?language=en-US&page=${page}`,
    maxPages,
  );
}

export async function tmdbTopRated(type: "movie" | "tv", maxPages = 2) {
  return fetchListPages(
    (page) => `/${type}/top_rated?language=en-US&page=${page}`,
    maxPages,
  );
}
