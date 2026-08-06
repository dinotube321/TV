import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "../Icons";
import type { Title } from "../../data/catalog";
import { streamEmbedPath } from "../../lib/streamEmbed";
import { upsertContinueWatching } from "../../lib/continueWatching";
import styles from "./PlayerShell.module.css";

interface Props {
  title: Title;
  season?: number;
  episode?: number;
  episodeTitle?: string;
}

export function PlayerShell({ title, season, episode, episodeTitle }: Props) {
  const src = streamEmbedPath(title, { season, episode });

  useEffect(() => {
    upsertContinueWatching(title, { season, episode, episodeTitle });
  }, [title, season, episode, episodeTitle]);

  if (!src) {
    return (
      <div className={styles.shell}>
        <div className={styles.error}>
          <p>No stream available for this title.</p>
          <Link to={`/title/${title.id}`} className={styles.errorBack}>
            Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <iframe
        className={styles.frame}
        src={src}
        title={
          episodeTitle
            ? `${title.title} · ${episodeTitle}`
            : `Watch ${title.title}`
        }
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
      />
      <Link
        to={`/title/${title.id}`}
        className={styles.back}
        aria-label="Back to title"
      >
        <ChevronLeft size={22} />
      </Link>
    </div>
  );
}
