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
  /** True when result is from live TMDB and not yet saved locally. */
  pending?: boolean;
  popularity?: number;
  voteAverage?: number;
  voteCount?: number;
}

export interface ShelfRule {
  type?: TitleType;
  genre?: string;
  limit?: number;
  sort?: "recent" | "title" | "year" | "popularity" | "rating";
  list?:
    | "trending_movies_week"
    | "trending_tv_week"
    | "popular_movies"
    | "popular_tv"
    | "top_rated_movies"
    | "top_rated_tv";
}

export interface Shelf {
  id: string;
  title: string;
  titleIds?: string[];
  rule?: ShelfRule;
  variant?: "default" | "top10" | "wide";
  items?: Title[];
}

export interface CategoryRule {
  type?: TitleType;
  genres?: string[];
  limit?: number;
  sort?: "recent" | "title" | "year" | "popularity" | "rating";
}

export interface Category {
  id: string;
  title: string;
  image: string;
  titleIds?: string[];
  rule?: CategoryRule;
}

export interface SearchIndexEntry {
  id: string;
  type: TitleType;
  title: string;
  year: number;
  genres: string[];
  cast: string[];
  tokens: string;
  poster: string;
}
