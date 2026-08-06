import fs from "node:fs/promises";
import path from "node:path";
import { paths } from "./store.js";

export interface SiteSettings {
  adsEnabled: boolean;
}

const DEFAULTS: SiteSettings = {
  adsEnabled: true,
};

async function settingsPath() {
  return path.join(paths().root, "settings.json");
}

export async function readSettings(): Promise<SiteSettings> {
  try {
    const raw = await fs.readFile(await settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<SiteSettings>;
    return {
      adsEnabled:
        typeof parsed.adsEnabled === "boolean"
          ? parsed.adsEnabled
          : DEFAULTS.adsEnabled,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writeSettings(
  next: Partial<SiteSettings>,
): Promise<SiteSettings> {
  const current = await readSettings();
  const merged: SiteSettings = {
    adsEnabled:
      typeof next.adsEnabled === "boolean"
        ? next.adsEnabled
        : current.adsEnabled,
  };
  await fs.writeFile(
    await settingsPath(),
    `${JSON.stringify(merged, null, 2)}\n`,
    "utf8",
  );
  return merged;
}
