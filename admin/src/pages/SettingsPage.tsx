import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { LoadingBlock } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";

type SiteSettings = {
  adsEnabled: boolean;
  streamServerOrder: string[];
  streamServersEnabled: Record<string, boolean>;
};

export function SettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await api<SiteSettings>("/api/admin/settings");
    const order = Array.isArray(data.streamServerOrder)
      ? data.streamServerOrder
      : [];
    const enabled: Record<string, boolean> = {};
    for (const name of order) {
      enabled[name] =
        data.streamServersEnabled?.[name] ?? name !== "Classic";
    }
    setSettings({
      adsEnabled: data.adsEnabled !== false,
      streamServerOrder: order,
      streamServersEnabled: enabled,
    });
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  async function savePatch(patch: Partial<SiteSettings>, okMsg: string) {
    if (!settings || saving) return;
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const next = await api<SiteSettings>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      const order = Array.isArray(next.streamServerOrder)
        ? next.streamServerOrder
        : settings.streamServerOrder;
      const enabled: Record<string, boolean> = {};
      for (const name of order) {
        enabled[name] =
          next.streamServersEnabled?.[name] ??
          settings.streamServersEnabled[name] ??
          name !== "Classic";
      }
      setSettings({
        adsEnabled: next.adsEnabled !== false,
        streamServerOrder: order,
        streamServersEnabled: enabled,
      });
      setMsg(okMsg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function setAdsEnabled(adsEnabled: boolean) {
    await savePatch(
      { adsEnabled },
      adsEnabled ? "Ads enabled." : "Ads disabled.",
    );
  }

  async function moveServer(index: number, dir: -1 | 1) {
    if (!settings || saving) return;
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= settings.streamServerOrder.length) return;
    const order = [...settings.streamServerOrder];
    const tmp = order[index]!;
    order[index] = order[nextIndex]!;
    order[nextIndex] = tmp;
    setSettings({ ...settings, streamServerOrder: order });
    await savePatch(
      { streamServerOrder: order },
      "Stream server order saved.",
    );
  }

  async function setServerEnabled(name: string, on: boolean) {
    if (!settings || saving) return;
    const streamServersEnabled = {
      ...settings.streamServersEnabled,
      [name]: on,
    };
    setSettings({ ...settings, streamServersEnabled });
    await savePatch(
      { streamServersEnabled },
      on ? `${name} enabled.` : `${name} disabled — won’t auto-start.`,
    );
  }

  if (error && !settings) return <p className="error">{error}</p>;
  if (!settings) return <LoadingBlock label="Loading settings…" />;

  const enabledCount = settings.streamServerOrder.filter(
    (n) => settings.streamServersEnabled[n] !== false,
  ).length;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Site-wide player and playback options."
        actions={
          <StatusBadge tone={settings.adsEnabled ? "ok" : "warn"}>
            {settings.adsEnabled ? "Ads on" : "Ads off"}
          </StatusBadge>
        }
      />

      {error ? <p className="error">{error}</p> : null}
      {msg ? <p className="success">{msg}</p> : null}

      <SectionCard
        title="Player ads"
        description="Site-wide default. You can also turn ads off for individual accounts on the Users page."
      >
        <div className="settingsRow">
          <div>
            <strong>Show ads in player</strong>
            <p className="muted">
              MagSrv banners and adblock detection while watching.
            </p>
          </div>
          <button
            type="button"
            className={`toggle ${settings.adsEnabled ? "on" : ""}`}
            role="switch"
            aria-checked={settings.adsEnabled}
            disabled={saving}
            onClick={() => setAdsEnabled(!settings.adsEnabled)}
          >
            <span className="toggleKnob" aria-hidden />
            <span className="toggleLabel">
              {settings.adsEnabled ? "Enabled" : "Disabled"}
            </span>
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Stream servers"
        description={`Enable/disable servers and set autoplay order. Top enabled server starts first. ${enabledCount} enabled.`}
      >
        <ol className="serverOrderList">
          {settings.streamServerOrder.map((name, index) => {
            const on = settings.streamServersEnabled[name] !== false;
            return (
              <li
                key={name}
                className={`serverOrderItem ${on ? "" : "isDisabled"}`}
              >
                <span className="serverOrderRank">{index + 1}</span>
                <span className="serverOrderName">{name}</span>
                <button
                  type="button"
                  className={`toggle ${on ? "on" : ""}`}
                  role="switch"
                  aria-checked={on}
                  disabled={saving}
                  onClick={() => setServerEnabled(name, !on)}
                >
                  <span className="toggleKnob" aria-hidden />
                  <span className="toggleLabel">
                    {on ? "On" : "Off"}
                  </span>
                </button>
                <span className="serverOrderActions">
                  <button
                    type="button"
                    className="btn btnGhost btnSm"
                    disabled={saving || index === 0}
                    aria-label={`Move ${name} up`}
                    onClick={() => moveServer(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btnGhost btnSm"
                    disabled={
                      saving ||
                      index === settings.streamServerOrder.length - 1
                    }
                    aria-label={`Move ${name} down`}
                    onClick={() => moveServer(index, 1)}
                  >
                    ↓
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      </SectionCard>
    </>
  );
}
