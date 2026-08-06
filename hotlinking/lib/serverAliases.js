/**
 * Public server aliases — hide upstream provider names behind Royal Enfield models.
 * Internal extract may still use legacy keys; always run names through aliasServer()
 * before sending to the client or matching prefs.
 */
const ALIASES = {
  // Primary (Vidking scrapers)
  Yoru: "Classic",
  Breach: "Bullet",
  Omen: "GT",
  Cypher: "Interceptor",
  Neon: "Thunderbird",
  Vyse: "Goan",
  Raze: "Shotgun",

  // Streamrip / FilmU scrapers
  Streamrip: "Himalayan",
  "Streamrip Titan": "Himalayan",
  "Streamrip Atlas": "Meteor",
  "Streamrip Aura": "Hunter",
  "Streamrip Flax": "Scram",
  "Streamrip Nexus": "Guerrilla",

  // Backup providers
  Vidcodin: "Super Meteor",
  Vixsrc: "Bear",
  Bingr: "Flying Flea",
  "FilmU Embed": "Continental",

  // Identity (already aliased)
  Classic: "Classic",
  Bullet: "Bullet",
  GT: "GT",
  Interceptor: "Interceptor",
  Thunderbird: "Thunderbird",
  Goan: "Goan",
  Shotgun: "Shotgun",
  Himalayan: "Himalayan",
  Meteor: "Meteor",
  Hunter: "Hunter",
  Scram: "Scram",
  Guerrilla: "Guerrilla",
  "Super Meteor": "Super Meteor",
  Bear: "Bear",
  "Flying Flea": "Flying Flea",
  Continental: "Continental",
};

/** Canonical display names shown in the player + admin. */
const DISPLAY_SERVERS = [
  "Classic",
  "Bullet",
  "GT",
  "Interceptor",
  "Thunderbird",
  "Goan",
  "Shotgun",
  "Himalayan",
  "Meteor",
  "Hunter",
  "Scram",
  "Guerrilla",
  "Super Meteor",
  "Bear",
  "Flying Flea",
  "Continental",
];

/** Default autoplay order — edge-friendly servers first for Render. */
const DEFAULT_STREAM_SERVER_ORDER = [
  "Flying Flea",
  "Hunter",
  "Bear",
  "Meteor",
  "Scram",
  "Super Meteor",
  "Himalayan",
  "Guerrilla",
  "Continental",
  "Bullet",
  "GT",
  "Interceptor",
  "Thunderbird",
  "Goan",
  "Shotgun",
  "Classic",
];

function normalizeStreamServerOrder(input) {
  const seen = new Set();
  const out = [];
  const push = (name) => {
    const n = String(name || "").trim();
    if (!n || seen.has(n)) return;
    if (!DISPLAY_SERVERS.includes(n)) return;
    seen.add(n);
    out.push(n);
  };
  if (Array.isArray(input)) {
    for (const name of input) push(aliasServer(name));
  }
  for (const name of DEFAULT_STREAM_SERVER_ORDER) push(name);
  for (const name of DISPLAY_SERVERS) push(name);
  return out;
}

/** Display name for a server (never leak upstream brands). */
function aliasServer(name) {
  const raw = String(name || "").trim();
  if (!raw) return raw;
  if (ALIASES[raw]) return ALIASES[raw];
  // Streamrip Foo → try mapped; unknown scrapers get a generic RE-style name
  if (/^Streamrip\b/i.test(raw)) {
    return ALIASES[raw] || "Himalayan";
  }
  return raw;
}

function sameServer(a, b) {
  return aliasServer(a) === aliasServer(b);
}

/** Recursively rewrite `.server` / provider `.name` fields for API responses. */
function aliasExtractPayload(data) {
  if (!data || typeof data !== "object") return data;
  const out = { ...data };

  if (out.preferred && typeof out.preferred === "object") {
    out.preferred = {
      ...out.preferred,
      server: aliasServer(out.preferred.server),
    };
  }

  if (Array.isArray(out.sources)) {
    out.sources = out.sources.map((s) =>
      s && typeof s === "object"
        ? { ...s, server: aliasServer(s.server) }
        : s,
    );
  }

  if (Array.isArray(out.servers)) {
    out.servers = out.servers.map((srv) => {
      if (!srv || typeof srv !== "object") return srv;
      const next = { ...srv, server: aliasServer(srv.server) };
      if (Array.isArray(next.sources)) {
        next.sources = next.sources.map((s) =>
          s && typeof s === "object"
            ? { ...s, server: aliasServer(s.server) }
            : s,
        );
      }
      return next;
    });
  }

  if (Array.isArray(out.backupProviders)) {
    out.backupProviders = out.backupProviders.map((p) => {
      if (typeof p === "string") return aliasServer(p);
      if (p && typeof p === "object") {
        return { ...p, name: aliasServer(p.name) };
      }
      return p;
    });
  }

  return out;
}

module.exports = {
  ALIASES,
  DISPLAY_SERVERS,
  DEFAULT_STREAM_SERVER_ORDER,
  aliasServer,
  sameServer,
  aliasExtractPayload,
  normalizeStreamServerOrder,
};
