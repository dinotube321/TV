import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { LoadingBlock } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";

export function SearchPage() {
  const [count, setCount] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    api<{ counts: { searchEntries: number } }>("/api/admin/dashboard")
      .then((d) => setCount(d.counts.searchEntries))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setInitialLoading(false));
  }, []);

  async function rebuild() {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      const res = await api<{ count: number }>("/api/admin/rebuild-search", {
        method: "POST",
      });
      setCount(res.count);
      setMsg(`Rebuilt search-index.json (${res.count} entries)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rebuild failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Search"
        description="The index updates on every import and delete. Rebuild only if it drifts from the library."
        actions={
          <Link className="btn btnGhost" to="/library">
            Open library
          </Link>
        }
      />

      <SectionCard title="Search index">
        {initialLoading ? (
          <LoadingBlock />
        ) : (
          <>
            <div className="row mb20" style={{ alignItems: "center" }}>
              <div className="stat" style={{ minWidth: 140 }}>
                <strong>{count ?? "—"}</strong>
                <span>Entries</span>
              </div>
              <StatusBadge tone={count != null && count > 0 ? "ok" : "warn"}>
                {count != null && count > 0 ? "Indexed" : "Empty"}
              </StatusBadge>
            </div>

            <p className="pageSub mb20">
              Use rebuild after manual file edits under <code>content/</code>, or
              if search results look out of sync with the library.
            </p>

            {error && <p className="error">{error}</p>}
            {msg && <p className="ok">{msg}</p>}

            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={rebuild}
            >
              {loading ? "Rebuilding…" : "Rebuild index"}
            </button>
          </>
        )}
      </SectionCard>
    </>
  );
}
