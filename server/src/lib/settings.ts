import fs from "node:fs/promises";
import path from "node:path";
import { paths } from "./store.js";

/** Keep in sync with hotlinking/lib/serverAliases.js DISPLAY_SERVERS. */
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
] as const;

/** Default autoplay order — fastest/edge-friendly first. */
export const DEFAULT_STREAM_SERVER_ORDER = [
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

export interface SiteSettings {
  adsEnabled: boolean;
  /** Display-name order for stream autoplay (first = highest priority). */
  streamServerOrder: string[];
  /** Per-server enable flags (display names). Disabled servers are never auto-started. */
  streamServersEnabled: Record<string, boolean>;
}

function normalizeStreamServerOrder(input: unknown): string[] {
  const allowed = new Set<string>(DISPLAY_SERVERS);
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (name: string) => {
    const n = String(name || "").trim();
    if (!n || seen.has(n) || !allowed.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  if (Array.isArray(input)) {
    for (const name of input) push(String(name));
  }
  for (const name of DEFAULT_STREAM_SERVER_ORDER) push(name);
  for (const name of DISPLAY_SERVERS) push(name);
  return out;
}

function normalizeStreamServersEnabled(
  input: unknown,
  order: string[],
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  // Classic is off by default — it is unreliable on Render
  for (const name of order) {
    out[name] = name !== "Classic";
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>,
    )) {
      const name = String(key || "").trim();
      if (!order.includes(name)) continue;
      if (typeof value === "boolean") out[name] = value;
    }
  }
  return out;
}

const DEFAULTS: SiteSettings = {
  adsEnabled: true,
  streamServerOrder: [...DEFAULT_STREAM_SERVER_ORDER],
  streamServersEnabled: normalizeStreamServersEnabled(
    null,
    DEFAULT_STREAM_SERVER_ORDER,
  ),
};

async function settingsPath() {
  return path.join(paths().root, "settings.json");
}

export async function readSettings(): Promise<SiteSettings> {
  try {
    const raw = await fs.readFile(await settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<SiteSettings>;
    const streamServerOrder = normalizeStreamServerOrder(
      parsed.streamServerOrder,
    );
    return {
      adsEnabled:
        typeof parsed.adsEnabled === "boolean"
          ? parsed.adsEnabled
          : DEFAULTS.adsEnabled,
      streamServerOrder,
      streamServersEnabled: normalizeStreamServersEnabled(
        parsed.streamServersEnabled,
        streamServerOrder,
      ),
    };
  } catch {
    return {
      adsEnabled: DEFAULTS.adsEnabled,
      streamServerOrder: [...DEFAULTS.streamServerOrder],
      streamServersEnabled: { ...DEFAULTS.streamServersEnabled },
    };
  }
}

export async function writeSettings(
  next: Partial<SiteSettings>,
): Promise<SiteSettings> {
  const current = await readSettings();
  const streamServerOrder = Array.isArray(next.streamServerOrder)
    ? normalizeStreamServerOrder(next.streamServerOrder)
    : current.streamServerOrder;
  const merged: SiteSettings = {
    adsEnabled:
      typeof next.adsEnabled === "boolean"
        ? next.adsEnabled
        : current.adsEnabled,
    streamServerOrder,
    streamServersEnabled: normalizeStreamServersEnabled(
      next.streamServersEnabled ?? current.streamServersEnabled,
      streamServerOrder,
    ),
  };
  await fs.writeFile(
    await settingsPath(),
    `${JSON.stringify(merged, null, 2)}\n`,
    "utf8",
  );
  return merged;
}
