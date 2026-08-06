export type TitleType = "movie" | "show";

export interface CastMember {
  name: string;
  role: string;
  image: string;
}

export interface Episode {
  id: string;
  season: number;
  number: number;
  title: string;
  synopsis: string;
  duration: string;
  image: string;
}

export interface TrailerClip {
  id: string;
  title: string;
  duration: string;
  image: string;
  /** YouTube video id when available (TMDB videos). */
  youtubeKey?: string;
  /** Full watch URL when available. */
  videoUrl?: string;
}

export interface Title {
  id: string;
  type: TitleType;
  title: string;
  tagline: string;
  synopsis: string;
  year: number;
  rating: string;
  genres: string[];
  duration?: string;
  seasons?: number;
  badge?: string;
  poster: string;
  backdrop: string;
  logo?: string;
  trailerUrl?: string;
  director?: string;
  commonSense?: string;
  ratedNote?: string;
  regions?: string[];
  cast: CastMember[];
  episodes?: Episode[];
  trailers?: TrailerClip[];
  bonus?: TrailerClip[];
  tmdbId?: number;
  importedAt?: string;
  popularity?: number;
  voteAverage?: number;
  voteCount?: number;
}

/** Slim catalog row — kept small for 100k+ scale (no synopsis). */
export interface CatalogEntry {
  id: string;
  type: TitleType;
  title: string;
  year: number;
  rating: string;
  genres: string[];
  poster: string;
  backdrop: string;
  duration?: string;
  seasons?: number;
  badge?: string;
  tmdbId?: number;
  importedAt?: string;
  popularity?: number;
  voteAverage?: number;
  voteCount?: number;
}

export type ShelfSort = "recent" | "title" | "year" | "popularity" | "rating";

export type CuratedListKey =
  | "trending_movies_week"
  | "trending_tv_week"
  | "popular_movies"
  | "popular_tv"
  | "top_rated_movies"
  | "top_rated_tv";

export interface ShelfRule {
  type?: TitleType;
  genre?: string;
  limit?: number;
  sort?: ShelfSort;
  /** Resolve from content/curated/{list}.json (ordered TMDB rankings). */
  list?: CuratedListKey;
}

export interface Shelf {
  id: string;
  title: string;
  variant?: "default" | "top10" | "wide";
  /** Curated IDs — keep small (heroes, top picks). Prefer `rule` for large sets. */
  titleIds?: string[];
  /** Dynamic filter resolved at read time — no ID list explosion. */
  rule?: ShelfRule;
}

/** Homepage hero slide — optional YouTube trailer for background. */
export interface HeroEntry {
  id: string;
  trailerUrl?: string;
}

/** Browse-by-category tile (Apple TV style horizontal cards). */
export interface CategoryRule {
  type?: TitleType;
  /** Match if any title genre contains any of these (case-insensitive). */
  genres?: string[];
  limit?: number;
  sort?: ShelfSort;
}

export interface Category {
  id: string;
  title: string;
  /** Public URL under /content/categories/… */
  image: string;
  /** Curated picks — keep small. Prefer `rule` for large sets. */
  titleIds?: string[];
  rule?: CategoryRule;
}

export interface CuratedList {
  updatedAt: string;
  ids: string[];
}

export interface SearchIndexEntry {
  id: string;
  type: TitleType;
  title: string;
  year: number;
  genres: string[];
  cast: string[];
  /** Lowercase searchable blob (title + genres + cast + year). Synopsis omitted for size. */
  tokens: string;
  poster: string;
}

export interface CatalogMeta {
  version: number;
  titleCount: number;
  movieCount: number;
  showCount: number;
  updatedAt: string;
}

export interface PageQuery {
  q?: string;
  type?: TitleType | "";
  page?: number;
  limit?: number;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
