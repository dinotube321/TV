/**
 * Rate-limited TMDB bulk import with live progress.
 *
 * Run in its own terminal (does not need the site servers):
 *
 *   npm run import:bulk
 *   npm run import:bulk -- --movies 800 --tv 400
 *   npm run import:bulk -- --movies 200 --tv 100 --delay 550
 *   npm run import:bulk -- --movies 0 --tv 300          # TV only
 *   npm run import:bulk -- --dry-run                   # collect ids only
 *
 * Defaults stay polite (~2 req/s including discover). Raise --delay if you
 * see TMDB 429s. Already-imported titles are skipped (safe to re-run).
 */
import { ensureContentDirs, getCatalogMap } from "./lib/store.js";
import { tmdbConfigured } from "./lib/config.js";
import { tmdbDiscoverPage } from "./services/tmdb.js";
import { importFromTmdb } from "./services/importTitle.js";
import { syncCatalogCategories } from "./lib/genreCategories.js";

/** TMDB genre ids covering every browse category tile. */
const MOVIE_GENRES: { id: string; label: string }[] = [
  { id: "28", label: "Action" },
  { id: "12", label: "Adventure" },
  { id: "16", label: "Animation" },
  { id: "35", label: "Comedy" },
  { id: "80", label: "Crime" },
  { id: "99", label: "Documentary" },
  { id: "18", label: "Drama" },
  { id: "10751", label: "Family" },
  { id: "14", label: "Fantasy" },
  { id: "36", label: "History" },
  { id: "27", label: "Horror" },
  { id: "10402", label: "Music" },
  { id: "9648", label: "Mystery" },
  { id: "10749", label: "Romance" },
  { id: "878", label: "Sci-Fi" },
  { id: "53", label: "Thriller" },
  { id: "10752", label: "War" },
  { id: "37", label: "Western" },
];

const TV_GENRES: { id: string; label: string }[] = [
  { id: "10759", label: "Action & Adventure" },
  { id: "16", label: "Animation" },
  { id: "35", label: "Comedy" },
  { id: "80", label: "Crime" },
  { id: "99", label: "Documentary" },
  { id: "18", label: "Drama" },
  { id: "10751", label: "Family" },
  { id: "10762", label: "Kids" },
  { id: "9648", label: "Mystery" },
  { id: "10763", label: "News" },
  { id: "10764", label: "Reality" },
  { id: "10765", label: "Sci-Fi & Fantasy" },
  { id: "10766", label: "Soap" },
  { id: "10767", label: "Talk" },
  { id: "10768", label: "War & Politics" },
  { id: "37", label: "Western" },
];

function argNum(name: string, fallback: number) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) {
    const n = Number(process.argv[i + 1]);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pct(n: number, total: number) {
  if (!total) return "100%";
  return `${Math.min(100, Math.round((n / total) * 100))}%`;
}

function bar(done: number, total: number, width = 28) {
  if (!total) return "█".repeat(width);
  const filled = Math.round((done / total) * width);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

function fmtEta(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}m ${r}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function lineClearWrite(msg: string) {
  // Single updating progress line
  process.stdout.write(`\r\x1b[K${msg}`);
}

type DiscoverPlan = {
  label: string;
  sort: string;
  withGenres?: string;
  pages: number;
};

function buildPlans(
  genres: { id: string; label: string }[],
  target: number,
): DiscoverPlan[] {
  // Scale pages with target so small runs stay light on the API
  const popPages = Math.min(25, Math.max(4, Math.ceil(target / 40)));
  const ratedPages = Math.min(12, Math.max(2, Math.ceil(target / 80)));
  const genrePages = Math.min(4, Math.max(1, Math.ceil(target / (genres.length * 20))));

  return [
    { label: "Popular", sort: "popularity.desc", pages: popPages },
    { label: "Top rated", sort: "vote_average.desc", pages: ratedPages },
    { label: "Trending votes", sort: "vote_count.desc", pages: Math.max(2, Math.floor(ratedPages / 2)) },
    ...genres.map((g) => ({
      label: g.label,
      sort: "popularity.desc",
      withGenres: g.id,
      pages: genrePages,
    })),
  ];
}

async function collectIds(
  type: "movie" | "tv",
  target: number,
  genres: { id: string; label: string }[],
  discoverDelayMs: number,
) {
  const ids: number[] = [];
  const seen = new Set<number>();
  const plans = buildPlans(genres, target);

  console.log(`\nCollecting ${type} IDs (target ${target})…`);

  for (const plan of plans) {
    if (ids.length >= target) break;
    for (let page = 1; page <= plan.pages; page++) {
      if (ids.length >= target) break;
      try {
        const data = await tmdbDiscoverPage(type, {
          page,
          sort: plan.sort,
          withGenres: plan.withGenres,
        });
        let added = 0;
        for (const row of data.results || []) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          ids.push(row.id);
          added += 1;
          if (ids.length >= target) break;
        }
        lineClearWrite(
          `  ${plan.label.padEnd(18)} p${page}/${plan.pages}  +${added}  total ${ids.length}/${target}  ${pct(ids.length, target)}`,
        );
        await sleep(discoverDelayMs);
      } catch (e) {
        console.warn(
          `\n  discover ${type} ${plan.label} p${page} failed:`,
          e instanceof Error ? e.message : e,
        );
        await sleep(Math.max(1200, discoverDelayMs * 3));
      }
    }
  }

  process.stdout.write("\n");
  return ids.slice(0, target);
}

async function importList(
  type: "movie" | "tv",
  ids: number[],
  delayMs: number,
  dryRun: boolean,
) {
  const map = await getCatalogMap();
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let lastTitle = "";
  const t0 = Date.now();
  let workStarted = 0;

  console.log(
    `\nImporting ${type === "movie" ? "movies" : "TV shows"} (${ids.length} candidates)…`,
  );

  for (let i = 0; i < ids.length; i++) {
    const tmdbId = ids[i]!;
    const localId = `${type === "movie" ? "movie" : "tv"}-${tmdbId}`;
    const done = i + 1;

    if (map.has(localId)) {
      skipped += 1;
      lineClearWrite(
        `${bar(done, ids.length)} ${done}/${ids.length} (${pct(done, ids.length)})  +${imported} new · ${skipped} skip · ${failed} fail  · already local`,
      );
      continue;
    }

    if (dryRun) {
      imported += 1;
      lineClearWrite(
        `${bar(done, ids.length)} ${done}/${ids.length} (${pct(done, ids.length)})  would import ${localId}`,
      );
      continue;
    }

    if (!workStarted) workStarted = Date.now();
    process.stdout.write(
      `\r\x1b[K${bar(done, ids.length)} ${done}/${ids.length} (${pct(done, ids.length)})  importing ${type} ${tmdbId}…`,
    );

    try {
      const { entry } = await importFromTmdb(tmdbId, type);
      map.set(entry.id, entry);
      imported += 1;
      lastTitle = entry.title;
    } catch (e) {
      failed += 1;
      lastTitle = e instanceof Error ? e.message : String(e);
    }

    const elapsed = Date.now() - (workStarted || t0);
    const attempted = imported + failed;
    const rate = attempted > 0 ? attempted / (elapsed / 1000) : 0;
    const remain = ids.length - done;
    // Rough ETA from remaining unscoped ids at current rate (skips are instant)
    const etaMs = rate > 0 ? (remain / Math.max(rate, 0.05)) * 1000 : 0;

    lineClearWrite(
      `${bar(done, ids.length)} ${done}/${ids.length} (${pct(done, ids.length)})  +${imported} new · ${skipped} skip · ${failed} fail  · ${rate.toFixed(2)}/s  ETA ${fmtEta(etaMs)}  · ${lastTitle.slice(0, 42)}`,
    );

    await sleep(delayMs);
  }

  process.stdout.write("\n");
  const elapsed = Date.now() - t0;
  return { imported, skipped, failed, elapsedMs: elapsed };
}

async function main() {
  if (!tmdbConfigured()) {
    console.error("Set TMDB_API_KEY or TMDB_READ_TOKEN in .env first.");
    process.exit(1);
  }

  const movieTarget = argNum("movies", 500);
  const tvTarget = argNum("tv", 250);
  // ~2 req/s ceiling with headroom for TMDB's ~40 req/10s guideline
  const delayMs = argNum("delay", 500);
  const discoverDelayMs = argNum("discover-delay", 280);
  const dryRun = hasFlag("dry-run");
  const skipCategories = hasFlag("no-categories");

  await ensureContentDirs();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" Pulse · TMDB bulk import");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    ` Targets:  movies=${movieTarget}  tv=${tvTarget}  delay=${delayMs}ms  discover-delay=${discoverDelayMs}ms`,
  );
  if (dryRun) console.log(" Mode:     DRY RUN (no writes)");
  console.log(" Tip:      Safe to re-run — existing titles are skipped.");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const movieIds = movieTarget
    ? await collectIds("movie", movieTarget, MOVIE_GENRES, discoverDelayMs)
    : [];
  const tvIds = tvTarget
    ? await collectIds("tv", tvTarget, TV_GENRES, discoverDelayMs)
    : [];

  console.log(
    `\nCollected ${movieIds.length} movie ids, ${tvIds.length} TV ids.`,
  );

  const movies = movieIds.length
    ? await importList("movie", movieIds, delayMs, dryRun)
    : { imported: 0, skipped: 0, failed: 0, elapsedMs: 0 };
  const shows = tvIds.length
    ? await importList("tv", tvIds, delayMs, dryRun)
    : { imported: 0, skipped: 0, failed: 0, elapsedMs: 0 };

  if (!dryRun && !skipCategories) {
    console.log("\nSyncing browse categories from imported genres…");
    try {
      const result = await syncCatalogCategories();
      console.log(
        `  categories: ${result.categories.length} (created ${result.created}, removed ${result.removed})`,
      );
    } catch (e) {
      console.warn(
        "  category sync failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" Done");
  console.log(
    ` Movies  +${movies.imported} new · ${movies.skipped} skip · ${movies.failed} fail  (${fmtEta(movies.elapsedMs)})`,
  );
  console.log(
    ` TV      +${shows.imported} new · ${shows.skipped} skip · ${shows.failed} fail  (${fmtEta(shows.elapsedMs)})`,
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
