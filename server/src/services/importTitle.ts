import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import {
  fetchMovieBundle,
  fetchTvBundle,
  pickBestLogoPath,
  tmdbImage,
  type TmdbImages,
} from "./tmdb.js";
import { paths, upsertCatalog } from "../lib/store.js";
import { ensureGenreCategories } from "../lib/genreCategories.js";
import type { CastMember, Episode, Title, TrailerClip } from "../types.js";

async function downloadToWebp(
  url: string,
  dest: string,
  opts: { width: number; height?: number },
) {
  if (!url) throw new Error("Missing image URL from TMDB");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let pipeline = sharp(buf).rotate();
  if (opts.height) {
    pipeline = pipeline.resize(opts.width, opts.height, {
      fit: "cover",
      position: "centre",
    });
  } else {
    pipeline = pipeline.resize(opts.width, undefined, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await pipeline.webp({ quality: 82 }).toFile(dest);
}

/** Preserve alpha — title logos are typically transparent PNGs. */
async function downloadLogoWebp(url: string, dest: string) {
  if (!url) return false;
  const res = await fetch(url);
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await sharp(buf)
    .rotate()
    .resize({ width: 900, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(dest);
  return true;
}

async function importLogo(
  localId: string,
  images: TmdbImages,
): Promise<string | undefined> {
  const logoPath = pickBestLogoPath(images.logos || []);
  if (!logoPath) return undefined;
  const dest = path.join(paths().logo, `${localId}.webp`);
  const ok = await downloadLogoWebp(tmdbImage(logoPath, "original"), dest);
  return ok ? `/content/logo/${localId}.webp` : undefined;
}

function pickRatingMovie(
  releases: Awaited<ReturnType<typeof fetchMovieBundle>>["releases"],
) {
  const us = releases.results.find((r) => r.iso_3166_1 === "US");
  const cert =
    us?.release_dates.find((d) => d.certification)?.certification ||
    us?.release_dates.map((d) => d.certification).find(Boolean) ||
    "";
  return cert || "NR";
}

function pickRatingTv(
  ratings: Awaited<ReturnType<typeof fetchTvBundle>>["ratings"],
) {
  const us = ratings.results.find((r) => r.iso_3166_1 === "US");
  return us?.rating || ratings.results[0]?.rating || "TV-14";
}

function mapCast(credits: {
  cast: {
    name: string;
    character: string;
    profile_path: string | null;
    order: number;
  }[];
  crew: { name: string; job: string; profile_path: string | null }[];
}): { cast: CastMember[]; director?: string } {
  const cast: CastMember[] = credits.cast
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 12)
    .map((c) => ({
      name: c.name,
      role: c.character || "Cast",
      image: tmdbImage(c.profile_path, "w185") || "",
    }));

  const director =
    credits.crew.find((c) => c.job === "Director")?.name ||
    credits.crew.find((c) => c.job === "Executive Producer")?.name;

  return { cast, director };
}

const TRAILER_TYPES = new Set(["Trailer", "Teaser"]);
const BONUS_TYPES = new Set([
  "Clip",
  "Featurette",
  "Behind the Scenes",
  "Bloopers",
  "Opening Credits",
]);

function mapVideoClip(
  id: string,
  prefix: string,
  v: { id: string; key: string; name: string; type: string },
  index: number,
): TrailerClip {
  return {
    id: `${id}-${prefix}${index + 1}`,
    title: v.name || v.type || "Video",
    duration: "Video",
    image: `https://i.ytimg.com/vi/${v.key}/hqdefault.jpg`,
    youtubeKey: v.key,
    videoUrl: `https://www.youtube.com/watch?v=${v.key}`,
  };
}

/**
 * Split TMDB YouTube videos into trailers vs bonus.
 * Only returns clips that actually exist — never invents placeholders.
 */
function mapTrailers(
  id: string,
  videos: { results: { id: string; key: string; name: string; site: string; type: string }[] },
): { trailers: TrailerClip[]; bonus: TrailerClip[]; trailerUrl?: string } {
  const yt = (videos.results || []).filter(
    (v) => v.site === "YouTube" && v.key && typeof v.key === "string",
  );

  const trailerVideos = yt.filter((v) => TRAILER_TYPES.has(v.type));
  const bonusVideos = yt.filter((v) => !TRAILER_TYPES.has(v.type));

  const trailers = trailerVideos
    .slice(0, 8)
    .map((v, i) => mapVideoClip(id, "t", v, i));

  // Prefer known bonus types first, then any remaining non-trailer YouTube clips
  const preferredBonus = bonusVideos.filter((v) => BONUS_TYPES.has(v.type));
  const otherBonus = bonusVideos.filter((v) => !BONUS_TYPES.has(v.type));
  const bonus = [...preferredBonus, ...otherBonus]
    .slice(0, 12)
    .map((v, i) => mapVideoClip(id, "b", v, i));

  const first = trailerVideos[0] || yt[0];
  return {
    trailers,
    bonus,
    trailerUrl: first ? `https://www.youtube.com/watch?v=${first.key}` : undefined,
  };
}

function minutesLabel(mins: number | null | undefined) {
  if (!mins) return undefined;
  return `${mins} min`;
}

export async function importFromTmdb(
  tmdbId: number,
  mediaType: "movie" | "tv",
) {
  const localId = `${mediaType === "movie" ? "movie" : "tv"}-${tmdbId}`;
  const p = paths();
  const posterPath = path.join(p.poster, `${localId}.webp`);
  const heroPath = path.join(p.hero, `${localId}.webp`);
  const posterUrl = `/content/poster/${localId}.webp`;
  const heroUrl = `/content/hero/${localId}.webp`;

  let title: Title;

  if (mediaType === "movie") {
    const { details, credits, videos, releases, images } =
      await fetchMovieBundle(tmdbId);
    const posterSrc = tmdbImage(details.poster_path, "original");
    const heroSrc = tmdbImage(details.backdrop_path, "original") || posterSrc;
    await downloadToWebp(posterSrc, posterPath, { width: 600, height: 900 });
    await downloadToWebp(heroSrc, heroPath, { width: 1920, height: 1080 });
    const logo = await importLogo(localId, images);

    const { cast, director } = mapCast(credits);
    const { trailers, bonus, trailerUrl } = mapTrailers(localId, videos);
    const year = Number((details.release_date || "").slice(0, 4)) || 0;

    title = {
      id: localId,
      type: "movie",
      title: details.title,
      tagline: details.tagline || details.overview.slice(0, 80),
      synopsis: details.overview || "",
      year,
      rating: pickRatingMovie(releases),
      genres: details.genres.map((g) => g.name),
      duration: minutesLabel(details.runtime),
      poster: posterUrl,
      backdrop: heroUrl,
      logo,
      cast,
      director,
      ...(trailers.length ? { trailers } : {}),
      ...(bonus.length ? { bonus } : {}),
      trailerUrl,
      regions:
        details.production_countries?.map((c) => c.name) ||
        details.origin_country ||
        ["United States"],
      tmdbId,
      importedAt: new Date().toISOString(),
      popularity: details.popularity,
      voteAverage: details.vote_average,
      voteCount: details.vote_count,
    };
  } else {
    const { details, credits, videos, ratings, seasons, images } =
      await fetchTvBundle(tmdbId);
    const posterSrc = tmdbImage(details.poster_path, "original");
    const heroSrc = tmdbImage(details.backdrop_path, "original") || posterSrc;
    await downloadToWebp(posterSrc, posterPath, { width: 600, height: 900 });
    await downloadToWebp(heroSrc, heroPath, { width: 1920, height: 1080 });
    const logo = await importLogo(localId, images);

    const { cast, director } = mapCast(credits);
    const creator = details.created_by?.[0]?.name || director;
    const { trailers, bonus, trailerUrl } = mapTrailers(localId, videos);
    const year = Number((details.first_air_date || "").slice(0, 4)) || 0;
    const epRuntime = details.episode_run_time?.[0];

    const episodes: Episode[] = [];
    for (const season of seasons) {
      for (const ep of season.episodes.slice(0, 12)) {
        episodes.push({
          id: `${localId}-s${season.season_number}e${ep.episode_number}`,
          season: season.season_number,
          number: ep.episode_number,
          title: ep.name || `Episode ${ep.episode_number}`,
          synopsis: ep.overview || details.overview || "",
          duration: minutesLabel(ep.runtime || epRuntime) || "45 min",
          image: tmdbImage(ep.still_path, "w780") || heroUrl,
        });
      }
    }

    title = {
      id: localId,
      type: "show",
      title: details.name,
      tagline: details.tagline || details.overview.slice(0, 80),
      synopsis: details.overview || "",
      year,
      rating: pickRatingTv(ratings),
      genres: details.genres.map((g) => g.name),
      seasons: details.number_of_seasons,
      duration: minutesLabel(epRuntime),
      poster: posterUrl,
      backdrop: heroUrl,
      logo,
      cast,
      director: creator,
      ...(trailers.length ? { trailers } : {}),
      ...(bonus.length ? { bonus } : {}),
      trailerUrl,
      episodes,
      regions: details.origin_country || ["United States"],
      tmdbId,
      importedAt: new Date().toISOString(),
      popularity: details.popularity,
      voteAverage: details.vote_average,
      voteCount: details.vote_count,
    };
  }

  const entry = await upsertCatalog(title);
  if (title.genres?.length) {
    await ensureGenreCategories(title.genres);
  }
  return { entry, title };
}
