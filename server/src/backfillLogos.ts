/**
 * Fetch TMDB logos for titles that already exist (no full re-import).
 * Run: npx tsx src/backfillLogos.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ensureContentDirs, paths, readCatalog, readInfo, writeInfo } from "./lib/store.js";
import { fetchImages, pickBestLogoPath, tmdbImage } from "./services/tmdb.js";

async function downloadLogoWebp(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Logo download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await sharp(buf)
    .rotate()
    .resize({ width: 900, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(dest);
}

async function main() {
  await ensureContentDirs();
  const catalog = await readCatalog();
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const entry of catalog) {
    if (!entry.tmdbId) {
      skip += 1;
      continue;
    }
    const info = await readInfo(entry.id);
    if (!info) {
      skip += 1;
      continue;
    }
    try {
      const type = entry.type === "show" ? "tv" : "movie";
      const images = await fetchImages(entry.tmdbId, type);
      const logoPath = pickBestLogoPath(images.logos || []);
      if (!logoPath) {
        console.log(`  no logo: ${entry.id} ${entry.title}`);
        skip += 1;
        continue;
      }
      const dest = path.join(paths().logo, `${entry.id}.webp`);
      await downloadLogoWebp(tmdbImage(logoPath, "original"), dest);
      info.logo = `/content/logo/${entry.id}.webp`;
      await writeInfo(info);
      console.log(`  ✓ ${entry.id} ${entry.title}`);
      ok += 1;
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      fail += 1;
      console.error(`  ✗ ${entry.id}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`Done. logos=${ok} skip=${skip} fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
