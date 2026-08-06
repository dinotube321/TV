import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState, LoadingBlock } from "../components/ui/EmptyState";
import { MoveCategoryDialog } from "../components/ui/MoveCategoryDialog";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import type { CatalogEntry, PageResult } from "../types";

export function LibraryPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [type, setType] = useState<"" | "movie" | "show">("");
  const [data, setData] = useState<PageResult<CatalogEntry> | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<CatalogEntry | null>(null);
  const [pendingMove, setPendingMove] = useState<CatalogEntry | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [qDebounced, type]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: "40",
    });
    if (qDebounced.trim()) params.set("q", qDebounced.trim());
    if (type) params.set("type", type);
    const result = await api<PageResult<CatalogEntry>>(
      `/api/admin/titles?${params}`,
    );
    setData(result);
  }, [page, qDebounced, type]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [load]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setBusy(id);
    setError("");
    setOk("");
    try {
      await api(`/api/admin/titles/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setPendingDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function reimport(t: CatalogEntry) {
    if (!t.tmdbId) return;
    setBusy(t.id);
    setError("");
    setOk("");
    try {
      await api("/api/admin/import", {
        method: "POST",
        body: JSON.stringify({
          tmdbId: t.tmdbId,
          type: t.type === "show" ? "tv" : "movie",
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-import failed");
    } finally {
      setBusy(null);
    }
  }

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const items = data?.items ?? [];
  const hasFilters = Boolean(qDebounced.trim() || type);

  return (
    <>
      <PageHeader
        title="Library"
        description={`${total.toLocaleString()} titles · page ${page} of ${totalPages}`}
        actions={
          <Link className="btn" to="/import">
            Import title
          </Link>
        }
      />

      <div className="filterBar">
        <div className="field compact fieldGrow">
          <label htmlFor="q">Search</label>
          <input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Title, id, genre, TMDB id"
          />
        </div>
        <div className="field compact fieldNarrow">
          <label htmlFor="type">Type</label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="">All</option>
            <option value="movie">Movies</option>
            <option value="show">TV</option>
          </select>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {ok && <p className="ok">{ok}</p>}

      <SectionCard title="Titles" flush>
        {loading && !data ? (
          <LoadingBlock />
        ) : items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No titles match" : "Library is empty"}
            description={
              hasFilters
                ? "Try a different search or clear the type filter."
                : "Import a title from TMDB to get started."
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Year</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="row gapSm" style={{ alignItems: "center" }}>
                      <img className="thumb" src={t.poster} alt="" />
                      <div>
                        <div className="tableTitle">{t.title}</div>
                        <div className="tableMeta">
                          {t.genres.slice(0, 3).join(" · ") || t.id}
                        </div>
                        <div className="tableMono">{t.id}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <StatusBadge tone={t.type === "movie" ? "accent" : "default"}>
                      {t.type === "movie" ? "Movie" : "TV"}
                    </StatusBadge>
                  </td>
                  <td>{t.year || "—"}</td>
                  <td>
                    <div className="tableActions">
                      <button
                        type="button"
                        className="btn btnGhost btnSm"
                        disabled={busy === t.id}
                        onClick={() => {
                          setOk("");
                          setError("");
                          setPendingMove(t);
                        }}
                      >
                        Move
                      </button>
                      {t.tmdbId != null && (
                        <button
                          type="button"
                          className="btn btnGhost btnSm"
                          disabled={busy === t.id}
                          onClick={() => reimport(t)}
                        >
                          Re-import
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btnDanger btnSm"
                        disabled={busy === t.id}
                        onClick={() => setPendingDelete(t)}
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

      {totalPages > 1 && (
        <div className="row" style={{ marginTop: 16, justifyContent: "center" }}>
          <button
            type="button"
            className="btn btnGhost"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="pageSub mb0">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btnGhost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete title?"
        message={
          pendingDelete
            ? `Delete “${pendingDelete.title}” (${pendingDelete.id})? This removes poster, hero, and info files.`
            : ""
        }
        confirmLabel="Delete"
        danger
        busy={busy === pendingDelete?.id}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <MoveCategoryDialog
        open={Boolean(pendingMove)}
        title={pendingMove}
        busy={busy === pendingMove?.id}
        onCancel={() => setPendingMove(null)}
        onMoved={async (res) => {
          setPendingMove(null);
          setOk(`Moved “${res.title.title}” from ${res.from} → ${res.to}`);
          await load();
        }}
      />
    </>
  );
}
