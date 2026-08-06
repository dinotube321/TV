import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PlayerShell } from "../components/PlayerShell/PlayerShell";
import { getTitleDetails, type Title } from "../data/catalog";
import { usePageMeta } from "../lib/usePageMeta";
import styles from "./Page.module.css";

export function WatchPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [title, setTitle] = useState<Title | null | undefined>(undefined);

  usePageMeta({
    title: title ? `Watch ${title.title}` : "Watch",
    description:
      "Playback opens third-party sources. Pulse does not host or store media files.",
    path: id ? `/watch/${id}` : "/watch",
    noindex: true,
  });

  useEffect(() => {
    if (!id) {
      setTitle(null);
      return;
    }
    getTitleDetails(id).then((t) => setTitle(t ?? null));
  }, [id]);

  const episode = useMemo(() => {
    if (!title?.episodes?.length) return null;
    const epId = params.get("ep");
    if (epId) {
      return title.episodes.find((e) => e.id === epId) ?? title.episodes[0];
    }
    const s = Number(params.get("s") || params.get("season") || 0);
    const e = Number(params.get("e") || params.get("episode") || 0);
    if (s > 0 && e > 0) {
      return (
        title.episodes.find((ep) => (ep.season ?? 1) === s && ep.number === e) ??
        null
      );
    }
    return title.episodes[0] ?? null;
  }, [params, title]);

  const episodeTitle = useMemo(() => {
    if (!episode) return undefined;
    return `S${episode.season ?? 1}, E${episode.number} · ${episode.title}`;
  }, [episode]);

  if (title === undefined) {
    return <div className={styles.page} aria-busy="true" />;
  }

  if (!title) {
    return (
      <div className={styles.notFound}>
        <h1>Title not found</h1>
        <Link to="/">Back to Home</Link>
      </div>
    );
  }

  return (
    <PlayerShell
      title={title}
      season={episode?.season ?? 1}
      episode={episode?.number ?? 1}
      episodeTitle={episodeTitle}
    />
  );
}
