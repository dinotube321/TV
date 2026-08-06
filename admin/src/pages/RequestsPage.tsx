import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState, LoadingBlock } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";

type MediaRequest = {
  id: string;
  mediaType: "movie" | "tv";
  tmdbId: string;
  title: string;
  year?: string;
  seasonId?: string;
  episodeId?: string;
  note?: string;
  status: "open" | "done" | "dismissed";
  createdAt: string;
  updatedAt: string;
};

type ListResponse = {
  count: number;
  openCount: number;
  requests: MediaRequest[];
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

function detailLabel(r: MediaRequest) {
  if (r.mediaType === "tv") {
    return `TV · S${r.seasonId || 1} E${r.episodeId || 1}`;
  }
  return r.year ? `Movie · ${r.year}` : "Movie";
}

export function RequestsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MediaRequest | null>(null);

  const load = useCallback(async () => {
    const next = await api<ListResponse>("/api/admin/media-requests");
    setData(next);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "open") return data.requests.filter((r) => r.status === "open");
    return data.requests;
  }, [data, filter]);

  async function setStatus(r: MediaRequest, status: MediaRequest["status"]) {
    setBusyId(r.id);
    setError("");
    setMsg("");
    try {
      const res = await api<{ request: MediaRequest }>(
        `/api/admin/media-requests/${encodeURIComponent(r.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );
      setData((prev) => {
        if (!prev) return prev;
        const requests = prev.requests.map((x) =>
          x.id === res.request.id ? res.request : x,
        );
        return {
          count: requests.length,
          openCount: requests.filter((x) => x.status === "open").length,
          requests,
        };
      });
      setMsg(
        status === "done"
          ? `Marked “${r.title}” done.`
          : status === "dismissed"
            ? `Dismissed “${r.title}”.`
            : `Reopened “${r.title}”.`,
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
      await api(`/api/admin/media-requests/${encodeURIComponent(pendingDelete.id)}`, {
        method: "DELETE",
      });
      setMsg(`Removed request for “${pendingDelete.title}”.`);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <LoadingBlock label="Loading requests…" />;

  return (
    <>
      <PageHeader
        title="Requests"
        description="Titles viewers couldn’t play — find a source and mark them done."
        actions={
          <StatusBadge tone={data.openCount > 0 ? "warn" : "ok"}>
            {`${data.openCount} open`}
          </StatusBadge>
        }
      />

      {error ? <p className="error">{error}</p> : null}
      {msg ? <p className="success">{msg}</p> : null}

      <SectionCard
        title="Viewer requests"
        description="Submitted from the player when no stream servers worked."
        flush
        toolbar={
          <div className="field compact" style={{ margin: 0 }}>
            <label htmlFor="req-filter" className="srOnly">
              Filter
            </label>
            <select
              id="req-filter"
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value === "all" ? "all" : "open")
              }
            >
              <option value="open">Open only</option>
              <option value="all">All</option>
            </select>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            title={data.openCount === 0 ? "No open requests" : "Nothing here"}
            description={
              data.count === 0
                ? "When playback fails, viewers can request a title from the player."
                : "Switch the filter to see closed requests."
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>TMDB</th>
                <th>Status</th>
                <th>Requested</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="tableTitle">{r.title}</div>
                    <div className="tableMeta">{detailLabel(r)}</div>
                    {r.note ? <div className="tableMeta">{r.note}</div> : null}
                  </td>
                  <td className="tableMono">{r.tmdbId}</td>
                  <td>
                    <StatusBadge
                      tone={
                        r.status === "open"
                          ? "warn"
                          : r.status === "done"
                            ? "ok"
                            : "default"
                      }
                    >
                      {r.status}
                    </StatusBadge>
                  </td>
                  <td className="tableMeta">{formatDate(r.createdAt)}</td>
                  <td>
                    <div className="tableActions">
                      <Link
                        className="btn btnSm"
                        to={`/import?tmdbId=${encodeURIComponent(r.tmdbId)}&type=${r.mediaType}`}
                      >
                        Import
                      </Link>
                      {r.status === "open" ? (
                        <button
                          type="button"
                          className="btn btnSm"
                          disabled={busyId === r.id}
                          onClick={() => setStatus(r, "done")}
                        >
                          Done
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btnSm"
                          disabled={busyId === r.id}
                          onClick={() => setStatus(r, "open")}
                        >
                          Reopen
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btnSm btnDanger"
                        disabled={busyId === r.id}
                        onClick={() => setPendingDelete(r)}
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
        title="Delete request?"
        message={
          pendingDelete
            ? `Remove the request for “${pendingDelete.title}”?`
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
