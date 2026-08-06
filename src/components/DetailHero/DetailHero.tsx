import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { PlayIcon, PlusIcon, CheckIcon } from "../Icons";
import type { Title } from "../../data/catalog";
import { starringLine } from "../../data/catalog";
import { useIsInWatchlist, useWatchlist } from "../../hooks/useWatchlist";
import {
  prefetchStream,
  prefetchStreamForTitle,
} from "../../lib/prefetchStream";
import styles from "./DetailHero.module.css";

interface Props {
  title: Title;
}

export function DetailHero({ title }: Props) {
  const inList = useIsInWatchlist(title.id);
  const { toggle } = useWatchlist();
  const typeLabel = title.type === "movie" ? "Movie" : "TV Show";
  const metaKinds = [typeLabel, ...title.genres.slice(0, 2)].join(" · ");
  const facts = [
    String(title.year),
    title.type === "show"
      ? `${title.seasons} Season${(title.seasons ?? 0) > 1 ? "s" : ""}`
      : title.duration,
  ]
    .filter(Boolean)
    .join(" · ");

  const stars = starringLine(title);

  const playTo =
    title.type === "show" && title.episodes?.[0]
      ? `/watch/${title.id}?ep=${title.episodes[0].id}`
      : `/watch/${title.id}`;

  // Warm stream extract while the user is on the info page
  useEffect(() => {
    const t = window.setTimeout(() => prefetchStreamForTitle(title), 400);
    return () => window.clearTimeout(t);
  }, [title]);

  return (
    <section className={styles.hero}>
      <div className={styles.art}>
        <motion.img
          src={title.backdrop}
          alt=""
          initial={{ opacity: 0.65, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        />
        <div className={styles.fade} />
      </div>

      <div className={styles.lockup}>
        <motion.div
          className={styles.copy}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.5 }}
        >
          {title.badge && <span className={styles.badge}>{title.badge}</span>}

          <h1 className={styles.title}>{title.title}</h1>

          <p className={styles.kind}>{metaKinds}</p>

          <p className={styles.synopsis}>{title.synopsis}</p>

          <div className={styles.facts}>
            <span>{facts}</span>
            <span className={styles.rating}>{title.rating}</span>
          </div>

          <div className={styles.actions}>
            <Link
              to={playTo}
              className={styles.play}
              onPointerEnter={() => {
                if (title.type === "show" && title.episodes?.[0]) {
                  prefetchStream(title, {
                    season: title.episodes[0].season ?? 1,
                    episode: title.episodes[0].number ?? 1,
                  });
                } else {
                  prefetchStream(title);
                }
              }}
              onFocus={() => prefetchStreamForTitle(title)}
            >
              <PlayIcon size={14} />
              Play
            </Link>
            <button
              type="button"
              className={`${styles.add} ${inList ? styles.added : ""}`}
              aria-label={inList ? "Remove from Watchlist" : "Add to Watchlist"}
              aria-pressed={inList}
              onClick={() => toggle(title)}
            >
              {inList ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
              <span>{inList ? "Added" : "Add"}</span>
            </button>
          </div>

          <div className={styles.credits}>
            {stars && (
              <p>
                <span className={styles.creditLabel}>Starring</span> {stars}
              </p>
            )}
            {title.director && (
              <p>
                <span className={styles.creditLabel}>
                  {title.type === "movie" ? "Director" : "Created by"}
                </span>{" "}
                {title.director}
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
