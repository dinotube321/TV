import { Router } from "express";
import { config, safeEqualString, tmdbConfigured } from "../lib/config.js";
import { signAdminToken } from "../lib/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { rateLimit } from "../lib/rateLimit.js";
import {
  getByIds,
  paginateCatalog,
  resolveCategory,
  resolveShelf,
  searchCatalog,
} from "../lib/query.js";
import {
  readCategories,
  readHeroes,
  readInfo,
  readMeta,
  readSearchIndex,
  readShelves,
  rebuildSearchIndex,
  removeFromCatalog,
  updateTitleGenres,
  writeCategories,
  writeHeroes,
  writeShelves,
} from "../lib/store.js";
import { importFromTmdb } from "../services/importTitle.js";
import { tmdbPreview } from "../services/tmdb.js";
import { syncCatalogCategories } from "../lib/genreCategories.js";
import { readSettings, writeSettings } from "../lib/settings.js";
import {
  adminUser,
  deleteUser,
  listUsers,
  updateUser,
} from "../lib/users.js";
import {
  deleteMediaRequest,
  listMediaRequests,
  openRequestCount,
  updateMediaRequest,
  type MediaRequestStatus,
} from "../lib/mediaRequests.js";
import type { Category, CatalogEntry, HeroEntry, Shelf } from "../types.js";
import { heroIds } from "../lib/store.js";

export const adminRouter = Router();

const MAX_MANUAL_SHELF = 60;
const MAX_HEROES = 12;

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many admin login attempts. Try again later.",
});

adminRouter.post("/login", adminLoginLimiter, async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password || !safeEqualString(password, config.adminPassword)) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  const token = await signAdminToken();
  res.json({ token });
});

adminRouter.get("/config", requireAdmin, (_req, res) => {
  res.json({
    tmdbConfigured: tmdbConfigured(),
    port: config.port,
  });
});

adminRouter.get("/dashboard", requireAdmin, async (_req, res) => {
  const meta = await readMeta();
  const search = await readSearchIndex();
  const heroes = await readHeroes();
  const shelves = await readShelves();
  const page = await paginateCatalog({ page: 1, limit: 8 });
  const openRequests = await openRequestCount();

  res.json({
    counts: {
      titles: meta.titleCount,
      movies: meta.movieCount,
      shows: meta.showCount,
      searchEntries: search.length,
      heroes: heroes.length,
      shelves: shelves.length,
      openRequests,
    },
    tmdbConfigured: tmdbConfigured(),
    recent: page.items,
  });
});

/** Paginated library browse. */
adminRouter.get("/titles", requireAdmin, async (req, res) => {
  const result = await paginateCatalog({
    q: String(req.query.q ?? ""),
    type: (req.query.type as "movie" | "show" | "") || "",
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 40,
  });
  res.json(result);
});

/** Typeahead for hero/shelf pickers — never load all titles. */
adminRouter.get("/titles/search", requireAdmin, async (req, res) => {
  const q = String(req.query.q ?? "");
  const limit = Number(req.query.limit) || 12;
  const type = String(req.query.type ?? "");
  const items = await searchCatalog(q, {
    limit,
    type: type === "movie" || type === "show" ? type : undefined,
  });
  res.json({ items, q });
});

adminRouter.post("/titles/by-ids", requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
  res.json({ items: await getByIds(ids.map(String).slice(0, 100)) });
});

adminRouter.get("/titles/:id", requireAdmin, async (req, res) => {
  const info = await readInfo(req.params.id);
  if (!info) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(info);
});

adminRouter.delete("/titles/:id", requireAdmin, async (req, res) => {
  await removeFromCatalog(req.params.id);
  res.json({ ok: true });
});

adminRouter.get("/preview", requireAdmin, async (req, res) => {
  const tmdbId = Number(req.query.tmdbId);
  const type = req.query.type === "tv" ? "tv" : "movie";
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
    res.status(400).json({ error: "tmdbId required" });
    return;
  }
  try {
    const preview = await tmdbPreview(tmdbId, type);
    res.json(preview);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Preview failed" });
  }
});

adminRouter.post("/import", requireAdmin, async (req, res) => {
  const { tmdbId, type } = req.body as {
    tmdbId?: number;
    type?: "movie" | "tv";
  };
  if (!tmdbId || !type || !["movie", "tv"].includes(type)) {
    res.status(400).json({ error: "tmdbId and type (movie|tv) required" });
    return;
  }
  try {
    const result = await importFromTmdb(Number(tmdbId), type);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Import failed" });
  }
});

adminRouter.get("/homepage/heroes", requireAdmin, async (_req, res) => {
  const heroes = await readHeroes();
  const items = await getByIds(heroIds(heroes));
  const byId = new Map(items.map((i) => [i.id, i]));
  const infos = await Promise.all(heroes.map((h) => readInfo(h.id)));
  res.json({
    heroes: heroes.map((h, i) => {
      const item = byId.get(h.id) ?? null;
      const info = infos[i];
      return {
        ...h,
        trailerUrl: h.trailerUrl || info?.trailerUrl,
        item: item
          ? { ...item, trailerUrl: h.trailerUrl || info?.trailerUrl }
          : null,
      };
    }),
    ids: heroIds(heroes),
    items,
  });
});

adminRouter.put("/homepage/heroes", requireAdmin, async (req, res) => {
  const body = req.body as
    | { heroes?: HeroEntry[]; ids?: string[] }
    | string[]
    | HeroEntry[];

  let entries: HeroEntry[] = [];
  if (Array.isArray(body)) {
    entries = body.map((item) =>
      typeof item === "string" ? { id: item } : { id: item.id, trailerUrl: item.trailerUrl },
    );
  } else if (Array.isArray(body.heroes)) {
    entries = body.heroes.map((h) => ({
      id: String(h.id),
      trailerUrl: h.trailerUrl,
    }));
  } else if (Array.isArray(body.ids)) {
    entries = body.ids.map((id) => ({ id: String(id) }));
  } else {
    res.status(400).json({ error: "Expected { heroes: HeroEntry[] }" });
    return;
  }

  if (entries.length > MAX_HEROES) {
    res.status(400).json({ error: `Max ${MAX_HEROES} heroes` });
    return;
  }

  await writeHeroes(entries);
  const saved = await readHeroes();
  const items = await getByIds(heroIds(saved));
  const byId = new Map(items.map((i) => [i.id, i]));
  const infos = await Promise.all(saved.map((h) => readInfo(h.id)));
  res.json({
    heroes: saved.map((h, i) => {
      const item = byId.get(h.id) ?? null;
      const info = infos[i];
      return {
        ...h,
        trailerUrl: h.trailerUrl || info?.trailerUrl,
        item: item
          ? { ...item, trailerUrl: h.trailerUrl || info?.trailerUrl }
          : null,
      };
    }),
    ids: heroIds(saved),
    items,
  });
});

adminRouter.get("/homepage/shelves", requireAdmin, async (_req, res) => {
  const shelves = await readShelves();
  const withPreview = await Promise.all(
    shelves.map(async (shelf) => {
      const resolved = await resolveShelf(shelf);
      return {
        ...shelf,
        titleIds: shelf.titleIds ?? [],
        mode: shelf.rule ? ("rule" as const) : ("manual" as const),
        previewCount: resolved.length,
        preview: resolved.slice(0, 8),
      };
    }),
  );
  res.json(withPreview);
});

adminRouter.put("/homepage/shelves", requireAdmin, async (req, res) => {
  const shelves = req.body as Shelf[];
  if (!Array.isArray(shelves)) {
    res.status(400).json({ error: "Expected Shelf[]" });
    return;
  }

  try {
    const normalized: Shelf[] = shelves.map((s) => {
      const titleIds = (s.titleIds ?? []).map(String);
      if (!s.rule && titleIds.length > MAX_MANUAL_SHELF) {
        throw new Error(
          `Shelf "${s.title || s.id}" has ${titleIds.length} manual IDs (max ${MAX_MANUAL_SHELF}). Use a dynamic rule instead.`,
        );
      }
      const shelf: Shelf = {
        id: String(s.id),
        title: String(s.title || "Shelf"),
        variant: s.variant,
      };
      if (s.rule) {
        shelf.rule = {
          type: s.rule.type,
          genre: s.rule.genre || undefined,
          limit: Math.min(Math.max(Number(s.rule.limit) || 40, 1), 80),
          sort: s.rule.sort || "recent",
        };
      } else {
        shelf.titleIds = titleIds;
      }
      return shelf;
    });
    await writeShelves(normalized);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Invalid shelves" });
    return;
  }
  res.json(await readShelves());
});

const MAX_MANUAL_CATEGORY = 80;

adminRouter.get("/categories", requireAdmin, async (_req, res) => {
  const categories = await readCategories();
  const withPreview = await Promise.all(
    categories.map(async (category) => {
      const resolved = await resolveCategory(category);
      return {
        ...category,
        titleIds: category.titleIds ?? [],
        mode: category.rule ? ("rule" as const) : ("manual" as const),
        previewCount: resolved.length,
        preview: resolved.slice(0, 8),
      };
    }),
  );
  res.json(withPreview);
});

adminRouter.put("/categories", requireAdmin, async (req, res) => {
  const categories = req.body as Category[];
  if (!Array.isArray(categories)) {
    res.status(400).json({ error: "Expected Category[]" });
    return;
  }

  try {
    const normalized: Category[] = categories.map((c) => {
      const titleIds = (c.titleIds ?? []).map(String);
      if (!c.rule && titleIds.length > MAX_MANUAL_CATEGORY) {
        throw new Error(
          `Category "${c.title || c.id}" has ${titleIds.length} manual IDs (max ${MAX_MANUAL_CATEGORY}). Use a genre rule instead.`,
        );
      }
      const category: Category = {
        id: String(c.id),
        title: String(c.title || "Category"),
        image: String(c.image || ""),
      };
      if (c.rule) {
        category.rule = {
          type: c.rule.type,
          genres: (c.rule.genres ?? []).map(String).filter(Boolean),
          limit: Math.min(Math.max(Number(c.rule.limit) || 48, 1), 100),
          sort: c.rule.sort || "recent",
        };
      } else {
        category.titleIds = titleIds;
      }
      return category;
    });
    await writeCategories(normalized);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Invalid categories" });
    return;
  }
  res.json(await readCategories());
});

/** Rebuild genre browse tiles from catalog genres; drop obsolete Feature Films. */
adminRouter.post("/categories/sync", requireAdmin, async (_req, res) => {
  try {
    const result = await syncCatalogCategories();
    const withPreview = await Promise.all(
      result.categories.map(async (category) => {
        const resolved = await resolveCategory(category);
        return {
          ...category,
          titleIds: category.titleIds ?? [],
          mode: category.rule ? ("rule" as const) : ("manual" as const),
          previewCount: resolved.length,
          preview: resolved.slice(0, 8),
        };
      }),
    );
    res.json({
      ok: true,
      created: result.created,
      removed: result.removed,
      count: result.categories.length,
      categories: withPreview,
    });
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : "Sync failed",
    });
  }
});

function genreMatchesNeedles(genre: string, needles: string[]) {
  const g = genre.toLowerCase();
  return needles.some((n) => {
    const needle = n.toLowerCase();
    return g === needle || g.includes(needle) || needle.includes(g);
  });
}

function titleMatchesCategory(entry: CatalogEntry, category: Category) {
  if (category.rule) {
    if (category.rule.type && entry.type !== category.rule.type) return false;
    const genres = category.rule.genres ?? [];
    if (genres.length) {
      return entry.genres.some((g) => genreMatchesNeedles(g, genres));
    }
    return true;
  }
  return (category.titleIds ?? []).includes(entry.id);
}

/**
 * Move a title between browse categories.
 * - Curated categories: rewrite titleIds
 * - Genre-rule categories: adjust the title's genres so it leaves `from` and matches `to`
 */
adminRouter.post("/categories/move", requireAdmin, async (req, res) => {
  const body = req.body as {
    titleId?: string;
    fromCategoryId?: string;
    toCategoryId?: string;
  };
  const titleId = String(body.titleId ?? "").trim();
  const fromCategoryId = String(body.fromCategoryId ?? "").trim();
  const toCategoryId = String(body.toCategoryId ?? "").trim();

  if (!titleId || !fromCategoryId || !toCategoryId) {
    res.status(400).json({ error: "titleId, fromCategoryId, and toCategoryId are required" });
    return;
  }
  if (fromCategoryId === toCategoryId) {
    res.status(400).json({ error: "Choose a different destination category" });
    return;
  }

  try {
    const [categories, entries] = await Promise.all([
      readCategories(),
      getByIds([titleId]),
    ]);
    const entry = entries[0];
    if (!entry) {
      res.status(404).json({ error: "Title not found" });
      return;
    }

    const from = categories.find((c) => c.id === fromCategoryId);
    const to = categories.find((c) => c.id === toCategoryId);
    if (!from || !to) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    if (to.rule?.type && entry.type !== to.rule.type) {
      res.status(400).json({
        error: `“${to.title}” only accepts ${to.rule.type === "movie" ? "movies" : "TV shows"}`,
      });
      return;
    }

    let nextCategories = categories.map((c) => ({
      ...c,
      titleIds: [...(c.titleIds ?? [])],
    }));
    let genres = [...entry.genres];
    let genresChanged = false;
    let listsChanged = false;

    const fromIdx = nextCategories.findIndex((c) => c.id === from.id);
    const toIdx = nextCategories.findIndex((c) => c.id === to.id);
    const fromCat = nextCategories[fromIdx]!;
    const toCat = nextCategories[toIdx]!;

    // Leave curated source
    if (!from.rule) {
      const before = fromCat.titleIds!.length;
      fromCat.titleIds = fromCat.titleIds!.filter((id) => id !== titleId);
      if (fromCat.titleIds.length !== before) listsChanged = true;
    } else if (from.rule.genres?.length) {
      const needles = from.rule.genres;
      const stripped = genres.filter((g) => !genreMatchesNeedles(g, needles));
      if (stripped.length !== genres.length) {
        genres = stripped;
        genresChanged = true;
      }
    }

    // Enter curated destination
    if (!to.rule) {
      if (!toCat.titleIds!.includes(titleId)) {
        if (toCat.titleIds!.length >= MAX_MANUAL_CATEGORY) {
          res.status(400).json({
            error: `“${to.title}” already has ${MAX_MANUAL_CATEGORY} curated titles`,
          });
          return;
        }
        toCat.titleIds!.push(titleId);
        listsChanged = true;
      }
    } else if (to.rule.genres?.length) {
      const needles = to.rule.genres;
      const matches = genres.some((g) => genreMatchesNeedles(g, needles));
      if (!matches) {
        genres = [...genres, to.rule.genres[0]!];
        genresChanged = true;
      }
    }

    // Avoid empty genre list after stripping a rule category
    if (genresChanged && genres.length === 0 && to.rule?.genres?.[0]) {
      genres = [to.rule.genres[0]];
    }

    if (!genresChanged && !listsChanged) {
      res.status(400).json({
        error:
          "Nothing to change — title may already match the destination (e.g. type-only category)",
      });
      return;
    }

    let updatedEntry = entry;
    if (genresChanged) {
      updatedEntry = await updateTitleGenres(titleId, genres);
    }
    if (listsChanged) {
      await writeCategories(
        nextCategories.map((c) => {
          const out: Category = {
            id: c.id,
            title: c.title,
            image: c.image,
          };
          if (c.rule) out.rule = c.rule;
          else out.titleIds = c.titleIds;
          return out;
        }),
      );
    }

    const refreshed = await readCategories();
    res.json({
      ok: true,
      title: updatedEntry,
      genresChanged,
      listsChanged,
      from: from.title,
      to: to.title,
      membership: refreshed
        .filter((c) => titleMatchesCategory(updatedEntry, c))
        .map((c) => ({ id: c.id, title: c.title })),
    });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    res.status(status).json({
      error: e instanceof Error ? e.message : "Move failed",
    });
  }
});

adminRouter.post("/rebuild-search", requireAdmin, async (_req, res) => {
  const entries = await rebuildSearchIndex();
  res.json({ count: entries.length });
});

adminRouter.get("/settings", requireAdmin, async (_req, res) => {
  res.json(await readSettings());
});

adminRouter.put("/settings", requireAdmin, async (req, res) => {
  const body = req.body as {
    adsEnabled?: boolean;
    streamServerOrder?: string[];
  };
  const settings = await writeSettings({
    adsEnabled:
      typeof body.adsEnabled === "boolean" ? body.adsEnabled : undefined,
    streamServerOrder: Array.isArray(body.streamServerOrder)
      ? body.streamServerOrder
      : undefined,
  });
  res.json(settings);
});

adminRouter.get("/users", requireAdmin, async (_req, res) => {
  const users = await listUsers();
  res.json({
    count: users.length,
    users: users.map(adminUser),
  });
});

adminRouter.patch("/users/:id", requireAdmin, async (req, res) => {
  const body = req.body as { adsEnabled?: boolean };
  try {
    if (typeof body.adsEnabled !== "boolean") {
      res.status(400).json({ error: "adsEnabled (boolean) is required" });
      return;
    }
    const user = await updateUser(req.params.id, {
      adsEnabled: body.adsEnabled,
    });
    res.json({ user: adminUser(user) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    res.status(msg === "User not found" ? 404 : 400).json({ error: msg });
  }
});

adminRouter.delete("/users/:id", requireAdmin, async (req, res) => {
  const ok = await deleteUser(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ ok: true });
});

adminRouter.get("/media-requests", requireAdmin, async (_req, res) => {
  const requests = await listMediaRequests();
  res.json({
    count: requests.length,
    openCount: requests.filter((r) => r.status === "open").length,
    requests,
  });
});

adminRouter.patch("/media-requests/:id", requireAdmin, async (req, res) => {
  const body = req.body as { status?: MediaRequestStatus };
  const status = body.status;
  if (status !== "open" && status !== "done" && status !== "dismissed") {
    res.status(400).json({ error: "status must be open, done, or dismissed" });
    return;
  }
  const entry = await updateMediaRequest(req.params.id, { status });
  if (!entry) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  res.json({ request: entry });
});

adminRouter.delete("/media-requests/:id", requireAdmin, async (req, res) => {
  const ok = await deleteMediaRequest(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  res.json({ ok: true });
});
