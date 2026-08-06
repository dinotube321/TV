import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { LoadingBlock } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";

type SiteSettings = {
  adsEnabled: boolean;
  streamServerOrder: string[];
};

export function SettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await api<SiteSettings>("/api/admin/settings");
    setSettings({
      adsEnabled: data.adsEnabled !== false,
      streamServerOrder: Array.isArray(data.streamServerOrder)
        ? data.streamServerOrder
        : [],
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
      setSettings({
        adsEnabled: next.adsEnabled !== false,
        streamServerOrder: Array.isArray(next.streamServerOrder)
          ? next.streamServerOrder
          : settings.streamServerOrder,
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
    // Optimistic UI
    setSettings({ ...settings, streamServerOrder: order });
    await savePatch(
      { streamServerOrder: order },
      "Stream server order saved. New plays use this order.",
    );
  }

  if (error && !settings) return <p className="error">{error}</p>;
  if (!settings) return <LoadingBlock label="Loading settings…" />;

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
        title="Stream server order"
        description="Top of the list starts first when a viewer hits Play. Drag priority with the arrows — put your fastest working servers first (e.g. Flying Flea, Hunter)."
      >
        <ol className="serverOrderList">
          {settings.streamServerOrder.map((name, index) => (
            <li key={name} className="serverOrderItem">
              <span className="serverOrderRank">{index + 1}</span>
              <span className="serverOrderName">{name}</span>
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
                    saving || index === settings.streamServerOrder.length - 1
                  }
                  aria-label={`Move ${name} down`}
                  onClick={() => moveServer(index, 1)}
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
      </SectionCard>
    </>
  );
}
