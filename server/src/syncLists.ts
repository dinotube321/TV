/**
 * Sync curated ranking lists from TMDB into content/curated/*.json
 * and ensure those titles exist locally.
 *
 *   npm run sync:lists --prefix server
 *   npm run sync:lists --prefix server -- --limit 20 --delay 400 --no-import
 */
import {
  ensureContentDirs,
  getCatalogMap,
  writeCuratedList,
} from "./lib/store.js";
import { tmdbConfigured } from "./lib/config.js";
import {
  tmdbPopular,
  tmdbTopRated,
  tmdbTrending,
  type TmdbListRow,
} from "./services/tmdb.js";
import { ensureFromTmdb } from "./services/ensureTitle.js";
import type { CuratedListKey } from "./types.js";

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

type Job = {
  key: CuratedListKey;
  type: "movie" | "tv";
  fetch: () => Promise<TmdbListRow[]>;
};

const JOBS: Job[] = [
  {
    key: "trending_movies_week",
    type: "movie",
    fetch: () => tmdbTrending("movie", "week", 2),
  },
  {
    key: "trending_tv_week",
    type: "tv",
    fetch: () => tmdbTrending("tv", "week", 2),
  },
  {
    key: "popular_movies",
    type: "movie",
    fetch: () => tmdbPopular("movie", 2),
  },
  {
    key: "popular_tv",
    type: "tv",
    fetch: () => tmdbPopular("tv", 2),
  },
  {
    key: "top_rated_movies",
    type: "movie",
    fetch: () => tmdbTopRated("movie", 2),
  },
  {
    key: "top_rated_tv",
    type: "tv",
    fetch: () => tmdbTopRated("tv", 2),
  },
];

async function syncJob(
  job: Job,
  limit: number,
  delayMs: number,
  doImport: boolean,
) {
  console.log(`\n→ ${job.key}`);
  const rows = (await job.fetch()).slice(0, limit);
  const map = await getCatalogMap();
  const ids: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const localId = `${job.type === "movie" ? "movie" : "tv"}-${row.id}`;
    const label = row.title || row.name || localId;

    if (map.has(localId)) {
      ids.push(localId);
      console.log(`  [${i + 1}/${rows.length}] have ${label}`);
      continue;
    }

    if (!doImport) {
      console.log(`  [${i + 1}/${rows.length}] skip (no-import) ${label}`);
      continue;
    }

    process.stdout.write(`  [${i + 1}/${rows.length}] import ${label}… `);
    try {
      const { title } = await ensureFromTmdb(row.id, job.type);
      map.set(title.id, {
        id: title.id,
        type: title.type,
        title: title.title,
        year: title.year,
        rating: title.rating,
        genres: title.genres,
        poster: title.poster,
        backdrop: title.backdrop,
        tmdbId: title.tmdbId,
        importedAt: title.importedAt,
        popularity: title.popularity,
        voteAverage: title.voteAverage,
        voteCount: title.voteCount,
      });
      ids.push(title.id);
      console.log("ok");
    } catch (e) {
      console.log(`fail — ${e instanceof Error ? e.message : e}`);
    }
    await sleep(delayMs);
  }

  await writeCuratedList(job.key, {
    updatedAt: new Date().toISOString(),
    ids,
  });
  console.log(`  wrote ${ids.length} ids → curated/${job.key}.json`);
}

async function main() {
  if (!tmdbConfigured()) {
    console.error("Set TMDB_API_KEY or TMDB_READ_TOKEN in .env first.");
    process.exit(1);
  }

  const limit = argNum("limit", 24);
  const delayMs = argNum("delay", 400);
  const doImport = !hasFlag("no-import");

  await ensureContentDirs();
  console.log(
    `Sync curated lists (limit ${limit}/list, delay ${delayMs}ms, import=${doImport})`,
  );

  for (const job of JOBS) {
    try {
      await syncJob(job, limit, delayMs, doImport);
    } catch (e) {
      console.error(
        `  job ${job.key} failed:`,
        e instanceof Error ? e.message : e,
      );
    }
    await sleep(300);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
