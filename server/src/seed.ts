/**
 * Optional seed — imports a few well-known TMDB titles.
 * Run: npm run seed --prefix server
 */
import { ensureContentDirs, readCatalog, writeHeroes, writeShelves } from "./lib/store.js";
import { importFromTmdb } from "./services/importTitle.js";

const SEED: { tmdbId: number; type: "movie" | "tv" }[] = [
  { tmdbId: 575264, type: "movie" }, // Mission: Impossible – Dead Reckoning
  { tmdbId: 786892, type: "movie" }, // Furiosa
  { tmdbId: 693134, type: "movie" }, // Dune: Part Two
  { tmdbId: 94997, type: "tv" }, // House of the Dragon
  { tmdbId: 95396, type: "tv" }, // Severance
  { tmdbId: 97546, type: "tv" }, // Ted Lasso
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function importWithRetry(
  tmdbId: number,
  type: "movie" | "tv",
  attempts = 3,
) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await importFromTmdb(tmdbId, type);
    } catch (e) {
      lastErr = e;
      await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}

async function seed() {
  await ensureContentDirs();
  const ids: string[] = [];

  for (const item of SEED) {
    try {
      console.log(`Importing ${item.type} ${item.tmdbId}…`);
      const { entry } = await importWithRetry(item.tmdbId, item.type);
      ids.push(entry.id);
      console.log(`  → ${entry.id} ${entry.title}`);
      await sleep(400);
    } catch (e) {
      console.error(`  failed:`, e instanceof Error ? e.message : e);
    }
  }

  const catalog = await readCatalog();
  const heroList = (ids.length ? ids : catalog.map((c) => c.id)).slice(0, 5);
  await writeHeroes(heroList.map((id) => ({ id })));
  await writeShelves([
    {
      id: "top-picks",
      title: "Top Picks",
      titleIds: catalog.slice(0, 10).map((c) => c.id),
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
  ]);

  console.log(`Seed complete. ${catalog.length} titles.`);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
