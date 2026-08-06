import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { assertSafeLocalTitleId, resolveUnderRoot } from "./safePath.js";
import type {
  CatalogEntry,
  CatalogMeta,
  Category,
  CuratedList,
  CuratedListKey,
  HeroEntry,
  SearchIndexEntry,
  Shelf,
  Title,
  TitleType,
} from "../types.js";

type CacheState = {
  catalog: CatalogEntry[] | null;
  catalogMap: Map<string, CatalogEntry> | null;
  search: SearchIndexEntry[] | null;
  catalogMtime: number;
  loadedAt: number;
};

const cache: CacheState = {
  catalog: null,
  catalogMap: null,
  search: null,
  catalogMtime: 0,
  loadedAt: 0,
};

export function paths() {
  const root = config.contentDir;
  return {
    root,
    poster: path.join(root, "poster"),
    hero: path.join(root, "hero"),
    logo: path.join(root, "logo"),
    info: path.join(root, "info"),
    homepage: path.join(root, "homepage"),
    movies: path.join(root, "movies"),
    tv: path.join(root, "tv"),
    curated: path.join(root, "curated"),
    data: path.join(root, "data.json"),
    searchIndex: path.join(root, "search-index.json"),
    meta: path.join(root, "meta.json"),
    heroes: path.join(root, "homepage", "heroes.json"),
    shelves: path.join(root, "homepage", "shelves.json"),
    movieShelves: path.join(root, "movies", "shelves.json"),
    tvShelves: path.join(root, "tv", "shelves.json"),
    categoriesDir: path.join(root, "categories"),
    categories: path.join(root, "categories.json"),
  };
}

export function invalidateCache() {
  cache.catalog = null;
  cache.catalogMap = null;
  cache.search = null;
  cache.catalogMtime = 0;
  cache.loadedAt = 0;
}

export async function ensureContentDirs() {
  const p = paths();
  await fs.mkdir(p.poster, { recursive: true });
  await fs.mkdir(p.hero, { recursive: true });
  await fs.mkdir(p.logo, { recursive: true });
  await fs.mkdir(p.info, { recursive: true });
  await fs.mkdir(p.homepage, { recursive: true });
  await fs.mkdir(p.movies, { recursive: true });
  await fs.mkdir(p.tv, { recursive: true });
  await fs.mkdir(p.curated, { recursive: true });
  await fs.mkdir(p.categoriesDir, { recursive: true });
  for (const file of [p.data, p.searchIndex, p.heroes] as const) {
    try {
      await fs.access(file);
    } catch {
      await fs.writeFile(file, "[]\n", "utf8");
    }
  }
  try {
    await fs.access(p.shelves);
  } catch {
    await writeJsonPretty(p.shelves, [
      {
        id: "top-picks",
        title: "Top Picks",
        titleIds: [],
        variant: "top10",
      },
      {
        id: "new",
        title: "New & Noteworthy",
        rule: { sort: "recent", limit: 24 },
      },
      {
        id: "movies",
        title: "Movies",
        rule: { type: "movie", sort: "recent", limit: 40 },
      },
      {
        id: "shows",
        title: "TV Shows",
        rule: { type: "show", sort: "recent", limit: 40 },
      },
    ] satisfies Shelf[]);
  }
  try {
    await fs.access(p.categories);
  } catch {
    await writeJsonPretty(p.categories, defaultCategories());
  }

  // Migrate fat catalog rows → slim (once).
  const raw = await readJson<Record<string, unknown>[]>(p.data, []);
  const needsSlim = raw.some(
    (row) => "synopsis" in row || "tagline" in row || "cast" in row,
  );
  if (needsSlim || raw.length > 0) {
    const catalog = await readCatalog();
    if (needsSlim) await writeCatalog(catalog);
    else await writeMetaFromCatalog(catalog);
  } else {
    await writeMetaFromCatalog([]);
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Compact JSON for large catalogs (faster I/O). */
async function writeJsonCompact(file: string, data: unknown) {
  await fs.writeFile(file, JSON.stringify(data) + "\n", "utf8");
}

/** Pretty JSON for small human-edited files. */
async function writeJsonPretty(file: string, data: unknown) {
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function slimEntry(raw: Record<string, unknown>): CatalogEntry {
  return {
    id: String(raw.id),
    type: (raw.type === "show" ? "show" : "movie") as TitleType,
    title: String(raw.title ?? ""),
    year: Number(raw.year) || 0,
    rating: String(raw.rating ?? ""),
    genres: Array.isArray(raw.genres) ? (raw.genres as string[]) : [],
    poster: String(raw.poster ?? ""),
    backdrop: String(raw.backdrop ?? ""),
    duration: raw.duration ? String(raw.duration) : undefined,
    seasons: typeof raw.seasons === "number" ? raw.seasons : undefined,
    badge: raw.badge ? String(raw.badge) : undefined,
    tmdbId: typeof raw.tmdbId === "number" ? raw.tmdbId : undefined,
    importedAt: raw.importedAt ? String(raw.importedAt) : undefined,
    popularity:
      typeof raw.popularity === "number" ? raw.popularity : undefined,
    voteAverage:
      typeof raw.voteAverage === "number" ? raw.voteAverage : undefined,
    voteCount: typeof raw.voteCount === "number" ? raw.voteCount : undefined,
  };
}

export async function readCatalog(): Promise<CatalogEntry[]> {
  try {
    const st = await fs.stat(paths().data);
    const mtime = st.mtimeMs;
    if (cache.catalog && cache.catalogMtime === mtime) return cache.catalog;
    cache.catalogMtime = mtime;
  } catch {
    /* file missing — fall through */
  }
  const raw = await readJson<Record<string, unknown>[]>(paths().data, []);
  const catalog = raw.map(slimEntry);
  cache.catalog = catalog;
  cache.catalogMap = new Map(catalog.map((c) => [c.id, c]));
  cache.loadedAt = Date.now();
  return catalog;
}

export async function getCatalogMap(): Promise<Map<string, CatalogEntry>> {
  await readCatalog();
  return cache.catalogMap!;
}

export async function writeCatalog(entries: CatalogEntry[]) {
  const slim = entries.map((e) => slimEntry(e as unknown as Record<string, unknown>));
  await writeJsonCompact(paths().data, slim);
  cache.catalog = slim;
  cache.catalogMap = new Map(slim.map((c) => [c.id, c]));
  cache.loadedAt = Date.now();
  await writeMetaFromCatalog(slim);
}

export async function readSearchIndex(): Promise<SearchIndexEntry[]> {
  if (cache.search) return cache.search;
  const search = await readJson<SearchIndexEntry[]>(paths().searchIndex, []);
  cache.search = search;
  return search;
}

export async function writeSearchIndex(entries: SearchIndexEntry[]) {
  await writeJsonCompact(paths().searchIndex, entries);
  cache.search = entries;
}

export async function readHeroes(): Promise<HeroEntry[]> {
  const raw = await readJson<unknown[]>(paths().heroes, []);
  return raw
    .map((item): HeroEntry | null => {
      if (typeof item === "string" && item.trim()) {
        return { id: item.trim() };
      }
      if (item && typeof item === "object" && "id" in item) {
        const o = item as { id?: unknown; trailerUrl?: unknown };
        const id = String(o.id ?? "").trim();
        if (!id) return null;
        const trailerUrl =
          typeof o.trailerUrl === "string" && o.trailerUrl.trim()
            ? o.trailerUrl.trim()
            : undefined;
        return { id, trailerUrl };
      }
      return null;
    })
    .filter(Boolean) as HeroEntry[];
}

export async function writeHeroes(entries: HeroEntry[] | string[]) {
  const normalized: HeroEntry[] = entries.map((item) => {
    if (typeof item === "string") return { id: item };
    return {
      id: String(item.id),
      ...(item.trailerUrl?.trim() ? { trailerUrl: item.trailerUrl.trim() } : {}),
    };
  });
  await writeJsonPretty(paths().heroes, normalized);
}

export function heroIds(entries: HeroEntry[]): string[] {
  return entries.map((h) => h.id);
}

export async function readShelves(): Promise<Shelf[]> {
  return readJson(paths().shelves, []);
}

export async function writeShelves(shelves: Shelf[]) {
  await writeJsonPretty(paths().shelves, shelves);
}

export async function readMovieShelves(): Promise<Shelf[]> {
  return readJson(paths().movieShelves, []);
}

export async function writeMovieShelves(shelves: Shelf[]) {
  await writeJsonPretty(paths().movieShelves, shelves);
}

export async function readTvShelves(): Promise<Shelf[]> {
  return readJson(paths().tvShelves, []);
}

export async function writeTvShelves(shelves: Shelf[]) {
  await writeJsonPretty(paths().tvShelves, shelves);
}

const CURATED_KEYS: CuratedListKey[] = [
  "trending_movies_week",
  "trending_tv_week",
  "popular_movies",
  "popular_tv",
  "top_rated_movies",
  "top_rated_tv",
];

export function curatedPath(key: CuratedListKey) {
  return path.join(paths().curated, `${key}.json`);
}

export async function readCuratedList(
  key: CuratedListKey,
): Promise<CuratedList> {
  return readJson(curatedPath(key), { updatedAt: "", ids: [] });
}

export async function writeCuratedList(key: CuratedListKey, list: CuratedList) {
  await fs.mkdir(paths().curated, { recursive: true });
  await writeJsonPretty(curatedPath(key), list);
}

export function isCuratedListKey(value: string): value is CuratedListKey {
  return (CURATED_KEYS as string[]).includes(value);
}

/** Default browse tiles (no type-only Feature Films — Movies page covers that). */
function defaultCategories(): Category[] {
  return [
    {
      id: "comedy-series",
      title: "Comedy",
      image: "/content/categories/comedy-series.webp",
      rule: { genres: ["Comedy"], sort: "popularity", limit: 48 },
    },
    {
      id: "drama-series",
      title: "Drama",
      image: "/content/categories/drama-series.webp",
      rule: { genres: ["Drama"], sort: "popularity", limit: 48 },
    },
    {
      id: "kids-family",
      title: "Kids & Family",
      image: "/content/categories/kids-family.webp",
      rule: {
        genres: ["Family", "Kids", "Animation"],
        sort: "popularity",
        limit: 48,
      },
    },
    {
      id: "non-fiction",
      title: "Non-Fiction",
      image: "/content/categories/non-fiction.webp",
      rule: { genres: ["Documentary"], sort: "popularity", limit: 48 },
    },
    {
      id: "sci-fi",
      title: "Sci-Fi",
      image: "/content/categories/sci-fi.webp",
      rule: {
        genres: ["Science Fiction", "Sci-Fi", "Sci-Fi & Fantasy"],
        sort: "popularity",
        limit: 48,
      },
    },
    {
      id: "action",
      title: "Action",
      image: "/content/categories/action.webp",
      rule: {
        genres: ["Action", "Action & Adventure"],
        sort: "popularity",
        limit: 48,
      },
    },
    {
      id: "thriller",
      title: "Thriller",
      image: "/content/categories/thriller.webp",
      rule: { genres: ["Thriller"], sort: "popularity", limit: 48 },
    },
    {
      id: "horror",
      title: "Horror",
      image: "/content/categories/horror.webp",
      rule: { genres: ["Horror"], sort: "popularity", limit: 48 },
    },
    {
      id: "romance",
      title: "Romance",
      image: "/content/categories/romance.webp",
      rule: { genres: ["Romance"], sort: "popularity", limit: 48 },
    },
    {
      id: "crime",
      title: "Crime",
      image: "/content/categories/crime.webp",
      rule: { genres: ["Crime"], sort: "popularity", limit: 48 },
    },
  ];
}

export async function readCategories(): Promise<Category[]> {
  return readJson(paths().categories, defaultCategories());
}

export async function writeCategories(categories: Category[]) {
  await writeJsonPretty(paths().categories, categories);
}

export async function readInfo(id: string): Promise<Title | null> {
  const safeId = assertSafeLocalTitleId(id);
  const file = resolveUnderRoot(paths().info, `${safeId}.json`);
  return readJson(file, null);
}

export async function writeInfo(title: Title) {
  const safeId = assertSafeLocalTitleId(title.id);
  const file = resolveUnderRoot(paths().info, `${safeId}.json`);
  await writeJsonPretty(file, { ...title, id: safeId });
}

export async function deleteTitleFiles(id: string) {
  const safeId = assertSafeLocalTitleId(id);
  const p = paths();
  await Promise.allSettled([
    fs.unlink(resolveUnderRoot(p.poster, `${safeId}.webp`)),
    fs.unlink(resolveUnderRoot(p.hero, `${safeId}.webp`)),
    fs.unlink(resolveUnderRoot(p.logo, `${safeId}.webp`)),
    fs.unlink(resolveUnderRoot(p.info, `${safeId}.json`)),
  ]);
}

export function toCatalogEntry(title: Title): CatalogEntry {
  return {
    id: title.id,
    type: title.type,
    title: title.title,
    year: title.year,
    rating: title.rating,
    genres: title.genres,
    poster: title.poster,
    backdrop: title.backdrop,
    duration: title.duration,
    seasons: title.seasons,
    badge: title.badge,
    tmdbId: title.tmdbId,
    importedAt: title.importedAt,
    popularity: title.popularity,
    voteAverage: title.voteAverage,
    voteCount: title.voteCount,
  };
}

export function toSearchEntry(title: Title): SearchIndexEntry {
  const cast = title.cast.map((c) => c.name).slice(0, 8);
  const tokens = [title.title, String(title.year), ...title.genres, ...cast]
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return {
    id: title.id,
    type: title.type,
    title: title.title,
    year: title.year,
    genres: title.genres,
    cast,
    tokens,
    poster: title.poster,
  };
}

async function writeMetaFromCatalog(catalog: CatalogEntry[]) {
  const meta: CatalogMeta = {
    version: 1,
    titleCount: catalog.length,
    movieCount: catalog.filter((c) => c.type === "movie").length,
    showCount: catalog.filter((c) => c.type === "show").length,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonPretty(paths().meta, meta);
}

export async function readMeta(): Promise<CatalogMeta> {
  const catalog = await readCatalog();
  const fallback: CatalogMeta = {
    version: 1,
    titleCount: catalog.length,
    movieCount: catalog.filter((c) => c.type === "movie").length,
    showCount: catalog.filter((c) => c.type === "show").length,
    updatedAt: new Date().toISOString(),
  };
  return readJson(paths().meta, fallback);
}

/** Incremental search upsert — O(n) scan once, no N info-file reads. */
export async function upsertSearchEntry(entry: SearchIndexEntry) {
  const index = await readSearchIndex();
  const idx = index.findIndex((e) => e.id === entry.id);
  if (idx >= 0) index[idx] = entry;
  else index.push(entry);
  await writeSearchIndex(index);
}

export async function removeSearchEntry(id: string) {
  const index = await readSearchIndex();
  await writeSearchIndex(index.filter((e) => e.id !== id));
}

export async function rebuildSearchIndex() {
  const catalog = await readCatalog();
  const entries: SearchIndexEntry[] = [];
  const BATCH = 50;
  for (let i = 0; i < catalog.length; i += BATCH) {
    const slice = catalog.slice(i, i + BATCH);
    const infos = await Promise.all(slice.map((c) => readInfo(c.id)));
    slice.forEach((item, j) => {
      const info = infos[j];
      if (info) entries.push(toSearchEntry(info));
      else {
        entries.push({
          id: item.id,
          type: item.type,
          title: item.title,
          year: item.year,
          genres: item.genres,
          cast: [],
          tokens: `${item.title} ${item.year} ${item.genres.join(" ")}`.toLowerCase(),
          poster: item.poster,
        });
      }
    });
  }
  await writeSearchIndex(entries);
  return entries;
}

export async function upsertCatalog(title: Title) {
  const catalog = await readCatalog();
  const entry = toCatalogEntry(title);
  const idx = catalog.findIndex((c) => c.id === title.id);
  if (idx >= 0) catalog[idx] = entry;
  else catalog.push(entry);
  await writeCatalog(catalog);
  await writeInfo(title);
  await upsertSearchEntry(toSearchEntry(title));
  return entry;
}

/** Update genres on catalog + info + search (used when reassigning rule-based categories). */
export async function updateTitleGenres(id: string, genres: string[]) {
  const cleaned = [...new Set(genres.map((g) => g.trim()).filter(Boolean))];
  const catalog = await readCatalog();
  const idx = catalog.findIndex((c) => c.id === id);
  if (idx < 0) throw Object.assign(new Error("Title not found"), { status: 404 });

  catalog[idx] = { ...catalog[idx]!, genres: cleaned };
  await writeCatalog(catalog);

  const info = await readInfo(id);
  if (info) {
    const next = { ...info, genres: cleaned };
    await writeInfo(next);
    await upsertSearchEntry(toSearchEntry(next));
  } else {
    const entry = catalog[idx]!;
    await upsertSearchEntry({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      year: entry.year,
      genres: cleaned,
      cast: [],
      tokens: `${entry.title} ${entry.year} ${cleaned.join(" ")}`.toLowerCase(),
      poster: entry.poster,
    });
  }

  return catalog[idx]!;
}

export async function removeFromCatalog(id: string) {
  const catalog = await readCatalog();
  await writeCatalog(catalog.filter((c) => c.id !== id));
  await removeSearchEntry(id);
  await deleteTitleFiles(id);

  const heroes = (await readHeroes()).filter((h) => h.id !== id);
  await writeHeroes(heroes);

  const shelves = (await readShelves()).map((s) => ({
    ...s,
    titleIds: (s.titleIds ?? []).filter((t) => t !== id),
  }));
  await writeShelves(shelves);

  const categories = (await readCategories()).map((c) => ({
    ...c,
    titleIds: (c.titleIds ?? []).filter((t) => t !== id),
  }));
  await writeCategories(categories);
}
