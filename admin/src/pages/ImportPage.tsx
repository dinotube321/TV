import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import type { CatalogEntry } from "../types";

interface Preview {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  year: number;
  synopsis: string;
  poster: string;
  backdrop: string;
}

export function ImportPage() {
  const [searchParams] = useSearchParams();
  const [tmdbId, setTmdbId] = useState(() => searchParams.get("tmdbId") || "");
  const [type, setType] = useState<"movie" | "tv">(() =>
    searchParams.get("type") === "tv" ? "tv" : "movie",
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<CatalogEntry | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = searchParams.get("tmdbId");
    if (id) setTmdbId(id);
    const t = searchParams.get("type");
    if (t === "tv" || t === "movie") setType(t);
  }, [searchParams]);

  async function onPreview(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const data = await api<Preview>(
        `/api/admin/preview?tmdbId=${encodeURIComponent(tmdbId)}&type=${type}`,
      );
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function onImport() {
    if (!preview) return;
    setLoading(true);
    setError("");
    try {
      const data = await api<{ entry: CatalogEntry }>("/api/admin/import", {
        method: "POST",
        body: JSON.stringify({ tmdbId: preview.tmdbId, type: preview.type }),
      });
      setResult(data.entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Import"
        description="Enter a TMDB id, preview metadata, then commit to the library."
        actions={
          <Link className="btn btnGhost" to="/library">
            Open library
          </Link>
        }
      />

      <SectionCard
        title="Import from TMDB"
        description="We fetch metadata, write poster/hero WebP + info JSON, and update data.json."
      >
        <form onSubmit={onPreview}>
          <div className="row">
            <div className="field compact fieldGrow">
              <label htmlFor="tmdbId">TMDB ID</label>
              <input
                id="tmdbId"
                inputMode="numeric"
                value={tmdbId}
                onChange={(e) => setTmdbId(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 693134"
              />
            </div>
            <div className="field compact fieldNarrow">
              <label htmlFor="type">Type</label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as "movie" | "tv")}
              >
                <option value="movie">Movie</option>
                <option value="tv">TV Show</option>
              </select>
            </div>
            <button
              className="btn btnGhost"
              type="submit"
              disabled={!tmdbId || loading}
            >
              {loading && !preview ? "Loading…" : "Preview"}
            </button>
          </div>
        </form>

        {error && <p className="error">{error}</p>}

        {result && (
          <div className="ok" style={{ marginTop: 16 }}>
            Imported <strong>{result.title}</strong> ({result.id}).{" "}
            <Link to="/library">View in library</Link>
          </div>
        )}

        {preview && (
          <div className="previewCard">
            <img src={preview.poster} alt="" />
            <div>
              <div className="row gapSm mb16" style={{ alignItems: "center" }}>
                <h2 className="mt0 mb0" style={{ fontSize: 22 }}>
                  {preview.title}
                </h2>
                <StatusBadge tone={preview.type === "movie" ? "accent" : "default"}>
                  {preview.type === "movie" ? "Movie" : "TV"}
                </StatusBadge>
              </div>
              <p className="pageSub" style={{ marginBottom: 8 }}>
                {preview.year || "—"} · TMDB {preview.tmdbId}
              </p>
              <p style={{ color: "var(--systemSecondary-onDark)", fontSize: 14, lineHeight: 1.5 }}>
                {preview.synopsis || "No synopsis available."}
              </p>
              <button
                type="button"
                className="btn"
                style={{ marginTop: 16 }}
                disabled={loading}
                onClick={onImport}
              >
                {loading ? "Importing…" : "Import to library"}
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </>
  );
}
