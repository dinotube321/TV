import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { LoadingBlock } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";

type SiteSettings = {
  adsEnabled: boolean;
};

export function SettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await api<SiteSettings>("/api/admin/settings");
    setSettings(data);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  async function setAdsEnabled(adsEnabled: boolean) {
    if (!settings || saving) return;
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const next = await api<SiteSettings>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ adsEnabled }),
      });
      setSettings(next);
      setMsg(next.adsEnabled ? "Ads enabled." : "Ads disabled.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
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
    </>
  );
}
