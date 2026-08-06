import type { Category, ShelfSort } from "../types.js";
import { readCatalog, readCategories, writeCategories } from "./store.js";

export type GenreCategorySpec = {
  id: string;
  title: string;
  /** TMDB genre names (and aliases) that match this tile. */
  genres: string[];
  /** Preferred tile art under /content/categories/ */
  image?: string;
};

const SORT: ShelfSort = "popularity";
const LIMIT = 48;
const FALLBACK_IMAGE = "/content/categories/drama-series.webp";

/**
 * Canonical browse tiles. Multiple TMDB names can map to one tile
 * (e.g. Science Fiction + Sci-Fi & Fantasy → Sci-Fi).
 * Only CORE browse ids appear in the homepage rail — niches fold into these.
 */
export const GENRE_CATEGORY_SPECS: GenreCategorySpec[] = [
  {
    id: "comedy-series",
    title: "Comedy",
    genres: ["Comedy", "Music", "Reality", "Talk"],
    image: "/content/categories/comedy-series.webp",
  },
  {
    id: "drama-series",
    title: "Drama",
    genres: ["Drama", "History", "Soap"],
    image: "/content/categories/drama-series.webp",
  },
  {
    id: "kids-family",
    title: "Kids & Family",
    genres: ["Family", "Kids", "Animation"],
    image: "/content/categories/kids-family.webp",
  },
  {
    id: "non-fiction",
    title: "Non-Fiction",
    genres: ["Documentary", "News"],
    image: "/content/categories/non-fiction.webp",
  },
  {
    id: "sci-fi",
    title: "Sci-Fi",
    genres: ["Science Fiction", "Sci-Fi", "Sci-Fi & Fantasy", "Fantasy"],
    image: "/content/categories/sci-fi.webp",
  },
  {
    id: "action",
    title: "Action",
    genres: [
      "Action",
      "Action & Adventure",
      "Adventure",
      "War",
      "War & Politics",
      "Western",
    ],
    image: "/content/categories/action.webp",
  },
  {
    id: "thriller",
    title: "Thriller",
    genres: ["Thriller", "Mystery"],
    image: "/content/categories/thriller.webp",
  },
  {
    id: "horror",
    title: "Horror",
    genres: ["Horror"],
    image: "/content/categories/horror.webp",
  },
  {
    id: "romance",
    title: "Romance",
    genres: ["Romance"],
    image: "/content/categories/romance.webp",
  },
  {
    id: "crime",
    title: "Crime",
    genres: ["Crime"],
    image: "/content/categories/crime.webp",
  },
];

/** Obsolete / niche tiles that reused core artwork — drop from browse rail. */
export const OBSOLETE_CATEGORY_IDS = new Set([
  "feature-films",
  "adventure",
  "fantasy",
  "history",
  "music",
  "mystery",
  "news",
  "reality",
  "soap",
  "talk",
  "tv-movie",
  "war",
  "western",
]);

/** Default homepage tiles when content/categories.json is missing. */
export function defaultGenreCategories(): Category[] {
  return GENRE_CATEGORY_SPECS.map((s) => specToCategory(s));
}

/** Ids that belong on the Browse by Category rail. */
export function coreBrowseCategoryIds(): string[] {
  return GENRE_CATEGORY_SPECS.map((s) => s.id);
}

const genreToSpec = new Map<string, GenreCategorySpec>();
for (const spec of GENRE_CATEGORY_SPECS) {
  for (const g of spec.genres) {
    genreToSpec.set(g.toLowerCase().trim(), spec);
  }
}

export function categorySpecForGenre(genreName: string): GenreCategorySpec | null {
  const key = genreName.toLowerCase().trim();
  if (!key) return null;
  const exact = genreToSpec.get(key);
  if (exact) return exact;

  // Fuzzy: needle overlap for odd TMDB variants
  for (const spec of GENRE_CATEGORY_SPECS) {
    for (const g of spec.genres) {
      const gl = g.toLowerCase();
      if (key.includes(gl) || gl.includes(key)) return spec;
    }
  }
  return null;
}

export function specToCategory(spec: GenreCategorySpec): Category {
  return {
    id: spec.id,
    title: spec.title,
    image: spec.image || FALLBACK_IMAGE,
    rule: {
      genres: [...spec.genres],
      sort: SORT,
      limit: LIMIT,
    },
  };
}

function slugFromGenre(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/** Build a category for an unknown genre name (auto-create). */
export function categoryFromUnknownGenre(genreName: string): Category {
  const title = genreName.trim();
  const id = slugFromGenre(title) || `genre-${Date.now()}`;
  return {
    id,
    title,
    image: FALLBACK_IMAGE,
    rule: {
      genres: [title],
      sort: SORT,
      limit: LIMIT,
    },
  };
}

export type EnsureCategoriesResult = {
  categories: Category[];
  created: string[];
  removed: string[];
};

/**
 * Ensure browse tiles exist for the given genre names.
 * Only creates core taxonomy tiles — niches map into those cores.
 */
export async function ensureGenreCategories(
  genreNames: string[],
): Promise<EnsureCategoriesResult> {
  const existing = await readCategories();
  const byId = new Map(existing.map((c) => [c.id, c]));
  const created: string[] = [];
  const core = new Set(coreBrowseCategoryIds());

  for (const raw of genreNames) {
    const name = String(raw || "").trim();
    if (!name) continue;
    const spec = categorySpecForGenre(name);
    if (!spec || !core.has(spec.id) || byId.has(spec.id)) continue;
    byId.set(spec.id, specToCategory(spec));
    created.push(spec.id);
  }

  const categories = [...byId.values()];
  if (created.length) {
    await writeCategories(categories);
  }

  return { categories, created, removed: [] };
}

/**
 * Full catalog resync:
 * - Ensure core browse tiles
 * - Drop obsolete / niche duplicate artwork tiles
 * - Prefer taxonomy image/title for known ids
 */
export async function syncCatalogCategories(): Promise<EnsureCategoriesResult> {
  const [catalog, existing] = await Promise.all([
    readCatalog(),
    readCategories(),
  ]);

  const genreSet = new Set<string>();
  for (const entry of catalog) {
    for (const g of entry.genres ?? []) {
      if (g?.trim()) genreSet.add(g.trim());
    }
  }

  const coreIds = coreBrowseCategoryIds();
  const coreSet = new Set(coreIds);
  const byId = new Map<string, Category>();
  const removed: string[] = [];
  const created: string[] = [];

  // Keep hand-curated manual categories (titleIds, no rule)
  for (const c of existing) {
    if (OBSOLETE_CATEGORY_IDS.has(c.id)) {
      removed.push(c.id);
      continue;
    }
    if (coreSet.has(c.id)) continue;
    if (Array.isArray(c.titleIds) && c.titleIds.length > 0 && !c.rule) {
      byId.set(c.id, { ...c });
      continue;
    }
    // Drop leftover niche / free-form tiles that reused core art
    removed.push(c.id);
  }

  // Refresh / create core taxonomy tiles
  for (const spec of GENRE_CATEGORY_SPECS) {
    const cur = existing.find((c) => c.id === spec.id);
    if (!cur) {
      byId.set(spec.id, specToCategory(spec));
      created.push(spec.id);
    } else if (cur.rule || !cur.titleIds?.length) {
      byId.set(spec.id, specToCategory(spec));
    } else {
      byId.set(spec.id, { ...cur });
    }
  }

  void genreSet; // catalog genres still drive import ensureGenreCategories

  const ordered: Category[] = [];
  for (const id of coreIds) {
    const c = byId.get(id);
    if (c) {
      ordered.push(c);
      byId.delete(id);
    }
  }
  const rest = [...byId.values()].sort((a, b) =>
    a.title.localeCompare(b.title),
  );
  ordered.push(...rest);

  await writeCategories(ordered);
  return { categories: ordered, created, removed };
}
