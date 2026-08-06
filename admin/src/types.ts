export interface CatalogEntry {
  id: string;
  type: "movie" | "show";
  title: string;
  year: number;
  rating: string;
  genres: string[];
  poster: string;
  backdrop: string;
  tmdbId?: number;
  importedAt?: string;
  duration?: string;
  seasons?: number;
  badge?: string;
  trailerUrl?: string;
}

export interface HeroEntry {
  id: string;
  trailerUrl?: string;
  item?: CatalogEntry | null;
}

export interface ShelfRule {
  type?: "movie" | "show";
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
  mode?: "manual" | "rule";
  previewCount?: number;
  preview?: CatalogEntry[];
}

export interface CategoryRule {
  type?: "movie" | "show";
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
  mode?: "manual" | "rule";
  previewCount?: number;
  preview?: CatalogEntry[];
}

export interface PageResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Dashboard {
  counts: {
    titles: number;
    movies: number;
    shows: number;
    searchEntries: number;
    heroes: number;
    shelves: number;
    openRequests?: number;
  };
  tmdbConfigured: boolean;
  recent: CatalogEntry[];
}
