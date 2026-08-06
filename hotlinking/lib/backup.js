/**
 * Backup streaming providers from backup.json.
 * Supports: vidking (same API shape), http (JSON API), template (direct URL patterns).
 */
const fs = require("fs");
const path = require("path");
const { decryptPayload } = require("./decrypt");
const { fetchStreamripAll, unwrapWormhole } = require("./streamrip");
const { getPreferredServer, catalogKey } = require("./sourcePrefs");
const { sameServer } = require("./serverAliases");

const BACKUP_PATH = path.join(__dirname, "..", "backup.json");
const DEFAULT_TIMEOUT_MS = 5000;

let cachedConfig = null;
let cachedAt = 0;
const CONFIG_TTL_MS = 5_000;

function loadBackupConfig(force = false) {
  const now = Date.now();
  if (!force && cachedConfig && now - cachedAt < CONFIG_TTL_MS) {
    return cachedConfig;
  }
  try {
    const raw = fs.readFileSync(BACKUP_PATH, "utf8");
    cachedConfig = JSON.parse(raw);
    cachedAt = now;
    return cachedConfig;
  } catch (err) {
    cachedConfig = { version: 1, enabled: false, providers: [] };
    cachedAt = now;
    console.warn("[backup] failed to load backup.json:", err.message);
    return cachedConfig;
  }
}

function enabledProviders() {
  const cfg = loadBackupConfig();
  if (!cfg || cfg.enabled === false) return [];
  const list = Array.isArray(cfg.providers) ? cfg.providers : [];
  return list
    .filter((p) => p && p.enabled !== false && p.name)
    .map((p, i) => ({
      ...p,
      priority: Number.isFinite(p.priority) ? p.priority : 100 + i,
      backup: true,
    }))
    .sort((a, b) => a.priority - b.priority);
}

function listProviders() {
  return enabledProviders()
    .filter((p) => {
      const type = String(p.type || "").toLowerCase();
      // Streamrip expands into per-scraper servers (Titan/Atlas/…) — don't list a dead parent
      return type !== "streamrip" && type !== "filmu";
    })
    .map((p) => ({
      name: p.name,
      type: p.type || "http",
      priority: p.priority,
      backup: true,
    }));
}

function fillTemplate(str, params) {
  if (!str) return "";
  return String(str).replace(/\{(\w+)\}/g, (_, key) => {
    const v = params[key];
    return v == null ? "" : encodeURIComponent(String(v));
  });
}

/** Like fillTemplate but leave path segments readable (only encode when needed). */
function fillUrl(str, params) {
  if (!str) return "";
  return String(str).replace(/\{(\w+)\}/g, (_, key) => {
    const v = params[key];
    if (v == null) return "";
    // Title may need encoding; ids usually don't
    if (key === "title" || key === "queryTitle") return encodeURIComponent(String(v));
    return String(v);
  });
}

function getByPath(obj, dotted) {
  if (!dotted) return obj;
  return String(dotted)
    .split(".")
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function detectFormat(url) {
  const u = String(url || "");
  if (/\.m3u8(\?|$)/i.test(u) || /mpegurl|m3u8/i.test(u)) return "m3u8";
  if (/\.mp4(\?|$)/i.test(u)) return "mp4";
  return "unknown";
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
}

function withTimeout(ms, label) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`${label} timeout ${ms}ms`)), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

function normalizeSources(rawList, urlKey, qualityKey, typeKey) {
  const sources = [];
  const list = Array.isArray(rawList) ? rawList : [];
  for (const item of list) {
    if (!item) continue;
    let url = null;
    let quality = "auto";
    let type = null;

    if (typeof item === "string") {
      url = item;
    } else {
      url = item[urlKey] || item.url || item.file || item.src || item.link || null;
      quality = item[qualityKey] || item.quality || item.label || item.resolution || "auto";
      type = item[typeKey] || item.type || null;
    }
    if (!url || !/^https?:\/\//i.test(url)) continue;
    sources.push({
      quality: String(quality),
      type,
      format: detectFormat(url),
      url,
      host: safeHost(url),
      backup: true,
    });
  }
  return sources;
}

async function fetchVidkingBackup(provider, params, seed, browserHeaders) {
  const apiBase = (provider.apiBase || "https://api.speedracelight.com").replace(/\/$/, "");
  const endpoint = provider.endpoint || "cdn/sources-with-title";
  const t = withTimeout(provider.timeoutMs || DEFAULT_TIMEOUT_MS, provider.name);
  try {
    const u = new URL(`${apiBase}/${endpoint.replace(/^\//, "")}`);
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
        Origin: provider.origin || "https://www.vidking.net",
        Referer: provider.referer || "https://www.vidking.net/",
        "Cache-Control": "no-cache",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text.slice(0, 160), server: provider.name, backup: true };
    }
    const encrypted = await res.text();
    const json = JSON.parse(decryptPayload(encrypted, seed, parseInt(params.tmdbId, 10)));
    const sources = normalizeSources(json.sources || [], "url", "quality", "type");
    if (!sources.length) {
      return { ok: false, error: "No sources", server: provider.name, backup: true };
    }
    return {
      ok: true,
      server: provider.name,
      priority: provider.priority,
      sources,
      subtitleCount: (json.subtitles || []).length,
      backup: true,
      referer: provider.referer || null,
      origin: provider.origin || null,
    };
  } catch (err) {
    return {
      ok: false,
      server: provider.name,
      backup: true,
      error: err.name === "AbortError" ? `timeout` : err.message,
    };
  } finally {
    t.clear();
  }
}

async function fetchHttpBackup(provider, params, browserHeaders) {
  const t = withTimeout(provider.timeoutMs || DEFAULT_TIMEOUT_MS, provider.name);
  try {
    const url = fillUrl(provider.url, params);
    if (!url || !/^https?:\/\//i.test(url)) {
      return { ok: false, server: provider.name, backup: true, error: "Invalid url template" };
    }
    const method = (provider.method || "GET").toUpperCase();
    const headers = {
      ...browserHeaders,
      ...(provider.headers || {}),
    };
    if (provider.referer) headers.Referer = provider.referer;
    if (provider.origin) headers.Origin = provider.origin;

    const init = { method, signal: t.signal, headers };
    if (method !== "GET" && method !== "HEAD" && provider.body != null) {
      init.body =
        typeof provider.body === "string"
          ? fillTemplate(provider.body, params)
          : JSON.stringify(provider.body);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
    }

    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text.slice(0, 160), server: provider.name, backup: true };
    }

    const ct = res.headers.get("content-type") || "";
    let json;
    if (ct.includes("json") || ct.includes("text") || ct.includes("javascript")) {
      const text = await res.text();
      try {
        json = JSON.parse(text);
      } catch {
        // Plain m3u8 / URL response
        if (/^https?:\/\//i.test(text.trim())) {
          const sources = normalizeSources([text.trim()], "url", "quality", "type");
          return sources.length
            ? {
                ok: true,
                server: provider.name,
                priority: provider.priority,
                sources,
                subtitleCount: 0,
                backup: true,
                referer: provider.referer || null,
                origin: provider.origin || null,
              }
            : { ok: false, server: provider.name, backup: true, error: "No sources" };
        }
        return { ok: false, server: provider.name, backup: true, error: "Non-JSON response" };
      }
    } else {
      json = await res.json();
    }

    const resp = provider.response || {};
    const raw = getByPath(json, resp.sourcesPath || "sources");
    // Also accept common single-url shapes
    let list = raw;
    if (!list) {
      const single =
        json.url || json.stream || json.file || json.link || json.m3u8 || json.playlist;
      if (single) list = [single];
    }
    if (list && !Array.isArray(list) && typeof list === "object") {
      list = Object.entries(list).map(([quality, url]) =>
        typeof url === "string" ? { quality, url } : { quality, ...(url || {}) }
      );
    }

    const sources = normalizeSources(
      list,
      resp.urlKey || "url",
      resp.qualityKey || "quality",
      resp.typeKey || "type"
    );
    if (!sources.length) {
      return { ok: false, error: "No sources", server: provider.name, backup: true };
    }
    return {
      ok: true,
      server: provider.name,
      priority: provider.priority,
      sources,
      subtitleCount: 0,
      backup: true,
      referer: provider.referer || null,
      origin: provider.origin || null,
    };
  } catch (err) {
    return {
      ok: false,
      server: provider.name,
      backup: true,
      error: err.name === "AbortError" ? `timeout` : err.message,
    };
  } finally {
    t.clear();
  }
}

async function fetchTemplateBackup(provider, params) {
  const urls = Array.isArray(provider.urls) ? provider.urls : [];
  const sources = [];
  for (const entry of urls) {
    if (!entry) continue;
    const url = fillUrl(typeof entry === "string" ? entry : entry.url, params);
    if (!url || !/^https?:\/\//i.test(url)) continue;
    sources.push({
      quality: (typeof entry === "object" && entry.quality) || "auto",
      type: (typeof entry === "object" && entry.type) || null,
      format: detectFormat(url),
      url,
      host: safeHost(url),
      backup: true,
    });
  }
  if (!sources.length) {
    return { ok: false, server: provider.name, backup: true, error: "No template urls" };
  }
  return {
    ok: true,
    server: provider.name,
    priority: provider.priority,
    sources,
    subtitleCount: 0,
    backup: true,
    referer: provider.referer || null,
    origin: provider.origin || null,
  };
}

const VIXSRC_ORIGIN = "https://vixsrc.to";
const VIXSRC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Extract real HLS from vixsrc.to so playback uses our native player controls
 * (not their iframe UI). Order: /api → /embed → playlist + token.
 */
async function fetchVixsrcBackup(provider, params) {
  const t = withTimeout(provider.timeoutMs || 8000, provider.name);
  const mediaType = String(params.mediaType || "movie").toLowerCase();
  const isTv = mediaType === "tv" || mediaType === "show" || mediaType === "anime";
  const tmdbId = String(params.tmdbId || "").trim();
  if (!tmdbId) {
    t.clear();
    return { ok: false, server: provider.name, backup: true, error: "Missing tmdbId" };
  }

  const apiPath = isTv
    ? `/api/tv/${tmdbId}/${params.seasonId || 1}/${params.episodeId || 1}`
    : `/api/movie/${tmdbId}`;
  const pagePath = isTv
    ? `/tv/${tmdbId}/${params.seasonId || 1}/${params.episodeId || 1}`
    : `/movie/${tmdbId}`;
  const pageUrl = `${VIXSRC_ORIGIN}${pagePath}`;

  try {
    const apiRes = await fetch(`${VIXSRC_ORIGIN}${apiPath}`, {
      signal: t.signal,
      headers: {
        "User-Agent": VIXSRC_UA,
        Accept: "application/json,text/plain,*/*",
        Referer: `${VIXSRC_ORIGIN}/`,
        Origin: VIXSRC_ORIGIN,
      },
    });
    if (!apiRes.ok) {
      const text = await apiRes.text().catch(() => "");
      return {
        ok: false,
        status: apiRes.status,
        server: provider.name,
        backup: true,
        error: text.slice(0, 160) || `HTTP ${apiRes.status}`,
      };
    }
    const apiJson = await apiRes.json();
    const src = apiJson && apiJson.src;
    if (!src) {
      return { ok: false, server: provider.name, backup: true, error: "No embed src" };
    }
    const embedUrl = src.startsWith("http") ? src : `${VIXSRC_ORIGIN}${src}`;

    const embedRes = await fetch(embedUrl, {
      signal: t.signal,
      headers: {
        "User-Agent": VIXSRC_UA,
        Accept: "text/html,application/xhtml+xml",
        Referer: pageUrl,
        Origin: VIXSRC_ORIGIN,
      },
    });
    if (!embedRes.ok) {
      return {
        ok: false,
        status: embedRes.status,
        server: provider.name,
        backup: true,
        error: `Embed HTTP ${embedRes.status}`,
      };
    }
    const html = await embedRes.text();

    const token =
      (html.match(/['"]token['"]\s*:\s*['"]([a-f0-9]+)['"]/i) || [])[1] ||
      null;
    const expires =
      (html.match(/['"]expires['"]\s*:\s*['"]?(\d+)/i) || [])[1] || null;
    if (!token || !expires) {
      return { ok: false, server: provider.name, backup: true, error: "Missing token/expires" };
    }

    let streams = [];
    const streamsMatch = html.match(/window\.streams\s*=\s*(\[[\s\S]*?\]);/);
    if (streamsMatch) {
      try {
        streams = JSON.parse(streamsMatch[1]);
      } catch (_) {
        streams = [];
      }
    }

    let masterUrl =
      (html.match(/window\.masterPlaylist\s*=\s*\{[\s\S]*?url:\s*['"]([^'"]+)['"]/) ||
        [])[1] || null;
    if (masterUrl) masterUrl = masterUrl.replace(/\\\//g, "/");

    const canFhd = /canPlayFHD\s*=\s*true/i.test(html);
    const referer = provider.referer || `${VIXSRC_ORIGIN}/`;
    const origin = provider.origin || VIXSRC_ORIGIN;

    const buildPlaylist = (baseUrl) => {
      let u = String(baseUrl || "").replace(/\\\//g, "/");
      if (!u) return null;
      // Some scrapers append .m3u8; vixsrc playlists omit it
      u = u.replace(/(\/playlist\/[^/?]+)\.m3u8(?=[?#]|$)/i, "$1");
      const url = new URL(u, VIXSRC_ORIGIN);
      url.searchParams.set("token", token);
      url.searchParams.set("expires", expires);
      if (canFhd) url.searchParams.set("h", "1");
      return url.toString();
    };

    const sources = [];
    const seen = new Set();
    const push = (quality, baseUrl) => {
      const url = buildPlaylist(baseUrl);
      if (!url || seen.has(url)) return;
      seen.add(url);
      sources.push({
        quality: String(quality || "Auto"),
        type: "hls",
        format: "m3u8",
        url,
        host: safeHost(url),
        backup: true,
      });
    };

    if (Array.isArray(streams) && streams.length) {
      for (const s of streams) {
        if (!s || !s.url) continue;
        push(s.name || (s.active ? "Auto" : "Alt"), s.url);
      }
    }
    if (!sources.length && masterUrl) {
      push("Auto", masterUrl);
    }
    // Fallback: active stream or first playlist path
    if (!sources.length) {
      const rawUrl = (html.match(/(?:['"]url['"]|url)\s*:\s*['"]([^'"]+)['"]/) || [])[1];
      if (rawUrl) push("Auto", rawUrl.replace(/\\\//g, "/"));
    }

    if (!sources.length) {
      return { ok: false, server: provider.name, backup: true, error: "No playlist url" };
    }

    return {
      ok: true,
      server: provider.name,
      priority: provider.priority,
      sources,
      subtitleCount: 0,
      backup: true,
      referer,
      origin,
    };
  } catch (err) {
    return {
      ok: false,
      server: provider.name,
      backup: true,
      error: err.name === "AbortError" ? "timeout" : err.message,
    };
  } finally {
    t.clear();
  }
}

const BINGR_API = "https://api.bingr.one/api";
const BINGR_ORIGIN = "https://bingr.one";
const BINGR_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Vidcodin / Fontaine Astral — AES-GCM encrypted MP4 sources. */
const VIDCODIN_ASTRAL = "https://stream.fontaine.lol/astral";
const VIDCODIN_AES_KEY = Buffer.from(
  "bfdf4d46136f9e54f85699893a75261e7237a53d9015ee76d120aa54a1943bb0",
  "hex",
);
const VIDCODIN_ORIGIN = "https://vidcodin.net";
const VIDCODIN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function decryptVidcodinAstral(payload) {
  const crypto = require("crypto");
  const raw = String(payload || "");
  if (!raw.startsWith("as_")) return raw;
  const buf = Buffer.from(raw.slice(3), "hex");
  if (buf.length < 28) throw new Error("astral payload too short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(12, buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", VIDCODIN_AES_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * Extract MP4 streams from Vidcodin (Fontaine Astral) into our native player.
 * No iframe — redirects/popups from their embed never run.
 */
async function fetchVidcodinBackup(provider, params) {
  const t = withTimeout(provider.timeoutMs || 8000, provider.name);
  const mediaType = String(params.mediaType || "movie").toLowerCase();
  const isTv = mediaType === "tv" || mediaType === "show";
  const tmdbId = String(params.tmdbId || "").trim();
  if (!tmdbId) {
    t.clear();
    return { ok: false, server: provider.name, backup: true, error: "Missing tmdbId" };
  }

  const qs = new URLSearchParams({
    tmdbId,
    type: isTv ? "tv" : "movie",
  });
  if (isTv) {
    qs.set("seasonId", String(params.seasonId || 1));
    qs.set("episodeId", String(params.episodeId || 1));
  }

  try {
    const res = await fetch(`${VIDCODIN_ASTRAL}?${qs}`, {
      signal: t.signal,
      headers: {
        "User-Agent": VIDCODIN_UA,
        Accept: "application/json",
        Origin: VIDCODIN_ORIGIN,
        Referer: `${VIDCODIN_ORIGIN}/`,
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        server: provider.name,
        backup: true,
        error: `HTTP ${res.status}`,
      };
    }
    const json = await res.json();
    const qualities = json && json.qualities;
    if (!qualities || typeof qualities !== "object") {
      return { ok: false, server: provider.name, backup: true, error: "No qualities" };
    }

    const sources = [];
    const seen = new Set();
    for (const [label, enc] of Object.entries(qualities)) {
      try {
        const url = decryptVidcodinAstral(enc);
        if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
        seen.add(url);
        const q = /2160|4k/i.test(label)
          ? "2160p"
          : /1080/i.test(label)
            ? "1080p"
            : /720/i.test(label)
              ? "720p"
              : /480/i.test(label)
                ? "480p"
                : /360/i.test(label)
                  ? "360p"
                  : `${label}p`;
        sources.push({
          quality: q,
          type: "mp4",
          format: "mp4",
          url,
          host: safeHost(url),
          backup: true,
          blockRedirects: true,
        });
      } catch {
        /* skip bad payload */
      }
    }

    // Prefer higher qualities first
    sources.sort((a, b) => {
      const ha = Number((a.quality.match(/\d+/) || [0])[0]);
      const hb = Number((b.quality.match(/\d+/) || [0])[0]);
      return hb - ha;
    });

    if (!sources.length) {
      return { ok: false, server: provider.name, backup: true, error: "Decrypt yielded no urls" };
    }

    return {
      ok: true,
      server: provider.name,
      priority: provider.priority,
      sources,
      subtitleCount: 0,
      backup: true,
      referer: provider.referer || `${VIDCODIN_ORIGIN}/`,
      origin: provider.origin || VIDCODIN_ORIGIN,
    };
  } catch (err) {
    return {
      ok: false,
      server: provider.name,
      backup: true,
      error: err.name === "AbortError" ? "timeout" : err.message,
    };
  } finally {
    t.clear();
  }
}

/** Bingr Server 1 scrapers (tried in order — matches bingr.one watch page). */
const BINGR_SERVER1_DEFAULT = [
  "s11", // Sirius
  "s40", // DarkMatter
  "s12", // Quasar
  "s30", // Apollo
  "s1", // Miller
  "s2", // Mann
  "s3", // Edmunds
  "s4", // Luna
  "s5", // Aditya
];

/**
 * Extract real HLS from Bingr Server 1 (POST /api/stream).
 * Plays in our native player — not their iframe / Server 2 embeds.
 */
async function fetchBingrBackup(provider, params) {
  const t = withTimeout(provider.timeoutMs || 12000, provider.name);
  const mediaType = String(params.mediaType || "movie").toLowerCase();
  const isTv = mediaType === "tv" || mediaType === "show";
  const tmdbId = String(params.tmdbId || "").trim();
  if (!tmdbId) {
    t.clear();
    return { ok: false, server: provider.name, backup: true, error: "Missing tmdbId" };
  }

  const type = isTv ? "tv" : "movie";
  const query = {};
  if (params.title) query.title = String(params.title);
  if (params.year) query.year = String(params.year);
  if (isTv) {
    query.season = params.seasonId || 1;
    query.episode = params.episodeId || 1;
  }

  const servers = Array.isArray(provider.servers) && provider.servers.length
    ? provider.servers.map(String)
    : BINGR_SERVER1_DEFAULT;

  try {
    let payload = null;
    let usedSrv = null;
    const errors = [];

    // Race all Bingr servers in parallel — first with sources wins (was sequential ≤12s)
    const attempts = servers.map(async (srv) => {
      const res = await fetch(`${BINGR_API}/stream`, {
        method: "POST",
        signal: t.signal,
        headers: {
          "User-Agent": BINGR_UA,
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: BINGR_ORIGIN,
          Referer: `${BINGR_ORIGIN}/`,
        },
        body: JSON.stringify({ srv, t: type, id: tmdbId, query }),
      });
      if (!res.ok) throw new Error(`${srv}:HTTP ${res.status}`);
      const json = await res.json();
      if (!json || !Array.isArray(json.sources) || !json.sources.length) {
        throw new Error(`${srv}:empty`);
      }
      return { json, srv };
    });

    try {
      const won = await Promise.any(attempts);
      payload = won.json;
      usedSrv = won.srv;
    } catch (agg) {
      if (agg && Array.isArray(agg.errors)) {
        agg.errors.forEach((e) => errors.push(e?.message || String(e)));
      } else if (agg?.name === "AbortError") {
        throw agg;
      } else {
        errors.push(agg?.message || "all failed");
      }
    }

    if (!payload) {
      return {
        ok: false,
        server: provider.name,
        backup: true,
        error: errors.slice(0, 4).join("; ") || "No Bingr sources",
      };
    }

    const sources = [];
    const seen = new Set();
    for (const item of payload.sources) {
      if (!item || !item.url) continue;
      let url = String(item.url);
      if (seen.has(url)) continue;
      seen.add(url);
      // DASH is not supported by the native HLS player
      if (/\.mpd(\?|$)/i.test(url) || /application\/dash/i.test(String(item.type || ""))) {
        continue;
      }
      const hdrs = item.headers && typeof item.headers === "object" ? item.headers : {};
      let referer =
        hdrs.Referer || hdrs.referer || provider.referer || `${BINGR_ORIGIN}/`;
      let origin =
        hdrs.Origin || hdrs.origin || provider.origin || BINGR_ORIGIN;

      const unwrapped = unwrapWormhole(url);
      if (unwrapped) {
        url = unwrapped.url;
        if (unwrapped.referer) referer = unwrapped.referer;
        if (unwrapped.origin) origin = unwrapped.origin;
      } else if (/wormhole\.filmu\.in/i.test(url)) {
        referer = "https://embed.filmu.in/";
        origin = "https://embed.filmu.in";
      }

      const isMp4 = /\.mp4(\?|$)/i.test(url) || /video\/mp4/i.test(item.type || "");
      sources.push({
        quality: String(item.quality || item.label || item.name || "Auto"),
        type: isMp4 ? "mp4" : "hls",
        format: isMp4 ? "mp4" : "m3u8",
        url,
        host: safeHost(url),
        backup: true,
        referer,
        origin,
        language: item.language || null,
        bingrSrv: usedSrv,
      });
    }

    if (!sources.length) {
      return { ok: false, server: provider.name, backup: true, error: "No playable urls" };
    }

    // Prefer first source's CDN headers for playlist/segment proxy
    const referer = sources[0].referer;
    const origin = sources[0].origin;

    return {
      ok: true,
      server: provider.name,
      priority: provider.priority,
      sources,
      subtitleCount: Array.isArray(payload.subtitles) ? payload.subtitles.length : 0,
      backup: true,
      referer,
      origin,
      bingrSrv: usedSrv,
    };
  } catch (err) {
    return {
      ok: false,
      server: provider.name,
      backup: true,
      error: err.name === "AbortError" ? "timeout" : err.message,
    };
  } finally {
    t.clear();
  }
}

/**
 * Full-page embed providers (legacy iframe fallback).
 * Instant — no network fetch. Client plays them in a sandboxed iframe.
 */
function fetchEmbedBackup(provider, params) {
  const mediaType = String(params.mediaType || "movie").toLowerCase();
  const isTv = mediaType === "tv" || mediaType === "show" || mediaType === "anime";
  const template =
    (isTv ? provider.tvUrl || provider.urlTv : provider.movieUrl || provider.urlMovie) ||
    provider.url;
  if (!template) {
    return { ok: false, server: provider.name, backup: true, error: "Missing embed url template" };
  }
  const url = fillUrl(template, params);
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, server: provider.name, backup: true, error: "Invalid embed url" };
  }
  return {
    ok: true,
    server: provider.name,
    priority: provider.priority,
    sources: [
      {
        quality: provider.quality || "Auto",
        type: "embed",
        format: "embed",
        url,
        // Same-origin path so the player can inject redirect guards via /watch proxy
        embedUrl: (() => {
          try {
            const u = new URL(url);
            if (/bingr\.(one|live|app|net)$/i.test(u.hostname)) {
              // Namespaced so it does not collide with Pulse /watch/:id
              return `/bingr${u.pathname}${u.search}`;
            }
          } catch (_) {}
          return url;
        })(),
        host: safeHost(url),
        backup: true,
        blockRedirects: provider.blockRedirects !== false,
        bingrProxy: /bingr\.(one|live|app|net)/i.test(url),
      },
    ],
    subtitleCount: 0,
    backup: true,
    embed: true,
  };
}

/**
 * Fetch one backup provider → { ok, server, sources[], backup, referer?, origin? }
 */
async function fetchBackupProvider(provider, params, { seed, browserHeaders } = {}) {
  const type = String(provider.type || "http").toLowerCase();
  if (type === "vidking") {
    if (!seed) {
      return { ok: false, server: provider.name, backup: true, error: "Missing seed" };
    }
    return fetchVidkingBackup(provider, params, seed, browserHeaders || {});
  }
  if (type === "template") {
    return fetchTemplateBackup(provider, params);
  }
  if (type === "vixsrc") {
    return fetchVixsrcBackup(provider, params);
  }
  if (type === "vidcodin" || type === "fontaine") {
    return fetchVidcodinBackup(provider, params);
  }
  if (type === "bingr") {
    return fetchBingrBackup(provider, params);
  }
  if (type === "streamrip" || type === "filmu") {
    // Expanded by fetchEagerStreamBackups / fetchAllBackups
    return fetchStreamripAll(provider, params);
  }
  if (type === "embed") {
    return fetchEmbedBackup(provider, params);
  }
  // default http
  return fetchHttpBackup(provider, params, browserHeaders || {});
}

/** Instant embed providers only (no network). */
function fetchEmbedBackups(params) {
  return enabledProviders()
    .filter((p) => String(p.type || "").toLowerCase() === "embed")
    .map((p) => fetchEmbedBackup(p, params));
}

/** Eager stream extractors — always attached so failover can use native controls. */
function eagerStreamProviders() {
  return enabledProviders().filter((p) => {
    const type = String(p.type || "").toLowerCase();
    return (
      type === "vixsrc" ||
      type === "bingr" ||
      type === "streamrip" ||
      type === "filmu" ||
      type === "vidcodin" ||
      type === "fontaine" ||
      p.eager === true
    );
  });
}

async function flattenBackupFetch(provider, params, opts) {
  const out = await fetchBackupProvider(provider, params, opts);
  return Array.isArray(out) ? out : [out];
}

async function fetchEagerStreamBackups(params, { browserHeaders, budgetMs } = {}) {
  const providers = eagerStreamProviders();
  if (!providers.length) return [];

  // No budget → wait for all (background enrich / full extract)
  if (!budgetMs || budgetMs <= 0) {
    const nested = await Promise.all(
      providers.map((p) => flattenBackupFetch(p, params, { browserHeaders })),
    );
    return nested.flat();
  }

  // Failover path: return as soon as any provider yields a stream, or budget hits
  const collected = [];
  await new Promise((resolve) => {
    let finished = false;
    let timer = null;
    const done = () => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(done, budgetMs);
    let pending = providers.length;
    providers.forEach((p) => {
      flattenBackupFetch(p, params, { browserHeaders })
        .then((out) => {
          const list = Array.isArray(out) ? out : [out];
          collected.push(...list);
          const playable = list.some(
            (r) =>
              r &&
              r.ok &&
              Array.isArray(r.sources) &&
              r.sources.some(
                (s) =>
                  s &&
                  (s.format === "m3u8" ||
                    s.format === "mp4" ||
                    /\.m3u8(\?|$)/i.test(String(s.url || s.file || ""))),
              ),
          );
          if (playable) done();
        })
        .catch(() => {})
        .finally(() => {
          pending -= 1;
          if (pending <= 0) done();
        });
    });
  });
  return collected;
}

/**
 * Fan-out all enabled backup providers in parallel.
 */
async function fetchAllBackups(params, { seed, browserHeaders, onlyNames, skipEmbed, skipTypes } = {}) {
  let providers = enabledProviders();
  if (skipEmbed) {
    providers = providers.filter((p) => String(p.type || "").toLowerCase() !== "embed");
  }
  if (Array.isArray(skipTypes) && skipTypes.length) {
    const skip = new Set(skipTypes.map((t) => String(t).toLowerCase()));
    providers = providers.filter((p) => !skip.has(String(p.type || "").toLowerCase()));
  }
  if (Array.isArray(onlyNames) && onlyNames.length) {
    const set = new Set(onlyNames.map(String));
    providers = providers.filter((p) => set.has(p.name));
  }
  if (!providers.length) return [];

  const nested = await Promise.all(
    providers.map((p) => flattenBackupFetch(p, params, { seed, browserHeaders })),
  );
  return nested.flat();
}

/** Apply remembered preferred server boost when scoring sources. */
function preferredServerBoost(flat, params) {
  const key = catalogKey(params);
  const pref = getPreferredServer(key);
  if (!pref?.server || !Array.isArray(flat)) return flat;
  return flat.map((s) => {
    if (s && sameServer(s.server, pref.server)) {
      return { ...s, preferredHit: true };
    }
    return s;
  });
}

module.exports = {
  BACKUP_PATH,
  loadBackupConfig,
  enabledProviders,
  listProviders,
  fetchBackupProvider,
  fetchAllBackups,
  fetchEmbedBackups,
  fetchEagerStreamBackups,
  preferredServerBoost,
  catalogKey,
};
