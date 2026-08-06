import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { EmptyState, LoadingBlock } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import type { Dashboard } from "../types";

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Dashboard>("/api/admin/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <LoadingBlock label="Loading overview…" />;

  const { counts } = data;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Catalog health and quick next steps."
        actions={
          <StatusBadge tone={data.tmdbConfigured ? "ok" : "warn"}>
            {data.tmdbConfigured ? "TMDB connected" : "TMDB not configured"}
          </StatusBadge>
        }
      />

      <div className="statGroups">
        <div>
          <p className="statGroupLabel">Catalog</p>
          <div className="gridStats">
            <div className="stat">
              <strong>{counts.titles}</strong>
              <span>Titles</span>
            </div>
            <div className="stat">
              <strong>{counts.movies}</strong>
              <span>Movies</span>
            </div>
            <div className="stat">
              <strong>{counts.shows}</strong>
              <span>TV Shows</span>
            </div>
          </div>
        </div>
        <div>
          <p className="statGroupLabel">Homepage</p>
          <div className="gridStats">
            <div className="stat">
              <strong>{counts.heroes}</strong>
              <span>Heroes</span>
            </div>
            <div className="stat">
              <strong>{counts.shelves}</strong>
              <span>Shelves</span>
            </div>
          </div>
        </div>
        <div>
          <p className="statGroupLabel">Search</p>
          <div className="gridStats">
            <div className="stat">
              <strong>{counts.searchEntries}</strong>
              <span>Index entries</span>
            </div>
          </div>
        </div>
        <div>
          <p className="statGroupLabel">Requests</p>
          <div className="gridStats">
            <div className="stat">
              <strong>{counts.openRequests ?? 0}</strong>
              <span>Open</span>
            </div>
          </div>
        </div>
      </div>

      <p className="statGroupLabel">Next steps</p>
      <div className="actionGrid">
        <Link className="actionCard" to="/import">
          <strong>Import title</strong>
          <span>Pull metadata from TMDB into the library</span>
        </Link>
        <Link className="actionCard" to="/library">
          <strong>Manage library</strong>
          <span>Search, re-import, or remove titles</span>
        </Link>
        <Link className="actionCard" to="/homepage">
          <strong>Edit homepage</strong>
          <span>Heroes and shelves for the front page</span>
        </Link>
        <Link className="actionCard" to="/requests">
          <strong>Viewer requests</strong>
          <span>Titles that failed playback and need a source</span>
        </Link>
      </div>

      <SectionCard title="Recent imports" flush>
        {data.recent.length === 0 ? (
          <EmptyState
            title="No titles yet"
            description="Import a TMDB id to get started."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>Title</th>
                <th>Type</th>
                <th>Year</th>
                <th>Imported</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((t) => (
                <tr key={t.id}>
                  <td>
                    <img className="thumb" src={t.poster} alt="" />
                  </td>
                  <td className="tableTitle">{t.title}</td>
                  <td>
                    <StatusBadge tone={t.type === "movie" ? "accent" : "default"}>
                      {t.type === "movie" ? "Movie" : "TV"}
                    </StatusBadge>
                  </td>
                  <td>{t.year || "—"}</td>
                  <td className="tableMono">
                    {t.importedAt
                      ? new Date(t.importedAt).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </>
  );
}
