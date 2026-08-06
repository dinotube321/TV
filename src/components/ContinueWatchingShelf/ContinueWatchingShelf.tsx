import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MoreMenu } from "../MoreMenu/MoreMenu";
import { useShelfScroll } from "../../hooks";
import {
  formatContinueDuration,
  loadContinueWatching,
  subscribeContinueWatching,
  type ContinueItem,
} from "../../lib/continueWatching";
import type { Title } from "../../data/types";
import styles from "./ContinueWatchingShelf.module.css";

function asTitle(item: ContinueItem): Title {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    tagline: "",
    synopsis: "",
    year: 0,
    rating: "",
    genres: [],
    poster: item.poster || item.image,
    backdrop: item.image || item.poster,
    cast: [],
    tmdbId: item.tmdbId,
  };
}

/** Apple TV–style play glyph (filled triangle). */
function ApplePlayIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 89.893 120"
      className={styles.playGlyph}
      aria-hidden
    >
      <path d="M12.461 94.439c0 5.33 3.149 7.927 6.94 7.927 1.617 0 3.36-.495 5.005-1.409l57.665-33.658c4.198-2.469 5.903-4.317 5.903-7.331 0-3.013-1.705-4.861-5.903-7.33L24.406 18.98c-1.645-.915-3.388-1.41-5.005-1.41-3.791 0-6.94 2.598-6.94 7.927z" />
    </svg>
  );
}

function ContinueCard({ item }: { item: ContinueItem }) {
  const subtitle =
    item.type === "show" && item.season && item.episode
      ? `S${item.season} · E${item.episode}`
      : null;
  const duration = formatContinueDuration(item);

  return (
    <div className={styles.card}>
      <Link
        to={item.watchPath}
        className={styles.lockup}
        aria-label={`Continue ${item.title}`}
      >
        <div className={styles.artwork}>
          {item.image ? (
            <img src={item.image} alt="" loading="lazy" />
          ) : (
            <div className={styles.placeholder} aria-hidden />
          )}
        </div>
        <div className={styles.metadata}>
          <div className={styles.legibility} aria-hidden />
          <div className={styles.ambient} aria-hidden />
          <div className={styles.titleBlock}>
            {subtitle && <div className={styles.tag}>{subtitle}</div>}
            <div className={styles.title}>{item.title}</div>
          </div>
          <div className={styles.attribution}>
            <span className={styles.playState} aria-hidden>
              <ApplePlayIcon />
            </span>
            <span className={styles.duration} aria-hidden>
              {duration}
            </span>
          </div>
        </div>
      </Link>
      <div className={styles.menuSlot}>
        <MoreMenu title={asTitle(item)} variant="chin" />
      </div>
    </div>
  );
}

/** Horizontal continue-watching rail — Apple TV metadata chin (blur + time, no red bar). */
export function ContinueWatchingShelf() {
  const { viewportRef, trackRef, clipStyle } = useShelfScroll();
  const [items, setItems] = useState<ContinueItem[]>([]);

  useEffect(() => {
    const refresh = () => setItems(loadContinueWatching());
    refresh();
    return subscribeContinueWatching(refresh);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setItems(loadContinueWatching());
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, []);

  if (!items.length) return null;

  return (
    <section className={styles.section} aria-labelledby="continue-watching-heading">
      <h2 id="continue-watching-heading" className={styles.heading}>
        Continue Watching
      </h2>
      <div ref={viewportRef} className={styles.rail}>
        <div className={styles.clip} style={clipStyle}>
          <div ref={trackRef} className={styles.track}>
            {items.map((item) => (
              <ContinueCard
                key={`${item.id}-${item.season ?? 0}-${item.episode ?? 0}`}
                item={item}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
