import path from "node:path";

/** Local catalog ids: movie-123 / tv-456 / show-456 */
const LOCAL_ID_RE = /^(movie|tv|show)-(\d{1,12})$/i;

/** UUID used for site user internal ids */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSafeLocalTitleId(id: string): boolean {
  if (typeof id !== "string" || id.length > 40) return false;
  if (id.includes("..") || id.includes("/") || id.includes("\\") || id.includes("\0")) {
    return false;
  }
  return LOCAL_ID_RE.test(id);
}

export function assertSafeLocalTitleId(id: string): string {
  const trimmed = String(id ?? "").trim();
  if (!isSafeLocalTitleId(trimmed)) {
    const err = new Error("Invalid title id");
    (err as { status?: number }).status = 400;
    throw err;
  }
  return trimmed;
}

export function isSafeUserRecordId(id: string): boolean {
  return typeof id === "string" && UUID_RE.test(id);
}

/** Resolve a path and ensure it stays under `root`. */
export function resolveUnderRoot(root: string, ...parts: string[]): string {
  const base = path.resolve(root);
  const resolved = path.resolve(base, ...parts);
  const rel = path.relative(base, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    const err = new Error("Path escapes content root");
    (err as { status?: number }).status = 400;
    throw err;
  }
  return resolved;
}
