import { Router } from "express";
import {
  getByIds,
  paginateCatalog,
  resolveCategory,
  resolveShelf,
  searchCatalog,
  normalizeSearchText,
  compactSearchText,
  fuzzyTitleScore,
  typoQueryVariants,
} from "../lib/query.js";
import {
  getCatalogMap,
  readCategories,
  readHeroes,
  readInfo,
  readMeta,
  readMovieShelves,
  readShelves,
  readTvShelves,
} from "../lib/store.js";
import { tmdbConfigured } from "../lib/config.js";
import { isSafeLocalTitleId, assertSafeLocalTitleId } from "../lib/safePath.js";
import { tmdbImage, tmdbSearchMulti } from "../services/tmdb.js";
import {
  ensureByLocalId,
  ensureFromTmdb,
  parseLocalId,
} from "../services/ensureTitle.js";
import type { Shelf, Title } from "../types.js";

export const catalogRouter = Router();

function asTitle(entry: Awaited<ReturnType<typeof getByIds>>[number]): Title {
  return {
    ...entry,
    tagline: "",
    synopsis: "",
    cast: [],
  };
}

async function resolveBrowseShelves(shelves: Shelf[]) {
  const resolved = await Promise.all(
    shelves.map(async (shelf) => {
      const items = await resolveShelf(shelf, {
        limit: shelf.rule?.limit ?? 40,
      });
      return {
        id: shelf.id,
        title: shelf.title,
        variant: shelf.variant,
        mode: shelf.rule ? ("rule" as const) : ("manual" as const),
        rule: shelf.rule,
        titleIds: shelf.titleIds ?? [],
        items: items.map(asTitle),
      };
    }),
  );
  return resolved.filter((s) => s.items.length > 0);
}

async function heroesFromShelfItems(items: Title[], count = 5) {
  const capped = items.slice(0, count);
  const infos = await Promise.all(capped.map((t) => readInfo(t.id)));
  return infos.filter(Boolean) as Title[];
}

catalogRouter.get("/meta", async (_req, res) => {
  res.json(await readMeta());
});

/** Paginated browse — never dumps the full catalog. */
catalogRouter.get("/titles", async (req, res) => {
  const result = await paginateCatalog({
    q: String(req.query.q ?? ""),
    type: (req.query.type as "movie" | "show" | "") || "",
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 40,
  });
  res.json({
    ...result,
    items: result.items.map(asTitle),
  });
});

/** Resolve a small set of IDs (heroes, curated shelf picks). Cap at 100. */
catalogRouter.post("/titles/by-ids", async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
  const full = Boolean(req.body?.full);
  const capped = ids.map(String).slice(0, 100);

  if (full) {
    const infos = await Promise.all(capped.map((id) => readInfo(id)));
    const map = await getByIds(capped);
    const byId = new Map(map.map((e) => [e.id, e]));
    res.json(
      capped
        .map((id, i) => {
          const info = infos[i];
          if (info) return info;
          const slim = byId.get(id);
          return slim ? asTitle(slim) : null;
        })
        .filter(Boolean),
    );
    return;
  }

  res.json((await getByIds(capped)).map(asTitle));
});

/**
 * Import (or return) a TMDB title into the local file catalog.
 * Used by search when a user opens a result that is not imported yet.
 */
catalogRouter.post("/titles/ensure", async (req, res) => {
  try {
    const body = req.body as { tmdbId?: number; type?: string; id?: string };
    let result;
    if (body.id) {
      assertSafeLocalTitleId(String(body.id));
      result = await ensureByLocalId(String(body.id));
    } else {
      const tmdbId = Number(body.tmdbId);
      const type = body.type === "tv" || body.type === "show" ? "tv" : "movie";
      if (!Number.isFinite(tmdbId) || tmdbId <= 0 || tmdbId > 1_000_000_000) {
        res.status(400).json({ error: "tmdbId or id required" });
        return;
      }
      if (!tmdbConfigured()) {
        res.status(503).json({ error: "TMDB is not configured" });
        return;
      }
      result = await ensureFromTmdb(tmdbId, type);
    }
    res.json({ title: result.title, created: result.created });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    res.status(status).json({
      error: e instanceof Error ? e.message : "Ensure failed",
    });
  }
});

catalogRouter.get("/titles/:id", async (req, res) => {
  const id = req.params.id;
  if (!isSafeLocalTitleId(id)) {
    res.status(400).json({ error: "Invalid title id" });
    return;
  }
  const ensure = String(req.query.ensure ?? "") === "1";
  let info = await readInfo(id);
  if (!info && ensure) {
    const parsed = parseLocalId(id);
    if (parsed && tmdbConfigured()) {
      try {
        const result = await ensureFromTmdb(parsed.tmdbId, parsed.type);
        info = result.title;
      } catch (e) {
        const status = (e as { status?: number }).status || 500;
        res.status(status).json({
          error: e instanceof Error ? e.message : "Import failed",
        });
        return;
      }
    }
  }
  if (!info) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(info);
});

/** Live search — local library first, then TMDB for anything not imported. */
catalogRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 40);
  const type = String(req.query.type ?? "");
  const typeFilter =
    type === "movie" ? "movie" : type === "show" ? "show" : undefined;

  if (!q) {
    res.json({ items: [], q, remote: false, localCount: 0 });
    return;
  }

  const items: Array<Title & { pending?: boolean }> = [];
  const seen = new Set<string>();
  const catalogMap = await getCatalogMap();

  // 1) Imported / local catalog — prefer these in suggestions & results
  try {
    const localEntries = await searchCatalog(q, {
      limit,
      type: typeFilter,
    });
    const infos = await Promise.all(localEntries.map((e) => readInfo(e.id)));
    localEntries.forEach((entry, i) => {
      if (seen.has(entry.id)) return;
      seen.add(entry.id);
      const info = infos[i];
      items.push({
        ...(info ?? asTitle(entry)),
        pending: false,
      });
    });
  } catch {
    /* keep going — TMDB may still answer */
  }

  const localCount = items.length;

  // 2) TMDB for remaining slots (upgrade to local card when already imported)
  let remote = false;
  if (tmdbConfigured() && items.length < limit) {
    try {
      // Also try punctuation-folded query so "Ra one" finds "Ra.One" remotely
      const folded = normalizeSearchText(q);
      const compact = compactSearchText(q);

      const rankTitle = (title: string) => {
        const tn = normalizeSearchText(title);
        const tc = compactSearchText(title);
        if (tn === folded || tc === compact) return 100;
        if (
          tn.startsWith(folded) ||
          (compact.length >= 3 && tc.startsWith(compact))
        ) {
          return 80;
        }
        if (tn.includes(folded)) return 50;
        // Typo: "Lacked" ≈ "Locked"
        return fuzzyTitleScore(q, title);
      };

      const pushHit = async (
        hit: Awaited<ReturnType<typeof tmdbSearchMulti>>[number],
      ) => {
        if (items.length >= limit) return;
        const media = hit.media_type === "tv" ? "tv" : "movie";
        if (typeFilter === "movie" && media !== "movie") return;
        if (typeFilter === "show" && media !== "tv") return;

        const hitTitle =
          (media === "movie" ? hit.title : hit.name) || "Untitled";
        if (rankTitle(hitTitle) < 40) return;

        const id = `${media}-${hit.id}`;
        if (seen.has(id)) return;
        seen.add(id);

        const localEntry = catalogMap.get(id);
        if (localEntry) {
          const info = await readInfo(id);
          items.push({
            ...(info ?? asTitle(localEntry)),
            pending: false,
          });
          return;
        }

        const year =
          Number(
            (
              (media === "movie" ? hit.release_date : hit.first_air_date) || ""
            ).slice(0, 4),
          ) || 0;

        items.push({
          id,
          type: media === "movie" ? "movie" : "show",
          title: hitTitle,
          year,
          rating: "",
          genres: [],
          poster: tmdbImage(hit.poster_path, "w342"),
          backdrop: tmdbImage(hit.backdrop_path, "w780"),
          tagline: "",
          synopsis: hit.overview || "",
          cast: [],
          tmdbId: hit.id,
          voteAverage: hit.vote_average,
          voteCount: hit.vote_count,
          pending: true,
        });
      };

      // Don't send compacted "raone" to TMDB — it returns noisy unrelated hits
      const variants = [...new Set([q, folded].filter(Boolean))];
      let hitLists = await Promise.all(
        variants.map((v) =>
          tmdbSearchMulti(v).catch(
            () => [] as Awaited<ReturnType<typeof tmdbSearchMulti>>,
          ),
        ),
      );
      let hits = hitLists.flat();
      remote = true;

      hits.sort(
        (a, b) =>
          rankTitle((b.media_type === "tv" ? b.name : b.title) || "") -
            rankTitle((a.media_type === "tv" ? a.name : a.title) || "") ||
          (b.popularity ?? 0) - (a.popularity ?? 0),
      );

      for (const hit of hits) {
        await pushHit(hit);
      }

      // Misspellings: TMDB won't find "Locked" for "Lacked" — try close variants
      // Only skip when we already have a near-exact title match (not just fuzzy).
      const exactish = items.filter((t) => rankTitle(t.title) >= 80).length;
      if (items.length < limit && exactish === 0) {
        const typos = typoQueryVariants(q, 12).filter(
          (v) => !variants.some((x) => normalizeSearchText(x) === v),
        );
        if (typos.length) {
          const typoLists = await Promise.all(
            typos.map((v) =>
              tmdbSearchMulti(v).catch(
                () => [] as Awaited<ReturnType<typeof tmdbSearchMulti>>,
              ),
            ),
          );
          const typoHits = typoLists.flat();
          typoHits.sort(
            (a, b) =>
              rankTitle((b.media_type === "tv" ? b.name : b.title) || "") -
                rankTitle((a.media_type === "tv" ? a.name : a.title) || "") ||
              (b.popularity ?? 0) - (a.popularity ?? 0),
          );
          for (const hit of typoHits) {
            await pushHit(hit);
            if (items.length >= limit) break;
          }
        }
      }

      // Keep closest title matches first (typos + exact)
      items.sort(
        (a, b) =>
          rankTitle(b.title) - rankTitle(a.title) ||
          Number(Boolean(a.pending)) - Number(Boolean(b.pending)) ||
          a.title.localeCompare(b.title),
      );
    } catch (e) {
      if (items.length === 0) {
        res.status(502).json({
          error: e instanceof Error ? e.message : "TMDB search failed",
          items: [],
          q,
          remote: true,
          localCount: 0,
        });
        return;
      }
    }
  } else if (!tmdbConfigured() && items.length === 0) {
    res.status(503).json({
      error: "TMDB is not configured",
      items: [],
      q,
      remote: false,
      localCount: 0,
    });
    return;
  }

  res.json({
    items,
    q,
    remote,
    localCount: items.filter((t) => !t.pending).length || localCount,
  });
});

/** Homepage payload — heroes + shelves + category tiles. */
catalogRouter.get("/homepage", async (_req, res) => {
  const [heroEntries, shelves, categories] = await Promise.all([
    readHeroes(),
    readShelves(),
    readCategories(),
  ]);
  const heroInfos = await Promise.all(
    heroEntries.map(async (entry) => {
      const info = await readInfo(entry.id);
      if (!info) return null;
      const trailerUrl = entry.trailerUrl?.trim()
        ? entry.trailerUrl.trim()
        : info.trailerUrl;
      return { ...info, trailerUrl } satisfies Title;
    }),
  );
  const heroes = heroInfos.filter(Boolean);

  const resolved = await Promise.all(
    shelves.map(async (shelf) => {
      const items = await resolveShelf(shelf, { limit: shelf.rule?.limit ?? 40 });
      return {
        id: shelf.id,
        title: shelf.title,
        variant: shelf.variant,
        mode: shelf.rule ? ("rule" as const) : ("manual" as const),
        rule: shelf.rule,
        titleIds: shelf.titleIds ?? [],
        items: items.map(asTitle),
      };
    }),
  );

  res.json({
    heroes,
    shelves: resolved.filter((s) => s.items.length > 0),
    categories,
  });
});

catalogRouter.get("/categories", async (_req, res) => {
  res.json(await readCategories());
});

catalogRouter.get("/categories/:id", async (req, res) => {
  const categories = await readCategories();
  const category = categories.find((c) => c.id === req.params.id);
  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  const items = await resolveCategory(category);
  res.json({
    ...category,
    titleIds: category.titleIds ?? [],
    items: items.map(asTitle),
  });
});

catalogRouter.get("/shelves", async (_req, res) => {
  res.json(await readShelves());
});

catalogRouter.get("/shelves/:id", async (req, res) => {
  const id = req.params.id;
  const [home, movies, tv] = await Promise.all([
    readShelves(),
    readMovieShelves(),
    readTvShelves(),
  ]);
  const shelf =
    home.find((s) => s.id === id) ??
    movies.find((s) => s.id === id) ??
    tv.find((s) => s.id === id);
  if (!shelf) {
    res.status(404).json({ error: "Shelf not found" });
    return;
  }
  // See-all page: return a fuller list than the homepage rail.
  const items = await resolveShelf(shelf, {
    limit: Math.max(shelf.rule?.limit ?? 40, 100),
  });
  res.json({
    ...shelf,
    titleIds: shelf.titleIds ?? [],
    items: items.map(asTitle),
  });
});

/** Movies browse — ranked + genre shelves from content/movies/shelves.json */
catalogRouter.get("/browse/movies", async (_req, res) => {
  const shelves = await readMovieShelves();
  const resolved = await resolveBrowseShelves(shelves);
  const heroes = await heroesFromShelfItems(resolved[0]?.items ?? [], 5);
  res.json({ heroes, shelves: resolved });
});

/** TV browse — ranked + genre shelves from content/tv/shelves.json */
catalogRouter.get("/browse/tv", async (_req, res) => {
  const shelves = await readTvShelves();
  const resolved = await resolveBrowseShelves(shelves);
  const heroes = await heroesFromShelfItems(resolved[0]?.items ?? [], 5);
  res.json({ heroes, shelves: resolved });
});
