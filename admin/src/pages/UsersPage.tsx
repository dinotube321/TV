import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState, LoadingBlock } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";

type SiteUser = {
  id: string;
  userId: string;
  createdAt: string;
  adsEnabled: boolean;
};

type UsersResponse = {
  count: number;
  users: SiteUser[];
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function UsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SiteUser | null>(null);

  const load = useCallback(async () => {
    const next = await api<UsersResponse>("/api/admin/users");
    setData(next);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data.users;
    return data.users.filter((u) => u.userId.toLowerCase().includes(needle));
  }, [data, q]);

  async function setUserAds(user: SiteUser, adsEnabled: boolean) {
    setBusyId(user.id);
    setError("");
    setMsg("");
    try {
      const res = await api<{ user: SiteUser }>(
        `/api/admin/users/${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ adsEnabled }),
        },
      );
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.map((u) => (u.id === res.user.id ? res.user : u)),
        };
      });
      setMsg(
        adsEnabled
          ? `Ads enabled for ${res.user.userId}.`
          : `Ads disabled for ${res.user.userId}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    setError("");
    setMsg("");
    try {
      await api(`/api/admin/users/${encodeURIComponent(pendingDelete.id)}`, {
        method: "DELETE",
      });
      setMsg(`Deleted ${pendingDelete.userId}.`);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <LoadingBlock label="Loading users…" />;

  return (
    <>
      <PageHeader
        title="Users"
        description="Site accounts (user ID + password). Toggle ads per user."
        actions={
          <StatusBadge tone={data.count > 0 ? "ok" : "warn"}>
            {`${data.count} ${data.count === 1 ? "user" : "users"}`}
          </StatusBadge>
        }
      />

      {error ? <p className="error">{error}</p> : null}
      {msg ? <p className="success">{msg}</p> : null}

      <SectionCard
        title="All accounts"
        description="Per-user ads only apply when site-wide ads are enabled in Settings."
        flush
        toolbar={
          <div className="field compact" style={{ margin: 0, minWidth: 200 }}>
            <label htmlFor="user-filter" className="srOnly">
              Filter
            </label>
            <input
              id="user-filter"
              type="search"
              placeholder="Filter by user ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            title={data.count === 0 ? "No users yet" : "No matches"}
            description={
              data.count === 0
                ? "Accounts appear here when someone signs up on the site."
                : "Try a different user ID filter."
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Created</th>
                <th>Ads</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="tableTitle">{u.userId}</div>
                    <div className="tableMono tableMeta">{u.id}</div>
                  </td>
                  <td className="tableMeta">{formatDate(u.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className={`toggle ${u.adsEnabled ? "on" : ""}`}
                      role="switch"
                      aria-checked={u.adsEnabled}
                      disabled={busyId === u.id}
                      onClick={() => setUserAds(u, !u.adsEnabled)}
                    >
                      <span className="toggleKnob" aria-hidden />
                      <span className="toggleLabel">
                        {u.adsEnabled ? "On" : "Off"}
                      </span>
                    </button>
                  </td>
                  <td>
                    <div className="tableActions">
                      <button
                        type="button"
                        className="btn btnSm btnDanger"
                        disabled={busyId === u.id}
                        onClick={() => setPendingDelete(u)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete user?"
        message={
          pendingDelete
            ? `Remove account “${pendingDelete.userId}”? They will need to sign up again.`
            : ""
        }
        confirmLabel="Delete"
        danger
        busy={!!pendingDelete && busyId === pendingDelete.id}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
