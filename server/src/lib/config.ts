import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(root, ".env") });

const isProd =
  process.env.NODE_ENV === "production" ||
  process.env.PULSE_ENV === "production";

function requireSecret(name: string, fallbackDev: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isProd) {
    throw new Error(
      `${name} must be set to a strong random value in production`,
    );
  }
  return fallbackDev;
}

const adminPassword = requireSecret("ADMIN_PASSWORD", "admin");
const adminJwtSecret = requireSecret(
  "ADMIN_JWT_SECRET",
  "dev-admin-secret-change-me",
);
const siteJwtSecret = requireSecret(
  "SITE_JWT_SECRET",
  "dev-site-secret-change-me",
);

if (isProd) {
  if (adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters in production");
  }
  if (adminJwtSecret.length < 32 || siteJwtSecret.length < 32) {
    throw new Error("JWT secrets must be at least 32 characters in production");
  }
  if (adminJwtSecret === siteJwtSecret) {
    throw new Error("ADMIN_JWT_SECRET and SITE_JWT_SECRET must differ");
  }
}

const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT) || 8787,
  tmdbApiKey: process.env.TMDB_API_KEY?.trim() || "",
  tmdbReadToken: process.env.TMDB_READ_TOKEN?.trim() || "",
  adminPassword,
  adminJwtSecret,
  siteJwtSecret,
  contentDir: process.env.CONTENT_DIR?.trim()
    ? path.resolve(process.env.CONTENT_DIR)
    : path.join(root, "content"),
  /** Private server data (users) — never served as static files. */
  dataDir: process.env.DATA_DIR?.trim()
    ? path.resolve(process.env.DATA_DIR)
    : path.join(root, "server", "data"),
  root,
  isProd,
  corsOrigins:
    corsOrigins.length > 0
      ? corsOrigins
      : [
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://localhost:5175",
          "http://127.0.0.1:5175",
        ],
};

/** Constant-time string compare via SHA-256 digests. */
export function safeEqualString(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a, "utf8").digest();
  const hb = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function tmdbConfigured() {
  return Boolean(config.tmdbApiKey || config.tmdbReadToken);
}
