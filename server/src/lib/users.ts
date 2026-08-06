import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { isSafeUserRecordId } from "./safePath.js";

export interface SiteUser {
  id: string;
  userId: string;
  passwordHash: string;
  createdAt: string;
  /** When false, this user does not see player ads (even if site ads are on). */
  adsEnabled: boolean;
  /** Bumped to invalidate outstanding JWTs. */
  tokenVersion: number;
}

export type PublicSiteUser = {
  id: string;
  userId: string;
  createdAt: string;
  adsEnabled: boolean;
};

interface UsersFile {
  users: SiteUser[];
}

const USER_ID_RE = /^[a-zA-Z0-9_]{3,32}$/;

/** scrypt params — stored in hash string for forward-compatible verify. */
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function usersPath() {
  await fs.mkdir(config.dataDir, { recursive: true });
  return path.join(config.dataDir, "users.json");
}

/** Legacy location under public content — migrate away and delete. */
function legacyUsersPath() {
  return path.join(config.contentDir, "users.json");
}

function normalizeUser(
  raw: Partial<SiteUser> & { id: string; userId: string },
): SiteUser {
  return {
    id: raw.id,
    userId: raw.userId,
    passwordHash: raw.passwordHash ?? "",
    createdAt: raw.createdAt ?? new Date().toISOString(),
    adsEnabled: raw.adsEnabled !== false,
    tokenVersion:
      typeof raw.tokenVersion === "number" && Number.isFinite(raw.tokenVersion)
        ? Math.max(0, Math.floor(raw.tokenVersion))
        : 0,
  };
}

async function readFile(): Promise<UsersFile> {
  const primary = await usersPath();
  try {
    const raw = await fs.readFile(primary, "utf8");
    const parsed = JSON.parse(raw) as UsersFile;
    const users = Array.isArray(parsed.users)
      ? parsed.users
          .filter(
            (u) => u && typeof u.id === "string" && typeof u.userId === "string",
          )
          .map((u) => normalizeUser(u))
      : [];
    return { users };
  } catch {
    /* try migrate from public content tree */
  }

  try {
    const legacy = legacyUsersPath();
    const raw = await fs.readFile(legacy, "utf8");
    const parsed = JSON.parse(raw) as UsersFile;
    const users = Array.isArray(parsed.users)
      ? parsed.users
          .filter(
            (u) => u && typeof u.id === "string" && typeof u.userId === "string",
          )
          .map((u) => normalizeUser(u))
      : [];
    await writeFile({ users });
    await fs.unlink(legacy).catch(() => undefined);
    return { users };
  } catch {
    return { users: [] };
  }
}

async function writeFile(data: UsersFile) {
  const file = await usersPath();
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(tmp, file);
  try {
    await fs.chmod(file, 0o600);
  } catch {
    /* windows */
  }
}

function normalizeUserId(userId: string) {
  return userId.trim();
}

export function validateUserId(userId: string): string | null {
  const id = normalizeUserId(userId);
  if (!USER_ID_RE.test(id)) {
    return "User ID must be 3–32 characters (letters, numbers, underscore).";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (password.length > 128) {
    return "Password is too long.";
  }
  return null;
}

function hashPassword(password: string, salt?: Buffer): string {
  const s = salt ?? crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, s, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${s.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  try {
    if (stored.startsWith("scrypt$")) {
      const parts = stored.split("$");
      if (parts.length !== 6) return false;
      const N = Number(parts[1]);
      const r = Number(parts[2]);
      const p = Number(parts[3]);
      const salt = Buffer.from(parts[4], "hex");
      const expected = Buffer.from(parts[5], "hex");
      if (!salt.length || !expected.length) return false;
      const actual = crypto.scryptSync(password, salt, expected.length, {
        N,
        r,
        p,
        maxmem: SCRYPT.maxmem,
      });
      if (expected.length !== actual.length) return false;
      return crypto.timingSafeEqual(expected, actual);
    }

    // Legacy salt:hash (pre-hardening) — still verify, rehash on login
    const [saltHex, hashHex] = stored.split(":");
    if (!saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, salt, 64);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function needsRehash(stored: string): boolean {
  return !stored.startsWith("scrypt$");
}

export async function listUsers(): Promise<SiteUser[]> {
  const data = await readFile();
  return [...data.users].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function findUserByUserId(
  userId: string,
): Promise<SiteUser | null> {
  const id = normalizeUserId(userId).toLowerCase();
  const data = await readFile();
  return data.users.find((u) => u.userId.toLowerCase() === id) ?? null;
}

export async function findUserById(id: string): Promise<SiteUser | null> {
  if (!isSafeUserRecordId(id)) return null;
  const data = await readFile();
  return data.users.find((u) => u.id === id) ?? null;
}

export async function createUser(
  userId: string,
  password: string,
): Promise<SiteUser> {
  return withLock(async () => {
    const idErr = validateUserId(userId);
    if (idErr) throw new Error(idErr);
    const pwErr = validatePassword(password);
    if (pwErr) throw new Error(pwErr);

    const normalized = normalizeUserId(userId);
    const data = await readFile();
    if (
      data.users.some((u) => u.userId.toLowerCase() === normalized.toLowerCase())
    ) {
      throw new Error("That user ID is already taken.");
    }

    const user: SiteUser = {
      id: crypto.randomUUID(),
      userId: normalized,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      adsEnabled: true,
      tokenVersion: 0,
    };

    data.users.push(user);
    await writeFile(data);
    return user;
  });
}

export async function updateUser(
  id: string,
  patch: { adsEnabled?: boolean },
): Promise<SiteUser> {
  return withLock(async () => {
    if (!isSafeUserRecordId(id)) throw new Error("User not found");
    const data = await readFile();
    const idx = data.users.findIndex((u) => u.id === id);
    if (idx < 0) throw new Error("User not found");

    const current = data.users[idx];
    const next: SiteUser = {
      ...current,
      adsEnabled:
        typeof patch.adsEnabled === "boolean"
          ? patch.adsEnabled
          : current.adsEnabled,
    };
    data.users[idx] = next;
    await writeFile(data);
    return next;
  });
}

export async function deleteUser(id: string): Promise<boolean> {
  return withLock(async () => {
    if (!isSafeUserRecordId(id)) return false;
    const data = await readFile();
    const next = data.users.filter((u) => u.id !== id);
    if (next.length === data.users.length) return false;
    await writeFile({ users: next });
    return true;
  });
}

export async function authenticateUser(
  userId: string,
  password: string,
): Promise<SiteUser | null> {
  const user = await findUserByUserId(userId);
  if (!user) {
    // Dummy scrypt to reduce timing user-enumeration
    hashPassword(password, Buffer.alloc(16));
    return null;
  }
  if (!verifyPassword(password, user.passwordHash)) return null;

  if (needsRehash(user.passwordHash)) {
    await withLock(async () => {
      const data = await readFile();
      const idx = data.users.findIndex((u) => u.id === user.id);
      if (idx < 0) return;
      const newHash = hashPassword(password);
      data.users[idx] = {
        ...data.users[idx],
        passwordHash: newHash,
      };
      await writeFile(data);
      user.passwordHash = newHash;
    });
  }

  return user;
}

export function publicUser(user: SiteUser): PublicSiteUser {
  return {
    id: user.id,
    userId: user.userId,
    createdAt: user.createdAt,
    adsEnabled: user.adsEnabled !== false,
  };
}

export function adminUser(user: SiteUser): PublicSiteUser {
  return publicUser(user);
}
