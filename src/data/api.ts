import type { Category, SearchIndexEntry, Shelf, Title } from "./types";

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

let heroesCache: string[] | null = null;
let shelvesCache: Shelf[] | null = null;
let homepageCache: {
  heroes: Title[];
  shelves: Array<
    Shelf & {
      items: Title[];
      mode?: "manual" | "rule";
    }
  >;
  categories: Category[];
} | null = null;

export async function loadHomepage() {
  if (homepageCache) return homepageCache;
  homepageCache = await getJson("/api/homepage");
  return homepageCache;
}

export async function fetchCategories(): Promise<Category[]> {
  return getJson("/api/categories");
}

export async function fetchCategory(id: string) {
  return getJson<Category & { items: Title[] }>(
    `/api/categories/${encodeURIComponent(id)}`,
  );
}

export async function loadHeroes(): Promise<string[]> {
  if (heroesCache) return heroesCache;
  heroesCache = await getJson<string[]>("/content/homepage/heroes.json");
  return heroesCache;
}

export async function loadShelves(): Promise<Shelf[]> {
  if (shelvesCache) return shelvesCache;
  shelvesCache = await getJson<Shelf[]>("/content/homepage/shelves.json");
  return shelvesCache;
}

/** Resolve a small set of IDs via API (no full catalog download). */
export async function fetchTitlesByIds(
  ids: string[],
  opts: { full?: boolean } = {},
): Promise<Title[]> {
  if (!ids.length) return [];
  return getJson<Title[]>("/api/titles/by-ids", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, full: Boolean(opts.full) }),
  });
}

export async function fetchShelfResolved(id: string): Promise<{
  id: string;
  title: string;
  variant?: Shelf["variant"];
  titleIds: string[];
  items: Title[];
}> {
  return getJson(`/api/shelves/${encodeURIComponent(id)}`);
}

export async function fetchBrowsePage(kind: "movies" | "tv") {
  return getJson<{
    heroes: Title[];
    shelves: Array<
      Shelf & {
        items: Title[];
        mode?: "manual" | "rule";
      }
    >;
  }>(`/api/browse/${kind}`);
}

export async function fetchBrowse(opts: {
  type?: "movie" | "show" | "";
  page?: number;
  limit?: number;
  q?: string;
}) {
  const params = new URLSearchParams();
  if (opts.type) params.set("type", opts.type);
  if (opts.q) params.set("q", opts.q);
  params.set("page", String(opts.page ?? 1));
  params.set("limit", String(opts.limit ?? 40));
  return getJson<{
    items: Title[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>(`/api/titles?${params}`);
}

export async function fetchSearch(q: string, limit = 20): Promise<Title[]> {
  if (!q.trim()) return [];
  const params = new URLSearchParams({
    q,
    limit: String(limit),
  });
  const res = await fetch(`/api/search?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error || `Search failed (${res.status})`,
    );
  }
  const data = (await res.json()) as { items: Title[] };
  return data.items ?? [];
}

/** Import a TMDB title on demand (no-op if already local). */
export async function ensureTitle(id: string): Promise<Title> {
  const res = await getJson<{ title: Title; created: boolean }>(
    "/api/titles/ensure",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    },
  );
  return res.title;
}

export async function loadTitleInfo(id: string): Promise<Title | undefined> {
  try {
    return await getJson<Title>(`/api/titles/${encodeURIComponent(id)}`);
  } catch {
    try {
      return await getJson<Title>(`/content/info/${encodeURIComponent(id)}.json`);
    } catch {
      return undefined;
    }
  }
}

/** @deprecated Prefer fetchSearch / fetchBrowse — kept for gradual migration. */
export async function loadCatalog(): Promise<Title[]> {
  const page = await fetchBrowse({ page: 1, limit: 100 });
  return page.items;
}

/** @deprecated Prefer fetchSearch */
export async function loadSearchIndex(): Promise<SearchIndexEntry[]> {
  return [];
}

export function invalidateCatalogCache() {
  heroesCache = null;
  shelvesCache = null;
  homepageCache = null;
}
