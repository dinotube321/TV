/**
 * Remember which Streamrip/backup server last played successfully per title.
 * Stored outside public web root.
 */
const fs = require("fs");
const path = require("path");

const PREFS_PATH = path.join(__dirname, "..", "data", "source-prefs.json");

let cache = null;
let writeChain = Promise.resolve();

function ensureDir() {
  const dir = path.dirname(PREFS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(PREFS_PATH, "utf8"));
    if (!cache || typeof cache !== "object") cache = { prefs: {} };
    if (!cache.prefs) cache.prefs = {};
  } catch {
    cache = { prefs: {} };
  }
  return cache;
}

function save(data) {
  ensureDir();
  const tmp = `${PREFS_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, PREFS_PATH);
  cache = data;
}

function withLock(fn) {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function getPreferredServer(key) {
  if (!key) return null;
  const data = load();
  const entry = data.prefs[key];
  if (!entry || !entry.server) return null;
  const { aliasServer } = require("./serverAliases");
  return { ...entry, server: aliasServer(entry.server) };
}

function setPreferredServer(key, { server, scraper, quality } = {}) {
  if (!key || !server) return Promise.resolve(null);
  return withLock(async () => {
    const data = load();
    data.prefs[key] = {
      server: String(server),
      scraper: scraper ? String(scraper) : undefined,
      quality: quality ? String(quality) : undefined,
      updatedAt: new Date().toISOString(),
      hits: (data.prefs[key]?.hits || 0) + 1,
    };
    save(data);
    return data.prefs[key];
  });
}

module.exports = {
  PREFS_PATH,
  getPreferredServer,
  setPreferredServer,
  catalogKey: require("./streamrip").catalogKey,
};
