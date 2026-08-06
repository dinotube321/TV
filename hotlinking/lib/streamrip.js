/**
 * Streamrip / FilmU multi-server extractor.
 * Uses embed.filmu.in scrape proxy (same path FilmU’s player uses) and
 * returns native HLS/MP4 sources for each working scraper.
 *
 * Docs context: https://streamrip.fun/api-docs
 * Play page embeds FilmU: https://streamrip.fun/play?type=movie&id={tmdb}
 */
const FILMU_PROXY = "https://embed.filmu.in/api/proxy";
const FILMU_ORIGIN = "https://embed.filmu.in";
const STREAMRIP_ORIGIN = "https://streamrip.fun";

/** Scrapers wired through FilmU’s /scrape/{name}/… API (verified working). */
const DEFAULT_SCRAPERS = [
  { id: "Goojara", label: "Streamrip Titan" },
  { id: "Vidcore", label: "Streamrip Atlas" },
  { id: "FShareTV", label: "Streamrip Aura" },
  { id: "FSonic", label: "Streamrip Flax" },
  { id: "MoviesDrive", label: "Streamrip Nexus" },
];

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
}

function mediaKind(params) {
  const t = String(params.mediaType || "movie").toLowerCase();
  if (t === "tv" || t === "show" || t === "anime") return "tv";
  return "movie";
}

function catalogKey(params) {
  const kind = mediaKind(params);
  const id = String(params.tmdbId || "").trim();
  if (!id) return "";
  if (kind === "tv") {
    return `tv:${id}:${params.seasonId || 1}:${params.episodeId || 1}`;
  }
  return `movie:${id}`;
}

function streamId(params) {
  const imdb = String(params.imdbId || "").trim();
  if (imdb) return imdb;
  const tmdb = String(params.tmdbId || "").trim();
  return tmdb ? `tmdb${tmdb}` : "";
}

function buildScrapePath(scraperId, params) {
  const kind = mediaKind(params);
  const id = streamId(params);
  if (!id) return null;
  const q = new URLSearchParams();
  if (params.tmdbId) q.set("tmdbId", String(params.tmdbId));
  if (params.title || params.queryTitle) {
    q.set("title", String(params.title || params.queryTitle));
  }
  if (params.year) q.set("year", String(params.year));
  if (kind === "tv") {
    q.set("season", String(params.seasonId || 1));
    q.set("episode", String(params.episodeId || 1));
  }
  return `/scrape/${scraperId}/${kind}/${id}?${q.toString()}`;
}

function isPlayableUrl(url, typeHint) {
  const u = String(url || "");
  if (!u || !/^https?:\/\//i.test(u)) return false;
  if (/hubcloud\.|drive\/|folder|download/i.test(u) && !/\.m3u8|\.mp4/i.test(u)) {
    return false;
  }
  const t = String(typeHint || "").toLowerCase();
  if (t.includes("m3u8") || t.includes("hls") || t.includes("mpegurl")) return true;
  if (t.includes("mp4") || t.includes("video")) return true;
  if (/\.m3u8(\?|$)/i.test(u) || /\/master\.m3u8/i.test(u)) return true;
  if (/\.mp4(\?|$)/i.test(u)) return true;
  // FilmU worker proxies often wrap real streams
  if (/workers\.dev\/\?url=/i.test(u) || /wormhole\.filmu\.in\/proxy/i.test(u)) {
    return true;
  }
  return false;
}

/**
 * FilmU wormhole wraps the real CDN URL + headers. Prefer the inner URL so
 * our /proxy can forge the CDN Referer (wormhole often rejects foreign Origins).
 */
function unwrapWormhole(url) {
  try {
    const u = new URL(String(url));
    if (!/wormhole\.filmu\.in$/i.test(u.hostname)) return null;
    if (!/\/proxy\//i.test(u.pathname)) return null;
    const inner = u.searchParams.get("url");
    if (!inner || !/^https?:\/\//i.test(inner)) return null;
    let headers = {};
    try {
      headers = JSON.parse(u.searchParams.get("headers") || "{}");
    } catch {
      headers = {};
    }
    return {
      url: inner,
      referer: headers.Referer || headers.referer || null,
      origin: headers.Origin || headers.origin || null,
      userAgent: headers["User-Agent"] || headers["user-agent"] || null,
    };
  } catch {
    return null;
  }
}

function normalizeSource(item, scraper, provider) {
  if (!item) return null;
  let url = item.workerProxyUrl || item.url || item.file || item.src || null;
  if (!url) return null;
  url = String(url);
  if (url.startsWith("/")) {
    // Relative FilmU proxy paths
    if (url.startsWith("/proxy/")) {
      url = `https://wormhole.filmu.in${url}`;
    } else {
      url = `${FILMU_ORIGIN}${url}`;
    }
  }
  if (!isPlayableUrl(url, item.type || item.format)) return null;

  const hdrs = item.headers && typeof item.headers === "object" ? item.headers : {};
  let referer =
    hdrs.Referer ||
    hdrs.referer ||
    provider.referer ||
    `${FILMU_ORIGIN}/`;
  let origin =
    hdrs.Origin || hdrs.origin || provider.origin || FILMU_ORIGIN;

  const unwrapped = unwrapWormhole(url);
  if (unwrapped) {
    url = unwrapped.url;
    if (unwrapped.referer) referer = unwrapped.referer;
    if (unwrapped.origin) origin = unwrapped.origin;
    // Keep FilmU as fallback origin when CDN is picky
    if (!origin) origin = FILMU_ORIGIN;
  } else if (/wormhole\.filmu\.in/i.test(url)) {
    // Talk to wormhole as FilmU — other Origins get "Origin not allowed"
    referer = `${FILMU_ORIGIN}/`;
    origin = FILMU_ORIGIN;
  }

  const isMp4 =
    /\.mp4(\?|$)/i.test(url) || /video\/mp4/i.test(String(item.type || ""));
  const quality = String(
    item.quality || item.name || item.label || item.server || "Auto",
  );

  return {
    quality,
    type: isMp4 ? "mp4" : "hls",
    format: isMp4 ? "mp4" : "m3u8",
    url,
    host: safeHost(url),
    backup: true,
    referer,
    origin,
    blockRedirects: provider.blockRedirects !== false,
    streamripScraper: scraper.id,
    language: item.language || item.lang || null,
  };
}

async function probePlayable(source, signal) {
  try {
    const res = await fetch(source.url, {
      method: "GET",
      signal,
      headers: {
        Accept: "*/*",
        Range: "bytes=0-2047",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: source.referer || `${FILMU_ORIGIN}/`,
        Origin: source.origin || FILMU_ORIGIN,
      },
      redirect: "follow",
    });
    // 200 or 206 Partial Content
    if (!res.ok && res.status !== 206) return false;
    const buf = Buffer.from(await res.arrayBuffer()).subarray(0, 64);
    const head = buf.toString("utf8");
    if (head.startsWith("#EXTM3U")) return true;
    if (source.format === "mp4" && (res.ok || res.status === 206)) return true;
    if (buf[0] === 0x47) return true;
    const box = buf.length >= 8 ? buf.subarray(4, 8).toString("ascii") : "";
    if (box === "ftyp" || box === "moof") return true;
    return false;
  } catch {
    return false;
  }
}

async function fetchOneScraper(scraper, params, provider, signal) {
  const path = buildScrapePath(scraper.id, params);
  if (!path) {
    return {
      ok: false,
      server: scraper.label,
      backup: true,
      error: "Missing id",
    };
  }
  const b64 = Buffer.from(path, "utf8").toString("base64");
  const url = `${FILMU_PROXY}?b64path=${encodeURIComponent(b64)}`;

  try {
    const res = await fetch(url, {
      signal,
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Origin: FILMU_ORIGIN,
        Referer: `${FILMU_ORIGIN}/`,
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        server: scraper.label,
        backup: true,
        error: `HTTP ${res.status}`,
      };
    }
    const json = await res.json();
    if (json?.error) {
      return {
        ok: false,
        server: scraper.label,
        backup: true,
        error: String(json.error),
      };
    }
    const raw = Array.isArray(json?.sources) ? json.sources : [];
    const sources = [];
    const seen = new Set();
    for (const item of raw) {
      const s = normalizeSource(item, scraper, provider);
      if (!s || seen.has(s.url)) continue;
      seen.add(s.url);
      sources.push(s);
    }
    if (!sources.length) {
      return {
        ok: false,
        server: scraper.label,
        backup: true,
        error: "No playable urls",
      };
    }

    // Drop links that already 403/500 before they hit the player
    const probeCtrl = new AbortController();
    const probeTimer = setTimeout(() => probeCtrl.abort(), 2200);
    let live = sources;
    try {
      const flags = await Promise.all(
        sources.map((s) => probePlayable(s, probeCtrl.signal)),
      );
      live = sources.filter((_, i) => flags[i]);
    } finally {
      clearTimeout(probeTimer);
    }
    if (!live.length) {
      return {
        ok: false,
        server: scraper.label,
        backup: true,
        error: "Sources unreachable",
      };
    }

    return {
      ok: true,
      server: scraper.label,
      priority: provider.priority,
      sources: live,
      subtitleCount: Array.isArray(json.subtitles) ? json.subtitles.length : 0,
      backup: true,
      referer: live[0].referer,
      origin: live[0].origin,
      streamripScraper: scraper.id,
    };
  } catch (err) {
    return {
      ok: false,
      server: scraper.label,
      backup: true,
      error: err.name === "AbortError" ? "timeout" : err.message,
    };
  }
}

/**
 * Fan-out all configured FilmU/Streamrip scrapers in parallel.
 * @returns {Promise<object[]>} list of per-scraper backup results
 */
async function fetchStreamripAll(provider, params) {
  const tmdbId = String(params.tmdbId || "").trim();
  if (!tmdbId && !params.imdbId) {
    return [
      {
        ok: false,
        server: provider.name || "Streamrip",
        backup: true,
        error: "Missing tmdbId",
      },
    ];
  }

  const scrapers =
    Array.isArray(provider.scrapers) && provider.scrapers.length
      ? provider.scrapers.map((s) =>
          typeof s === "string"
            ? { id: s, label: `Streamrip ${s}` }
            : { id: s.id, label: s.label || `Streamrip ${s.id}` },
        )
      : DEFAULT_SCRAPERS;

  const timeoutMs = Number(provider.timeoutMs) || 14000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const results = await Promise.all(
      scrapers.map((s) => fetchOneScraper(s, params, provider, ctrl.signal)),
    );
    return results;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  FILMU_PROXY,
  FILMU_ORIGIN,
  STREAMRIP_ORIGIN,
  DEFAULT_SCRAPERS,
  catalogKey,
  unwrapWormhole,
  fetchStreamripAll,
};
