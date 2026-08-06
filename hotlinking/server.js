const express = require("express");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { Agent, setGlobalDispatcher } = require("undici");
const { decryptPayload } = require("./lib/decrypt");
const {
  listProviders: listBackupProviders,
  fetchAllBackups,
  fetchEmbedBackups,
  fetchEagerStreamBackups,
  preferredServerBoost,
  catalogKey,
  loadBackupConfig,
} = require("./lib/backup");
const { setPreferredServer } = require("./lib/sourcePrefs");
const { bingrProxyMiddleware, mountBingrApiProxy } = require("./lib/bingrProxy");
const { aliasServer, aliasExtractPayload } = require("./lib/serverAliases");

const execFileAsync = promisify(execFile);

// Reuse TLS sockets across extract + proxy (huge win vs new handshake per hop).
// allowH2:false — undici + Cloudflare/streamrk hangs reading H2 response bodies.
setGlobalDispatcher(
  new Agent({
    connections: 64,
    pipelining: 1,
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 120_000,
    allowH2: false,
    connect: { rejectUnauthorized: true },
  })
);

const app = express();
/** Keep fixed — do not inherit PORT from other apps in the monorepo. */
const PORT = Number(process.env.HOTLINK_PORT || 3847) || 3847;

/**
 * Block SSRF via the media proxy: no loopback / private / link-local / metadata.
 */
function isSafeProxyUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || ""));
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "metadata.google.internal" ||
    host === "metadata" ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1"
  ) {
    return false;
  }
  // IPv4 private / link-local / loopback
  if (
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      host
    )
  ) {
    return false;
  }
  // IPv6 unique-local / link-local
  if (/^(fc|fd|fe80)/i.test(host)) return false;
  // Bare decimal IP as integer host tricks
  if (/^\d+$/.test(host)) return false;
  return true;
}

const API = "https://api.speedracelight.com";
const DB = "https://db.speedracelight.com/3";
const FAKE_REFERER = "https://www.vidking.net/";
const FAKE_ORIGIN = "https://www.vidking.net";

/** Priority order — stop waiting once we have a playable preferred source */
const FAST_SERVERS = [
  { name: "Yoru", endpoint: "cdn/sources-with-title", priority: 0 },
];

const EXTRA_SERVERS = [
  { name: "Breach", endpoint: "m4uhd/sources-with-title", priority: 1 },
  { name: "Omen", endpoint: "lamovie/sources-with-title", priority: 2 },
  { name: "Cypher", endpoint: "downloader2/sources-with-title", priority: 3 },
  { name: "Neon", endpoint: "vsrc/sources-with-title", priority: 4 },
  { name: "Vyse", endpoint: "hdmovie/sources-with-title", priority: 5 },
  { name: "Raze", endpoint: "superflix/sources-with-title", priority: 6 },
];

const ALL_SERVERS = [...FAST_SERVERS, ...EXTRA_SERVERS];

const SERVER_TIMEOUT_MS = 3500;
const META_TTL_MS = 10 * 60_000;
const SEED_TTL_MS = 22_000; // API seed ttl ~30s; refresh early
const EXTRACT_TTL_MS = 12 * 60_000; // keep warm after detail-page prefetch

const VAST_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const browserHeaders = {
  "User-Agent": VAST_UA,
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

function vastLooksEmpty(xml) {
  if (!xml || xml.length < 80) return true;
  return !/<InLine[\s>]|<Wrapper[\s>]|<MediaFile[\s>]|<VASTAdTagURI[\s>]/i.test(xml);
}

/**
 * Fetch VAST XML via curl (browser-like TLS). MagSrv/ExoClick often return
 * empty VAST to Node/undici — curl + retries is required.
 */
async function fetchVastXml(target, { referer, attempts = 10 } = {}) {
  let last = "";
  const bust = (url, i) =>
    i === 0 ? url : `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}_${i}`;

  for (let i = 0; i < attempts; i++) {
    try {
      const args = [
        "-sL",
        "-4",
        "--compressed",
        "--max-time",
        "15",
        "-A",
        VAST_UA,
        "-H",
        "Accept: application/xml,text/xml,*/*;q=0.8",
        "-H",
        "Accept-Language: en-US,en;q=0.9",
        "-H",
        "Cache-Control: no-cache",
      ];
      if (referer) {
        args.push("-H", `Referer: ${referer}`, "-e", referer);
      } else if (/marzaent\.com|stripcash|sacdnssedge/i.test(target)) {
        args.push("-H", "Referer: https://s.magsrv.com/", "-e", "https://s.magsrv.com/");
      }
      args.push(bust(target, i));

      const { stdout } = await execFileAsync("curl", args, {
        maxBuffer: 8 * 1024 * 1024,
        encoding: "utf8",
      });
      last = stdout || "";
      if (!vastLooksEmpty(last)) return last;
    } catch (_) {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250 + i * 120));
  }

  return last;
}

/** Tiny TTL cache — warm extract returns in microseconds of CPU time */
class TtlCache {
  constructor() {
    this.map = new Map();
  }
  get(key) {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return hit.value;
  }
  set(key, value, ttlMs) {
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }
}

const metaCache = new TtlCache();
const seedCache = new TtlCache();
const extractCache = new TtlCache();

app.use(express.json({ limit: "32kb" }));

const PUBLIC_DIR = path.join(__dirname, "public");

// Bingr same-origin proxy under /bingr/* (must not steal Pulse /watch)
app.use(bingrProxyMiddleware);
mountBingrApiProxy(app);

function parseVidkingUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Empty URL");

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }

  const movie = url.pathname.match(/\/embed\/movie\/(\d+)/i);
  if (movie) return { mediaType: "movie", tmdbId: movie[1] };

  const tv = url.pathname.match(/\/embed\/tv\/(\d+)\/(\d+)\/(\d+)/i);
  if (tv) {
    return { mediaType: "tv", tmdbId: tv[1], seasonId: tv[2], episodeId: tv[3] };
  }

  throw new Error("Not a Vidking embed URL. Use /embed/movie/{id} or /embed/tv/{id}/{season}/{episode}");
}

function detectFormat(url) {
  if (!url) return "unknown";
  const u = url.toLowerCase();
  if (u.includes(".m3u8") || u.includes("mpegurl") || u.includes("/hls")) return "m3u8";
  if (u.includes(".mpd")) return "mpd";
  if (u.includes(".mp4")) return "mp4";
  if (u.includes(".mkv")) return "mkv";
  // tokenized CDN paths without extension — treat as HLS candidate
  if (/ironwallnet|wavechill|gymfocus|vimeos|itsdeskmate/i.test(u)) return "m3u8";
  return "unknown";
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
}

function proxyBase(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function edgeProxyBase() {
  return String(process.env.EDGE_PROXY_BASE || "")
    .trim()
    .replace(/\/$/, "");
}

/** True when media must tunnel through this app with no edge proxy (too slow for Classic). */
function slowMediaProxy() {
  if (edgeProxyBase()) return false;
  return (
    Boolean(process.env.RENDER) ||
    process.env.SLOW_MEDIA_PROXY === "1" ||
    process.env.NODE_ENV === "production"
  );
}

function isCorsReadyMediaUrl(url) {
  try {
    const host = new URL(String(url || "")).hostname.toLowerCase();
    return (
      host.endsWith(".workers.dev") ||
      host.endsWith(".workers.cloudflare.com")
    );
  } catch {
    return false;
  }
}

function proxyUrl(absoluteUrl, base, opts = {}) {
  // Relative path so playlists work through Vite (:5173) or direct (:3847)
  // without rewriting to a different host (which breaks canvas seek-preview).
  void base;

  // Already behind a CORS edge proxy — hit it from the browser (skip Render hop).
  if (isCorsReadyMediaUrl(absoluteUrl)) {
    return absoluteUrl;
  }

  const edge = edgeProxyBase();
  if (edge) {
    let u = `${edge}/?url=${encodeURIComponent(absoluteUrl)}`;
    if (opts.referer) u += `&referer=${encodeURIComponent(opts.referer)}`;
    if (opts.origin) u += `&origin=${encodeURIComponent(opts.origin)}`;
    return u;
  }

  let u = `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
  if (opts.referer) u += `&referer=${encodeURIComponent(opts.referer)}`;
  if (opts.origin) u += `&origin=${encodeURIComponent(opts.origin)}`;
  return u;
}

function resolveUrl(maybeRelative, playlistUrl) {
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  return new URL(maybeRelative, playlistUrl).toString();
}

/** Sniff real media type — CDNs often label MPEG-TS as image/jpeg. */
function sniffMediaContentType(bodyBuf, upstreamType, targetUrl) {
  const head = bodyBuf.subarray(0, 12);
  // MPEG-TS sync byte 0x47
  if (head.length && head[0] === 0x47) {
    return "video/mp2t";
  }
  // ISO BMFF / MP4
  if (head.length >= 8) {
    const box = head.subarray(4, 8).toString("ascii");
    if (box === "ftyp" || box === "moof" || box === "mdat" || box === "styp") {
      return "video/mp4";
    }
  }
  // WebVTT / text
  const textHead = bodyBuf.subarray(0, 10).toString("utf8");
  if (/^WEBVTT/i.test(textHead)) return "text/vtt";

  const ct = String(upstreamType || "").toLowerCase();
  if (ct.includes("mpegurl") || ct.includes("m3u8")) {
    return "application/vnd.apple.mpegurl";
  }
  if (ct.includes("mp2t") || ct.includes("mpegts")) return "video/mp2t";
  if (ct.includes("mp4") || ct.includes("octet-stream")) {
    if (/\.ts(\?|$)/i.test(targetUrl)) return "video/mp2t";
    if (/\.mp4(\?|$)/i.test(targetUrl)) return "video/mp4";
  }
  // Fake image extensions that are actually TS
  if (/image\/(jpeg|jpg|png|gif)/i.test(ct) && head[0] === 0x47) {
    return "video/mp2t";
  }
  return upstreamType || "application/octet-stream";
}

function htmlEscape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Faster playlist rewrite — single pass, no per-line URL ctor when absolute */
function rewritePlaylist(body, playlistUrl, base, proxyOpts = {}) {
  const lines = body.split(/\r?\n/);
  const out = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      out[i] = line;
      continue;
    }
    if (trimmed.charCodeAt(0) === 35) {
      // '#'
      if (trimmed.includes("URI=")) {
        out[i] = line.replace(/URI="([^"]+)"/gi, (_, uri) => {
          return `URI="${proxyUrl(resolveUrl(uri, playlistUrl), base, proxyOpts)}"`;
        });
      } else {
        out[i] = line;
      }
      continue;
    }
    out[i] = proxyUrl(resolveUrl(trimmed, playlistUrl), base, proxyOpts);
  }
  return out.join("\n");
}

async function fetchJson(url, { signal } = {}) {
  const res = await fetch(url, {
    signal,
    headers: { ...browserHeaders, Origin: FAKE_ORIGIN, Referer: FAKE_REFERER },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  }
  return res.json();
}

async function getMetadata(parsed) {
  const key =
    parsed.mediaType === "movie"
      ? `movie:${parsed.tmdbId}`
      : `tv:${parsed.tmdbId}:${parsed.seasonId}:${parsed.episodeId}`;

  const cached = metaCache.get(key);
  if (cached) return { ...cached, _cache: "hit" };

  if (parsed.mediaType === "movie") {
    const meta = await fetchJson(
      `${DB}/movie/${parsed.tmdbId}?append_to_response=external_ids`
    );
    const value = {
      title: meta.title,
      queryTitle: meta.title,
      year: (meta.release_date || "").slice(0, 4),
      imdbId: meta.external_ids?.imdb_id || "",
      poster: meta.poster_path ? `https://image.tmdb.org/t/p/w500${meta.poster_path}` : null,
    };
    return metaCache.set(key, value, META_TTL_MS);
  }

  const [show, ep] = await Promise.all([
    fetchJson(`${DB}/tv/${parsed.tmdbId}?append_to_response=external_ids`),
    fetchJson(
      `${DB}/tv/${parsed.tmdbId}/season/${parsed.seasonId}/episode/${parsed.episodeId}?language=en-US`
    ),
  ]);

  const value = {
    title: `${show.name} S${parsed.seasonId}E${parsed.episodeId}${ep.name ? ` — ${ep.name}` : ""}`,
    queryTitle: show.name,
    year: (show.first_air_date || "").slice(0, 4),
    imdbId: show.external_ids?.imdb_id || "",
    poster: (ep.still_path || show.poster_path)
      ? `https://image.tmdb.org/t/p/w500${ep.still_path || show.poster_path}`
      : null,
  };
  return metaCache.set(key, value, META_TTL_MS);
}

async function getSeed(tmdbId) {
  const cached = seedCache.get(tmdbId);
  if (cached) return cached;

  const data = await fetchJson(`${API}/seed?mediaId=${encodeURIComponent(tmdbId)}`);
  if (!data?.seed) throw new Error("Seed response missing seed");
  return seedCache.set(tmdbId, data.seed, Math.min(SEED_TTL_MS, (data.ttlMs || 30000) - 8000));
}

function withTimeout(ms, label) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`${label} timeout ${ms}ms`)), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

async function fetchServerSources(server, params, seed) {
  const t = withTimeout(SERVER_TIMEOUT_MS, server.name);
  try {
    const u = new URL(`${API}/${server.endpoint}`);
    u.searchParams.set("title", params.title);
    u.searchParams.set("mediaType", params.mediaType);
    u.searchParams.set("year", String(params.year));
    u.searchParams.set("episodeId", params.episodeId);
    u.searchParams.set("seasonId", params.seasonId);
    u.searchParams.set("tmdbId", params.tmdbId);
    u.searchParams.set("imdbId", params.imdbId || "");
    u.searchParams.set("enc", "2");
    u.searchParams.set("seed", seed);
    u.searchParams.set("_t", String(Date.now()));

    const res = await fetch(u.toString(), {
      signal: t.signal,
      headers: {
        ...browserHeaders,
        Origin: FAKE_ORIGIN,
        Referer: FAKE_REFERER,
        "Cache-Control": "no-cache",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text.slice(0, 160), server: server.name };
    }

    const encrypted = await res.text();
    const json = JSON.parse(decryptPayload(encrypted, seed, parseInt(params.tmdbId, 10)));
    const sources = [];
    const raw = json.sources || [];
    for (let i = 0; i < raw.length; i++) {
      const s = raw[i];
      if (!s?.url) continue;
      sources.push({
        quality: s.quality || "auto",
        type: s.type || null,
        format: detectFormat(s.url),
        url: s.url,
        host: safeHost(s.url),
      });
    }

    if (!sources.length) {
      return { ok: false, error: "No sources", server: server.name };
    }

    return {
      ok: true,
      server: server.name,
      priority: server.priority,
      sources,
      subtitleCount: (json.subtitles || []).length,
    };
  } catch (err) {
    return {
      ok: false,
      server: server.name,
      error: err.name === "AbortError" ? `timeout ${SERVER_TIMEOUT_MS}ms` : err.message,
    };
  } finally {
    t.clear();
  }
}

function pickPreferred(flat) {
  // Match Vidking default: prefer 1080p (qualities[0] style), not 2160p HEVC-TS.
  // Chrome/hls.js cannot demux HEVC in MPEG-TS → fragParsingError.
  const slow = slowMediaProxy();
  const hasEdge = Boolean(edgeProxyBase());
  const score = (s) => {
    let n = 0;
    if (s.preferredHit) n += 220; // last successful server for this title
    if (s.format === "m3u8") n += 100;
    else if (s.format === "mp4") n += 90;
    else if (s.format === "embed") n += 30; // playable backup page, below real streams
    const q = String(s.quality);
    // Prefer 1080p — 4K/HEVC often paints black (audio-only) in Chrome MSE
    if (/1080/i.test(q)) n += 50;
    else if (/720/i.test(q)) n += 40;
    else if (/play|auto|server/i.test(q)) n += 35;
    else if (/480/i.test(q)) n += 20;
    else if (/2160|4k/i.test(q)) n += 5; // available, but not default
    else if (/auto/i.test(q) && s.format === "embed") n += 10;
    const name = aliasServer(s.server);
    // Classic is primary when EDGE_PROXY_BASE is set; otherwise avoid it on Render
    if (name === "Classic") n += hasEdge ? 40 : slow ? -120 : 10;
    if (/^(Bear|Meteor|Hunter|Flying Flea|Scram)$/i.test(name)) n += slow ? 35 : 8;
    if (isCorsReadyMediaUrl(s.url) || isCorsReadyMediaUrl(s.playUrl)) n += slow ? 55 : 10;
    if (slow && s.format === "mp4") n += 40;
    if (s.backup) n -= slow ? 5 : 15; // on slow hosts, good backups beat Classic
    return n;
  };
  let best = null;
  let bestScore = -1;
  for (const s of flat) {
    const sc = score(s);
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  return best;
}

function mapPlayable(result, base) {
  const proxyOpts = {};
  if (result.referer) proxyOpts.referer = result.referer;
  if (result.origin) proxyOpts.origin = result.origin;
  return {
    server: result.server,
    ok: true,
    backup: !!result.backup,
    embed: !!result.embed,
    subtitleCount: result.subtitleCount,
    sources: result.sources.map((s) => {
      const isEmbed = s.format === "embed" || s.type === "embed";
      const srcOpts = {
        referer: s.referer || proxyOpts.referer,
        origin: s.origin || proxyOpts.origin,
      };
      return {
        ...s,
        backup: !!result.backup || !!s.backup,
        format: isEmbed ? "embed" : s.format,
        embedUrl: isEmbed ? s.embedUrl || s.url : undefined,
        // Embeds are loaded directly in an iframe — do not run through /proxy
        playUrl: isEmbed ? s.embedUrl || s.url : proxyUrl(s.url, base, srcOpts),
        rawUrl: s.url,
      };
    }),
  };
}

function mapBackupResults(rawResults, base) {
  return rawResults.map((out) => {
    if (out.ok) return mapPlayable(out, base);
    return {
      server: out.server,
      ok: false,
      backup: true,
      error: out.error,
      status: out.status,
    };
  });
}

/**
 * Parallel extract:
 * 1) meta + seed in parallel (cached)
 * 2) fan-out servers in parallel
 * 3) resolve as soon as a preferred m3u8 exists (don't wait for slow/failing scrapers)
 * 4) backup.json providers when full=1, backup=1, or primary has no playable source
 */
async function extractAll(parsed, req, { full = false, backup = false } = {}) {
  const t0 = performance.now();
  const base = proxyBase(req);
  const wantBackup = full || backup;
  const cacheKey = `${parsed.mediaType}:${parsed.tmdbId}:${parsed.seasonId || 0}:${parsed.episodeId || 0}:full=${full ? 1 : 0}:backup=${wantBackup ? 1 : 0}`;

  const hitFrom = (key) => {
    const warm = extractCache.get(key);
    if (!warm) return null;
    return {
      ...warm,
      timing: {
        totalMs: Number((performance.now() - t0).toFixed(3)),
        cache: "hit",
        phaseMs: warm.timing?.phaseMs || {},
      },
    };
  };

  // Exact key, then sibling backup/full keys (prefetch may warm a different flag)
  const warmExact = hitFrom(cacheKey);
  if (warmExact) return warmExact;
  const baseId = `${parsed.mediaType}:${parsed.tmdbId}:${parsed.seasonId || 0}:${parsed.episodeId || 0}`;
  for (const alt of [
    `${baseId}:full=0:backup=1`,
    `${baseId}:full=1:backup=1`,
    `${baseId}:full=0:backup=0`,
  ]) {
    if (alt === cacheKey) continue;
    const altHit = hitFrom(alt);
    if (altHit?.preferred) return altHit;
  }

  const tMetaSeed = performance.now();
  const [meta, seed] = await Promise.all([getMetadata(parsed), getSeed(parsed.tmdbId)]);
  const metaSeedMs = performance.now() - tMetaSeed;

  const params = {
    title: meta.queryTitle,
    queryTitle: meta.queryTitle,
    mediaType: parsed.mediaType,
    year: meta.year,
    episodeId: parsed.episodeId || "1",
    seasonId: parsed.seasonId || "1",
    tmdbId: parsed.tmdbId,
    imdbId: meta.imdbId || "",
  };

  const servers = full ? ALL_SERVERS : FAST_SERVERS;
  const tServers = performance.now();

  const results = new Array(servers.length);
  let preferredFlat = null;
  let settled = 0;

  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    servers.forEach((server, idx) => {
      fetchServerSources(server, params, seed).then((out) => {
        settled += 1;
        if (out.ok) {
          const mapped = mapPlayable(out, base);
          results[idx] = mapped;
          const flatPiece = mapped.sources.map((s) => ({ server: mapped.server, ...s }));
          const pick = pickPreferred(flatPiece);
          if (pick && pick.format === "m3u8") {
            preferredFlat = pickPreferred([
              ...(preferredFlat ? [preferredFlat] : []),
              pick,
            ]);
            // Yoru/Classic is enough locally — on Render without EDGE_PROXY wait for backups
            if (server.priority === 0 && (!slowMediaProxy() || edgeProxyBase())) {
              finish();
            }
          }
        } else {
          results[idx] = {
            server: server.name,
            ok: false,
            error: out.error,
            status: out.status,
          };
        }

        if (settled === servers.length) finish();
        if (
          !full &&
          preferredFlat?.server === "Yoru" &&
          (!slowMediaProxy() || edgeProxyBase())
        ) {
          finish();
        }
      });
    });
  });

  // No drain — return the instant Yoru (or first) source is ready
  const drainMs = preferredFlat ? 0 : full ? 200 : 600;
  const drainDeadline = Date.now() + drainMs;
  while (settled < servers.length && Date.now() < drainDeadline) {
    await new Promise((r) => setTimeout(r, 8));
  }

  let serverResults = results.map((r, i) =>
    r || { server: servers[i].name, ok: false, error: "pending/skipped" }
  );

  // Instant embeds only (FilmU URL map — no network). Always cheap to attach.
  const embedMapped = mapBackupResults(fetchEmbedBackups(params), base);

  const primaryFlat = results
    .filter((r) => r && r.ok)
    .flatMap((r) => r.sources.map((s) => ({ server: r.server, ...s })));
  const primaryPreferred = preferredFlat || pickPreferred(primaryFlat);
  const hasPrimaryM3u8 =
    primaryPreferred && primaryPreferred.format === "m3u8";

  // FAST PATH: primary already playable → return immediately.
  // Streamrip/Bingr/Vixsrc used to be awaited here (≤14s) even after Yoru won —
  // that alone caused 5–15s cold starts. Client fetchFullServers enriches later.
  let eagerMapped = [];
  let backupResults = [];
  const needBackup =
    wantBackup || full || !hasPrimaryM3u8;

  if (needBackup) {
    const tBackup = performance.now();
    // When primary failed, don't wait the full Streamrip budget — first playable wins
    const eagerBudget = hasPrimaryM3u8 ? 0 : 4500;
    const [eagerRaw, rawBackups] = await Promise.all([
      fetchEagerStreamBackups(params, {
        browserHeaders,
        budgetMs: wantBackup || full ? 0 : eagerBudget,
      }),
      wantBackup || full
        ? fetchAllBackups(params, {
            seed,
            browserHeaders,
            skipEmbed: true,
            skipTypes: ["vixsrc", "bingr", "streamrip", "filmu", "vidcodin", "fontaine"],
          })
        : Promise.resolve([]),
    ]);
    eagerMapped = mapBackupResults(eagerRaw, base);
    backupResults = mapBackupResults(rawBackups, base);
    console.info(
      `[backup] fetched ${backupResults.length} network + ${eagerMapped.length} eager-stream + ${embedMapped.length} embed in ${(performance.now() - tBackup).toFixed(0)}ms`,
    );
  } else {
    // Background: warm backup cache for server menu / failover (does not block Play)
    Promise.resolve()
      .then(() => fetchEagerStreamBackups(params, { browserHeaders }))
      .then((eagerRaw) => {
        const mapped = mapBackupResults(eagerRaw, base);
        const okSources = mapped
          .filter((r) => r.ok)
          .flatMap((r) => r.sources.map((s) => ({ server: r.server, ...s })));
        if (!okSources.length) return;
        const warm = extractCache.get(cacheKey);
        if (!warm) return;
        const names = new Set((warm.servers || []).map((r) => r.server));
        const mergedServers = [
          ...(warm.servers || []),
          ...mapped.filter((r) => !names.has(r.server)),
        ];
        const mergedFlat = preferredServerBoost(
          [
            ...(warm.sources || []),
            ...okSources.filter(
              (s) =>
                !(warm.sources || []).some((w) => w.playUrl === s.playUrl),
            ),
          ],
          params,
        );
        const enriched = {
          ...warm,
          sources: mergedFlat,
          servers: mergedServers,
          preferred: pickPreferred(mergedFlat) || warm.preferred,
        };
        extractCache.set(cacheKey, enriched, EXTRACT_TTL_MS);
        const baseId = `${parsed.mediaType}:${parsed.tmdbId}:${parsed.seasonId || 0}:${parsed.episodeId || 0}`;
        for (const alt of [
          `${baseId}:full=0:backup=0`,
          `${baseId}:full=0:backup=1`,
        ]) {
          if (alt !== cacheKey) extractCache.set(alt, enriched, EXTRACT_TTL_MS);
        }
      })
      .catch(() => {});
  }

  const attachedNames = new Set([
    ...eagerMapped.map((r) => r.server),
    ...embedMapped.map((r) => r.server),
    ...backupResults.map((r) => r.server),
  ]);
  serverResults = [
    ...serverResults.filter((r) => !attachedNames.has(r.server)),
    ...eagerMapped,
    ...backupResults,
    ...embedMapped,
  ];

  if (!preferredFlat) {
    const backupFlat = preferredServerBoost(
      [...eagerMapped, ...embedMapped, ...backupResults]
        .filter((r) => r.ok)
        .flatMap((r) => r.sources.map((s) => ({ server: r.server, ...s }))),
      params,
    );
    preferredFlat = pickPreferred(backupFlat);
  }

  const flat = preferredServerBoost(
    serverResults
      .filter((r) => r.ok)
      .flatMap((r) => r.sources.map((s) => ({ server: r.server, ...s }))),
    params,
  );

  // Re-score with preferred-server boost so remembered Streamrip servers win
  const preferred = pickPreferred(flat) || preferredFlat;

  const serversMs = performance.now() - tServers;
  const totalMs = performance.now() - t0;

  const payload = {
    meta: {
      title: meta.title,
      queryTitle: meta.queryTitle,
      year: meta.year,
      imdbId: meta.imdbId,
      poster: meta.poster,
      mediaType: parsed.mediaType,
      tmdbId: parsed.tmdbId,
      seasonId: parsed.seasonId || null,
      episodeId: parsed.episodeId || null,
    },
    preferred,
    sources: flat,
    servers: serverResults,
    backupProviders: listBackupProviders(),
    notes: {
      format: preferred?.format || null,
      mode: full ? "full" : wantBackup ? "backup" : "fast",
      hotlink:
        "CDN needs Referer. Proxy forges Referer (Vidking default or per-backup).",
    },
    timing: {
      totalMs: Number(totalMs.toFixed(3)),
      cache: "miss",
      phaseMs: {
        metaSeed: Number(metaSeedMs.toFixed(3)),
        servers: Number(serversMs.toFixed(3)),
      },
    },
  };

  // Cache whenever we have something playable (preferred or any source)
  if (preferred || (flat && flat.length)) {
    extractCache.set(cacheKey, payload, EXTRACT_TTL_MS);
    // Prefetch and Play often use different backup flags — share the payload
    const baseId = `${parsed.mediaType}:${parsed.tmdbId}:${parsed.seasonId || 0}:${parsed.episodeId || 0}`;
    for (const alt of [
      `${baseId}:full=0:backup=0`,
      `${baseId}:full=0:backup=1`,
    ]) {
      if (alt !== cacheKey) extractCache.set(alt, payload, EXTRACT_TTL_MS);
    }
  }
  return payload;
}

function sendExtract(res, data) {
  res.set("X-Extract-Ms", String(data.timing?.totalMs ?? ""));
  res.set("X-Extract-Cache", data.timing?.cache || "");
  // Hide upstream provider brands — Royal Enfield model aliases only
  res.json({ ok: true, ...aliasExtractPayload(data) });
}

function requireId(id) {
  if (!/^\d+$/.test(String(id || ""))) throw new Error("id must be a numeric TMDB id");
  return String(id);
}

function parsedMovie(id) {
  return { mediaType: "movie", tmdbId: requireId(id) };
}

function parsedShow(id, season, episode, query = {}) {
  const seasonId = String(season || query.s || query.season || "1");
  const episodeId = String(episode || query.e || query.episode || "1");
  if (!/^\d+$/.test(seasonId) || !/^\d+$/.test(episodeId)) {
    throw new Error("season/episode must be numeric");
  }
  return {
    mediaType: "tv",
    tmdbId: requireId(id),
    seasonId,
    episodeId,
  };
}

async function handleEmbedExtract(req, res, parsed) {
  const wantsJson =
    req.query.format === "json" ||
    (req.headers.accept || "").includes("application/json");
  const wantsM3u8 =
    req.query.format === "m3u8" ||
    /\.m3u8$/i.test(req.path) ||
    (req.headers.accept || "").includes("application/vnd.apple.mpegurl");

  // Browser / iframe → player shell (client extracts via /api/embed/...)
  if (!wantsJson && !wantsM3u8) {
    return res.sendFile(path.join(PUBLIC_DIR, "embed.html"));
  }

  const full = req.query.full === "1" || req.query.full === "true";
  const backup = req.query.backup === "1" || req.query.backup === "true";
  const data = await extractAll(parsed, req, { full, backup });

  if (!data.preferred?.playUrl) {
    return res.status(404).json({ ok: false, error: "No m3u8 source found", meta: data.meta, timing: data.timing });
  }

  if (wantsM3u8) {
    return res.redirect(302, data.preferred.playUrl);
  }

  return sendExtract(res, data);
}

/** Embed engine — same idea as Vidking URLs, backed by Vidking extract */
app.get(["/embed/movies/:id", "/embed/movie/:id"], async (req, res) => {
  try {
    await handleEmbedExtract(req, res, parsedMovie(req.params.id));
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get(
  [
    "/embed/shows/:id/:season/:episode",
    "/embed/show/:id/:season/:episode",
    "/embed/tv/:id/:season/:episode",
  ],
  async (req, res) => {
    try {
      await handleEmbedExtract(
        req,
        res,
        parsedShow(req.params.id, req.params.season, req.params.episode)
      );
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  }
);

app.get(["/embed/shows/:id", "/embed/show/:id", "/embed/tv/:id"], async (req, res) => {
  try {
    await handleEmbedExtract(req, res, parsedShow(req.params.id, null, null, req.query));
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/** Direct m3u8 redirects (for VLC / players that want a playlist URL) */
app.get("/embed/movies/:id/source.m3u8", async (req, res) => {
  try {
    req.query.format = "m3u8";
    await handleEmbedExtract(req, res, parsedMovie(req.params.id));
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/embed/shows/:id/:season/:episode/source.m3u8", async (req, res) => {
  try {
    req.query.format = "m3u8";
    await handleEmbedExtract(
      req,
      res,
      parsedShow(req.params.id, req.params.season, req.params.episode)
    );
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/** JSON API mirrors of the embed engine */
app.get("/api/embed/movies/:id", async (req, res) => {
  try {
    const data = await extractAll(parsedMovie(req.params.id), req, {
      full: req.query.full === "1",
      backup: req.query.backup === "1" || req.query.full === "1",
    });
    sendExtract(res, data);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get(
  ["/api/embed/shows/:id/:season/:episode", "/api/embed/shows/:id"],
  async (req, res) => {
    try {
      const parsed = parsedShow(
        req.params.id,
        req.params.season,
        req.params.episode,
        req.query
      );
      const data = await extractAll(parsed, req, {
        full: req.query.full === "1",
        backup: req.query.backup === "1" || req.query.full === "1",
      });
      sendExtract(res, data);
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  }
);

app.post("/api/extract", async (req, res) => {
  try {
    const parsed = parseVidkingUrl(req.body.url);
    const full = Boolean(req.body.full);
    const backup = Boolean(req.body.backup) || full;
    const data = await extractAll(parsed, req, { full, backup });
    sendExtract(res, data);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/extract", async (req, res) => {
  try {
    const parsed = parseVidkingUrl(req.query.url);
    const full = req.query.full === "1" || req.query.full === "true";
    const backup = req.query.backup === "1" || req.query.backup === "true" || full;
    const data = await extractAll(parsed, req, { full, backup });
    sendExtract(res, data);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/backup/providers", (_req, res) => {
  loadBackupConfig(true);
  res.json({
    ok: true,
    enabled: loadBackupConfig().enabled !== false,
    providers: listBackupProviders().map((p) => ({
      ...p,
      name: aliasServer(p.name),
    })),
  });
});

app.use(express.static(PUBLIC_DIR, { maxAge: 0, fallthrough: true }));

// Favicons Bingr asks for that aren't in public/
app.use(bingrProxyMiddleware);

/** Proxy VAST / VMAP XML so the player can resolve wrappers without CORS issues.
 *  ExoClick / MagSrv often return empty VAST to Node/undici TLS fingerprints,
 *  so we fetch via curl when available (falls back to undici).
 */
app.get("/api/vast", async (req, res) => {
  try {
    const target = String(req.query.url || "").trim();
    if (!target || !isSafeProxyUrl(target)) {
      return res.status(400).json({ ok: false, error: "Missing or invalid url" });
    }
    const referer = String(req.query.referer || "").trim() || undefined;
    if (referer && !/^https?:\/\//i.test(referer)) {
      return res.status(400).json({ ok: false, error: "Invalid referer" });
    }

    const text = await fetchVastXml(target, { referer, attempts: 10 });
    res.status(200);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.send(text);
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message || "VAST proxy failed" });
  }
});

/**
 * HTML proxy for third-party embed pages.
 * Used to keep iframe unsandboxed (player compatibility) while applying a
 * lightweight redirect blocker (no window.open / no top-nav hijack links).
 */
app.get("/proxy/embed", async (req, res) => {
  try {
    const target = String(req.query.url || "").trim();
    if (!target || !isSafeProxyUrl(target)) {
      return res.status(400).type("text/plain").send("Missing or invalid url");
    }

    const upstream = await fetch(target, {
      headers: browserHeaders,
      redirect: "follow",
    });
    if (!upstream.ok) {
      return res.status(upstream.status).type("text/plain").send("Upstream embed unavailable");
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      const body = Buffer.from(await upstream.arrayBuffer());
      res.set({
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      return res.status(200).send(body);
    }

    let html = await upstream.text();
    const pageUrl = new URL(target);
    const baseHref = `${pageUrl.origin}/`;
    // Same-origin HTML proxy: no iframe sandbox (Bingr refuses it), but we can
    // neutralize frame-busting / popups by spoofing top+parent and blocking open().
    const guard = `
<base href="${htmlEscape(baseHref)}">
<script>
(() => {
  const selfWin = window;
  const noopOpen = function () { return null; };
  try {
    Object.defineProperty(window, "top", { configurable: true, get() { return selfWin; } });
    Object.defineProperty(window, "parent", { configurable: true, get() { return selfWin; } });
  } catch (_) {}
  try {
    window.open = noopOpen;
    Object.defineProperty(window, "open", {
      configurable: true,
      writable: true,
      value: noopOpen,
    });
  } catch (_) {
    try { window.open = noopOpen; } catch (__) {}
  }
  const blockNav = (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    const t = (a.getAttribute("target") || "").toLowerCase();
    if (t === "_top" || t === "_parent" || t === "_blank") {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  document.addEventListener("click", blockNav, true);
  document.addEventListener("auxclick", blockNav, true);
})();
</script>`;

    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${guard}`);
    } else {
      html = `${guard}\n${html}`;
    }

    res.set({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return res.status(200).send(html);
  } catch (err) {
    return res.status(502).type("text/plain").send(`Embed proxy error: ${err.message}`);
  }
});

app.get("/proxy", async (req, res) => {
  try {
    const target = req.query.url;
    if (!target || !isSafeProxyUrl(target)) {
      return res.status(400).send("Missing or invalid url");
    }

    const referer =
      (typeof req.query.referer === "string" &&
        /^https?:\/\//i.test(req.query.referer) &&
        req.query.referer) ||
      FAKE_REFERER;
    const origin =
      (typeof req.query.origin === "string" &&
        /^https?:\/\//i.test(req.query.origin) &&
        req.query.origin) ||
      FAKE_ORIGIN;
    const proxyOpts = {};
    if (referer !== FAKE_REFERER) proxyOpts.referer = referer;
    if (origin !== FAKE_ORIGIN) proxyOpts.origin = origin;

    const reqHeaders = {
      ...browserHeaders,
      Referer: referer,
      Origin: origin,
    };
    // Progressive MP4 (Vidcodin) needs Range for seek / fast start
    if (typeof req.headers.range === "string" && req.headers.range) {
      reqHeaders.Range = req.headers.range;
    }

    const upstream = await fetch(target, {
      headers: reqHeaders,
      redirect: "follow",
    });

    const contentType = upstream.headers.get("content-type") || "";
    const status = upstream.status;

    if (!upstream.ok && status !== 206) {
      const failBody = await upstream.text().catch(() => "");
      return res
        .status(status)
        .type("text/plain")
        .send(`Upstream ${status}\n${failBody.slice(0, 400)}`);
    }

    const targetStr = String(target);
    const isPlaylistHint =
      contentType.includes("mpegurl") ||
      contentType.includes("m3u8") ||
      /\.m3u8(\?|$)/i.test(targetStr) ||
      /\/playlist\/[^/?]+/i.test(targetStr) ||
      contentType.includes("application/vnd.apple.mpegurl");

    // Classic CDN serves MPEG-TS segments as .jpg / image/* — must stream, not buffer.
    // Buffering multi‑MB segments on Render made HLS miss fragLoadingTimeOut → endless reload.
    const isTsSegment =
      /\.ts(\?|$)/i.test(targetStr) ||
      /\/seg-\d+/i.test(targetStr) ||
      (/\/vd\//i.test(targetStr) &&
        /\.(jpg|jpeg|png|bin)(\?|$)/i.test(targetStr)) ||
      /ironwallnet|rapidforest|wavechill|gymfocus|itsdeskmate|vimeos/i.test(
        targetStr,
      );

    const isProgressive =
      contentType.includes("mp4") ||
      contentType.includes("video/") ||
      contentType.includes("audio/") ||
      contentType.includes("octet-stream") ||
      /\.mp4(\?|$)/i.test(targetStr) ||
      /streamrk\.site\//i.test(targetStr) ||
      isTsSegment ||
      /image\/(jpeg|jpg|png|gif)/i.test(contentType);

    // Large progressive / segment files must stream — buffering hangs the player
    if (isProgressive && !isPlaylistHint) {
      const { Readable } = require("stream");
      let outType = contentType || "application/octet-stream";
      if (
        isTsSegment ||
        /image\/(jpeg|jpg|png|gif)/i.test(outType) ||
        contentType.includes("octet-stream")
      ) {
        outType =
          contentType.includes("mp4") || /\.mp4(\?|$)/i.test(targetStr)
            ? "video/mp4"
            : "video/mp2t";
      } else if (contentType.includes("mp4") || /\.mp4/i.test(targetStr)) {
        outType = "video/mp4";
      }
      const out = {
        "Content-Type": outType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers":
          "Content-Length, Content-Range, Accept-Ranges",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Cache-Control": "public, max-age=120",
      };
      const len = upstream.headers.get("content-length");
      const cr = upstream.headers.get("content-range");
      const ar = upstream.headers.get("accept-ranges");
      if (len) out["Content-Length"] = len;
      if (cr) out["Content-Range"] = cr;
      out["Accept-Ranges"] = ar || "bytes";

      res.status(status);
      res.set(out);
      if (!upstream.body) return res.end();
      return Readable.fromWeb(upstream.body).pipe(res);
    }

    const bodyBuf = Buffer.from(await upstream.arrayBuffer());
    const looksLikePlaylist = bodyBuf.subarray(0, 7).toString("utf8") === "#EXTM3U";

    if (isPlaylistHint || looksLikePlaylist) {
      const rewritten = rewritePlaylist(
        bodyBuf.toString("utf8"),
        target,
        proxyBase(req),
        proxyOpts,
      );
      res.set({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Cache-Control": "no-store",
      });
      return res.status(200).send(rewritten);
    }

    res.set({
      "Content-Type": sniffMediaContentType(bodyBuf, contentType, targetStr),
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "public, max-age=120",
    });
    return res.status(200).send(bodyBuf);
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).type("text/plain").send(`Proxy error: ${err.message}`);
    } else {
      try {
        res.destroy(err);
      } catch (_) {}
    }
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    referer: FAKE_REFERER,
    caches: {
      meta: metaCache.map.size,
      seed: seedCache.map.size,
      extract: extractCache.map.size,
    },
  });
});

/** Player ads flag (shared with content server’s settings.json). */
app.get("/api/settings", async (_req, res) => {
  try {
    const fs = require("fs").promises;
    const settingsPath = path.join(__dirname, "..", "content", "settings.json");
    const raw = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(raw);
    res.json({ adsEnabled: parsed.adsEnabled !== false });
  } catch {
    res.json({ adsEnabled: true });
  }
});

/**
 * Remember which server successfully played for a title.
 * Body: { mediaType, tmdbId, seasonId?, episodeId?, server, scraper?, quality? }
 */
app.post("/api/source-pref", async (req, res) => {
  try {
    const body = req.body || {};
    const mediaType = String(body.mediaType || "movie").toLowerCase();
    const tmdbId = String(body.tmdbId || "").trim();
    if (!tmdbId || !/^\d+$/.test(tmdbId)) {
      return res.status(400).json({ ok: false, error: "tmdbId required" });
    }
    const server = String(body.server || "").trim();
    if (!server) {
      return res.status(400).json({ ok: false, error: "server required" });
    }
    const params = {
      mediaType,
      tmdbId,
      seasonId: body.seasonId || "1",
      episodeId: body.episodeId || "1",
    };
    const key = catalogKey(params);
    const entry = await setPreferredServer(key, {
      server,
      scraper: body.scraper || body.streamripScraper,
      quality: body.quality,
    });
    res.json({ ok: true, key, pref: entry });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Forward “Request this title” to the content API (admin Requests panel).
 */
app.post("/api/media-requests", async (req, res) => {
  const base =
    process.env.CONTENT_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8787";
  try {
    const upstream = await fetch(`${base}/api/media-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(req.body || {}),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    try {
      res.json(JSON.parse(text));
    } catch {
      res.type("text/plain").send(text);
    }
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: `Content API unreachable: ${err.message}`,
    });
  }
});

app.post("/api/cache/clear", (req, res) => {
  const secret = process.env.HOTLINK_ADMIN_SECRET || process.env.ADMIN_PASSWORD;
  const provided =
    (typeof req.headers["x-admin-secret"] === "string" &&
      req.headers["x-admin-secret"]) ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : "");
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  metaCache.map.clear();
  seedCache.map.clear();
  extractCache.map.clear();
  res.json({ ok: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    const backups = listBackupProviders();
    console.log(`Embed engine → http://localhost:${PORT}`);
    console.log(`  /embed/movies/{tmdbId}`);
    console.log(`  /embed/shows/{tmdbId}/{season}/{episode}`);
    console.log(`  /embed/movies/{id}.m3u8  → redirect to proxied playlist`);
    console.log(`  backup providers: ${backups.length} enabled (edit backup.json)`);
  });
}

module.exports = { app, PORT };
