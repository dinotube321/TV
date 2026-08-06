import type {
  CatalogEntry,
  Category,
  CategoryRule,
  PageQuery,
  PageResult,
  SearchIndexEntry,
  Shelf,
  ShelfRule,
  ShelfSort,
} from "../types.js";
import {
  getCatalogMap,
  isCuratedListKey,
  readCatalog,
  readCuratedList,
  readSearchIndex,
} from "./store.js";

/**
 * Fold punctuation / spacing so "Ra one", "Ra.one", and "raone" align.
 * Also strips diacritics and turns "&" into "and".
 */
export function normalizeSearchText(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function compactSearchText(s: string): string {
  return normalizeSearchText(s).replace(/\s+/g, "");
}

function wordsOf(s: string): string[] {
  return normalizeSearchText(s).split(" ").filter(Boolean);
}

/** True when every query word is a title word or a prefix of one (min length 2). */
function wordsMatchTitle(qWords: string[], titleWords: string[]): boolean {
  if (!qWords.length || !titleWords.length) return false;
  return qWords.every((w) =>
    titleWords.some((tw) => tw === w || (w.length >= 2 && tw.startsWith(w))),
  );
}

/** Levenshtein edit distance (insert / delete / substitute). */
export function editDistance(a: string, b: string): number {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  // Keep the shorter string in columns for a smaller row buffer
  let row = s;
  let col = t;
  if (row.length < col.length) {
    const tmp = row;
    row = col;
    col = tmp;
  }
  const prev = new Array(col.length + 1);
  for (let j = 0; j <= col.length; j++) prev[j] = j;
  for (let i = 1; i <= row.length; i++) {
    let left = i;
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= col.length; j++) {
      const nextDiag = prev[j];
      const cost = row.charCodeAt(i - 1) === col.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = left + 1;
      const sub = diag + cost;
      left = Math.min(del, ins, sub);
      prev[j] = left;
      diag = nextDiag;
    }
  }
  return prev[col.length];
}

/** How many typos we allow given the shorter string length. */
export function maxEditDistance(len: number): number {
  if (len < 4) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  return 3;
}

/**
 * Score a title against a possibly misspelled query ("Lacked" → "Locked").
 * Returns 0 when not close enough.
 */
export function fuzzyTitleScore(qRaw: string, titleRaw: string): number {
  const qCompact = compactSearchText(qRaw);
  const tCompact = compactSearchText(titleRaw);
  if (qCompact.length < 4 || tCompact.length < 4) return 0;

  const isSubsequence = (small: string, big: string) => {
    let i = 0;
    for (let j = 0; j < big.length && i < small.length; j++) {
      if (big[j] === small[i]) i += 1;
    }
    return i === small.length;
  };

  const maxLenDiff = maxEditDistance(Math.min(qCompact.length, tCompact.length));
  if (Math.abs(qCompact.length - tCompact.length) <= maxLenDiff) {
    const d = editDistance(qCompact, tCompact);
    const allow = maxEditDistance(Math.min(qCompact.length, tCompact.length));
    if (d > 0 && d <= allow) {
      // Prefer closer typos; stay below exact/normalized ranks (62+)
      let score = Math.max(44, 56 - d * 6);
      // "matrx" is a subsequence of "matrix" but not "marx"
      // Only boost when lengths are close (avoids "lacked" matching via "lady")
      if (
        isSubsequence(qCompact, tCompact) &&
        tCompact.length <= qCompact.length + allow + 1
      ) {
        score += 6;
      }
      return Math.min(60, score);
    }
  }

  const qWords = wordsOf(qRaw);
  const tWords = wordsOf(titleRaw);
  if (!qWords.length || !tWords.length) return 0;

  let totalDist = 0;
  let sameLenHits = 0;
  const ok = qWords.every((qw) => {
    if (qw.length < 4) {
      return tWords.some((tw) => tw === qw || tw.startsWith(qw));
    }
    let best = Infinity;
    let bestSameLen = false;
    for (const tw of tWords) {
      if (Math.abs(qw.length - tw.length) > maxEditDistance(Math.min(qw.length, tw.length))) {
        continue;
      }
      const d = editDistance(qw, tw);
      if (d < best || (d === best && tw.length === qw.length)) {
        best = d;
        bestSameLen = tw.length === qw.length;
      }
      if (d === 0 && tw.length === qw.length) break;
    }
    const allow = maxEditDistance(qw.length);
    if (best > allow) return false;
    totalDist += best;
    if (bestSameLen) sameLenHits += 1;
    return true;
  });

  if (!ok) return 0;
  if (totalDist === 0) return 0; // exact word match handled elsewhere
  let score = Math.max(40, 52 - totalDist * 5);
  if (sameLenHits === qWords.length) score += 5;
  // Prefer a close single-word title over "Locked Down" style expansions
  if (tWords.length > qWords.length) {
    score -= Math.min(12, (tWords.length - qWords.length) * 4);
  }
  if (
    isSubsequence(qCompact, tCompact) &&
    tCompact.length <= qCompact.length + maxEditDistance(qCompact.length) + 1
  ) {
    score += 4;
  }
  return Math.min(58, score);
}

/**
 * Limited misspelling variants for remote (TMDB) lookup when the typed
 * query returns nothing useful — vowel swaps + adjacent swaps.
 */
export function typoQueryVariants(qRaw: string, limit = 12): string[] {
  const base = normalizeSearchText(qRaw);
  if (base.length < 4) return [];
  const words = base.split(" ").filter(Boolean);
  // Only expand single-token queries (multi-word typos are costlier / noisier)
  if (words.length !== 1) return [];

  const s = words[0];
  const out = new Set<string>();
  const vowels = ["a", "e", "i", "o", "u"];

  // Prefix truncations — TMDB "incept" / "matr" surfaces Inception / Matrix
  if (s.length >= 5) {
    out.add(s.slice(0, -1));
    if (s.length >= 6) out.add(s.slice(0, -2));
  }

  // Adjacent transposition (teh → the)
  for (let i = 0; i < s.length - 1; i++) {
    out.add(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2));
  }

  // Vowel substitutions (lacked → locked)
  for (let i = 0; i < s.length; i++) {
    if (!vowels.includes(s[i])) continue;
    for (const v of vowels) {
      if (v === s[i]) continue;
      out.add(s.slice(0, i) + v + s.slice(i + 1));
    }
  }

  // Single deletion for short typos (matrx → matr → Matrix via prefix search)
  if (s.length >= 5) {
    for (let i = 0; i < s.length; i++) {
      out.add(s.slice(0, i) + s.slice(i + 1));
    }
  }

  // Insert a vowel (matrx → matrix)
  if (s.length >= 4 && s.length <= 10) {
    for (let i = 1; i < s.length; i++) {
      for (const v of vowels) {
        out.add(s.slice(0, i) + v + s.slice(i));
      }
    }
  }

  out.delete(s);

  const forced: string[] = [];
  if (s.length >= 5) {
    const p1 = s.slice(0, -1);
    if (p1.length >= 4) forced.push(p1);
    if (s.length >= 6) {
      const p2 = s.slice(0, -2);
      if (p2.length >= 4) forced.push(p2);
    }
  }
  const rest = [...out]
    .filter((x) => x.length >= 4 && !forced.includes(x))
    .sort(
      (a, b) =>
        editDistance(a, s) - editDistance(b, s) ||
        Math.abs(a.length - s.length) - Math.abs(b.length - s.length) ||
        a.localeCompare(b),
    );

  return [...forced, ...rest].slice(0, limit);
}

function scoreSearch(entry: SearchIndexEntry, qRaw: string): number {
  const q = normalizeSearchText(qRaw);
  const qCompact = compactSearchText(qRaw);
  if (!q && !qCompact) return 0;

  const titleNorm = normalizeSearchText(entry.title);
  const titleCompact = compactSearchText(entry.title);
  const titleWords = wordsOf(entry.title);
  const qWords = wordsOf(qRaw);
  const tokensNorm = normalizeSearchText(entry.tokens || "");

  // Exact / near-exact on folded title ("ra one" ≡ "Ra.One")
  if (titleNorm === q || (qCompact.length >= 2 && titleCompact === qCompact)) {
    return 100;
  }
  if (
    titleNorm.startsWith(q) ||
    (qCompact.length >= 3 && titleCompact.startsWith(qCompact))
  ) {
    return 88;
  }
  if (
    titleNorm.includes(` ${q} `) ||
    titleNorm.endsWith(` ${q}`) ||
    titleNorm.startsWith(`${q} `)
  ) {
    return 75;
  }
  if (titleNorm.includes(q)) return 68;
  if (qCompact.length >= 4 && titleCompact.includes(qCompact)) return 62;

  // Multi-word against title words only — never raw substrings of synopsis
  // (avoids "ra" matching inside "drama" / "racing").
  if (qWords.length > 1 && wordsMatchTitle(qWords, titleWords)) {
    return 80;
  }
  if (qWords.length === 1 && wordsMatchTitle(qWords, titleWords)) {
    return 55;
  }

  // Typo tolerance: "Lacked" ≈ "Locked"
  const fuzzy = fuzzyTitleScore(qRaw, entry.title);
  if (fuzzy > 0) return fuzzy;

  // Tokens / metadata: require longer needles so short fragments don't flood
  if (q.length >= 4 && tokensNorm.includes(q)) return 42;
  if (
    qWords.length > 1 &&
    qWords.every((w) => w.length >= 3) &&
    wordsMatchTitle(qWords, wordsOf(entry.tokens || ""))
  ) {
    return 38;
  }
  if (
    entry.genres.some(
      (g) => normalizeSearchText(g).includes(q) && q.length >= 3,
    )
  ) {
    return 36;
  }
  if (
    entry.cast.some((c) => normalizeSearchText(c).includes(q) && q.length >= 3)
  ) {
    return 34;
  }
  if (String(entry.year) === q) return 30;
  return 0;
}

export async function searchCatalog(
  q: string,
  opts: { limit?: number; type?: string } = {},
): Promise<CatalogEntry[]> {
  const query = q.trim();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  if (!query) return [];

  const index = await readSearchIndex();
  const map = await getCatalogMap();
  const scored = index
    .filter((e) => !opts.type || e.type === opts.type)
    .map((entry) => ({ entry, score: scoreSearch(entry, query) }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.entry.title.localeCompare(b.entry.title),
    )
    .slice(0, limit);

  return scored
    .map((s) => map.get(s.entry.id))
    .filter(Boolean) as CatalogEntry[];
}

export async function paginateCatalog(
  query: PageQuery,
): Promise<PageResult<CatalogEntry>> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(Number(query.limit) || 40, 1), 100);
  const qRaw = (query.q ?? "").trim();
  const q = normalizeSearchText(qRaw);
  const qCompact = compactSearchText(qRaw);
  const type = query.type || "";

  let items = await readCatalog();
  if (type === "movie" || type === "show") {
    items = items.filter((c) => c.type === type);
  }
  if (qRaw) {
    items = items.filter((c) => {
      const titleNorm = normalizeSearchText(c.title);
      const titleCompact = compactSearchText(c.title);
      const idNorm = normalizeSearchText(c.id);
      if (
        titleNorm.includes(q) ||
        (qCompact.length >= 3 && titleCompact.includes(qCompact))
      ) {
        return true;
      }
      if (idNorm.includes(q) || String(c.tmdbId ?? "").includes(qRaw)) {
        return true;
      }
      if (wordsMatchTitle(wordsOf(qRaw), wordsOf(c.title))) return true;
      return c.genres.some(
        (g) => normalizeSearchText(g).includes(q) && q.length >= 3,
      );
    });
  }

  items = [...items].sort((a, b) =>
    (b.importedAt || "").localeCompare(a.importedAt || ""),
  );

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    page,
    limit,
    total,
    totalPages,
  };
}

export async function getByIds(ids: string[]): Promise<CatalogEntry[]> {
  const map = await getCatalogMap();
  return ids.map((id) => map.get(id)).filter(Boolean) as CatalogEntry[];
}

function applyRuleSort(items: CatalogEntry[], sort: ShelfSort | undefined) {
  const copy = [...items];
  if (sort === "title") {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === "year") {
    copy.sort((a, b) => b.year - a.year);
  } else if (sort === "popularity") {
    copy.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  } else if (sort === "rating") {
    copy.sort((a, b) => {
      const score =
        (b.voteAverage ?? 0) * Math.log10((b.voteCount ?? 0) + 10) -
        (a.voteAverage ?? 0) * Math.log10((a.voteCount ?? 0) + 10);
      return score || (b.voteAverage ?? 0) - (a.voteAverage ?? 0);
    });
  } else {
    copy.sort((a, b) => (b.importedAt || "").localeCompare(a.importedAt || ""));
  }
  return copy;
}

function matchesGenre(entry: CatalogEntry, needles: string[]) {
  const genres = entry.genres.map((g) => g.toLowerCase());
  return needles.some((n) => {
    const needle = n.toLowerCase();
    return genres.some((g) => g === needle || g.includes(needle));
  });
}

async function resolveFromCuratedList(
  listKey: string,
  opts: { type?: string; limit?: number } = {},
): Promise<CatalogEntry[]> {
  if (!isCuratedListKey(listKey)) return [];
  const curated = await readCuratedList(listKey);
  const map = await getCatalogMap();
  let items = curated.ids
    .map((id) => map.get(id))
    .filter(Boolean) as CatalogEntry[];
  if (opts.type === "movie" || opts.type === "show") {
    items = items.filter((c) => c.type === opts.type);
  }
  const limit = opts.limit ?? items.length;
  return items.slice(0, limit);
}

/** Resolve shelf to concrete catalog rows without storing huge ID lists. */
export async function resolveShelf(
  shelf: Shelf,
  opts: { limit?: number } = {},
): Promise<CatalogEntry[]> {
  const listKey = shelf.rule?.list;
  if (listKey) {
    return resolveFromCuratedList(listKey, {
      type: shelf.rule?.type,
      limit: opts.limit ?? shelf.rule?.limit ?? 40,
    });
  }

  if (shelf.rule) {
    const rule = shelf.rule;
    let items = await readCatalog();
    if (rule.type) items = items.filter((c) => c.type === rule.type);
    if (rule.genre) {
      const g = rule.genre.toLowerCase();
      items = items.filter((c) =>
        c.genres.some(
          (x) => x.toLowerCase() === g || x.toLowerCase().includes(g),
        ),
      );
    }
    items = applyRuleSort(items, rule.sort ?? "recent");
    const limit = opts.limit ?? rule.limit ?? 40;
    return items.slice(0, limit);
  }

  const ids = shelf.titleIds ?? [];
  const limit = opts.limit ?? ids.length;
  return getByIds(ids.slice(0, limit));
}

/** Resolve a category via rule and/or curated IDs. */
export async function resolveCategory(
  category: Category,
  opts: { limit?: number } = {},
): Promise<CatalogEntry[]> {
  if (category.rule) {
    const rule = category.rule;
    let items = await readCatalog();
    if (rule.type) items = items.filter((c) => c.type === rule.type);
    if (rule.genres?.length) {
      items = items.filter((c) => matchesGenre(c, rule.genres!));
    }
    items = applyRuleSort(items, rule.sort ?? "recent");
    const limit = opts.limit ?? rule.limit ?? 48;
    return items.slice(0, limit);
  }

  const ids = category.titleIds ?? [];
  const limit = opts.limit ?? ids.length;
  return getByIds(ids.slice(0, limit));
}

export type { ShelfRule, CategoryRule };
