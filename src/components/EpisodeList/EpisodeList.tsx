import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Episode } from "../../data/catalog";
import { seasonsForTitle, type Title } from "../../data/catalog";
import { ShelfNavChevron } from "../Icons";
import { MoreMenu } from "../MoreMenu/MoreMenu";
import { useShelfScroll } from "../../hooks";
import { prefetchStream } from "../../lib/prefetchStream";
import styles from "./EpisodeList.module.css";

interface Props {
  title: Title;
}

function durationShort(duration: string) {
  const m = duration.match(/(\d+)\s*min/i);
  if (m) return `${m[1]}m`;
  return duration.replace(/\s+/g, "");
}

export function EpisodeList({ title }: Props) {
  const seasons = useMemo(() => seasonsForTitle(title), [title]);
  const [season, setSeason] = useState(() => seasonsForTitle(title)[0] ?? 1);
  const { viewportRef, trackRef, clipStyle, canPrev, canNext, scrollBy, update } =
    useShelfScroll();

  useEffect(() => {
    const next = seasonsForTitle(title);
    setSeason(next[0] ?? 1);
  }, [title.id]);

  const episodes = useMemo(
    () => (title.episodes ?? []).filter((e) => (e.season ?? 1) === season),
    [title.episodes, season],
  );

  useEffect(() => {
    update();
  }, [season, episodes.length, update]);

  if (!title.episodes?.length) return null;

  return (
    <section className={styles.section} aria-labelledby="episodes-heading">
      <div className={styles.header}>
        <h2 id="episodes-heading" className={styles.heading}>
          <label className={styles.seasonSelect}>
            <span className={styles.srOnly}>Season</span>
            <select
              value={season}
              onChange={(e) => setSeason(Number(e.target.value))}
              aria-label="Select season"
            >
              {seasons.map((s) => (
                <option key={s} value={s}>
                  Season {s}
                </option>
              ))}
            </select>
            <span className={styles.seasonText} aria-hidden>
              Season {season}
            </span>
            <span className={styles.seasonChevron} aria-hidden>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 5" width="9" height="5">
                <path
                  fill="currentColor"
                  fillRule="nonzero"
                  d="M8.836.982 4.909 4.745a.62.62 0 0 1-.409.164.62.62 0 0 1-.409-.164L.164.982A.63.63 0 0 1 0 .573C0 .245.245 0 .573 0 .736 0 .9.082.982.164L4.5 3.518 8.018.164A.63.63 0 0 1 8.427 0C8.755 0 9 .245 9 .573a.63.63 0 0 1-.164.409"
                />
              </svg>
            </span>
          </label>
        </h2>
      </div>

      <div className={styles.viewport}>
        {canPrev && (
          <button
            type="button"
            className={`${styles.arrow} ${styles.prev}`}
            onClick={() => scrollBy(-1)}
            aria-label="Previous Page"
          >
            <ShelfNavChevron />
          </button>
        )}

        <div ref={viewportRef} className={styles.rail}>
          <div className={styles.clip} style={clipStyle}>
            <div ref={trackRef} className={styles.track}>
              {episodes.map((ep) => (
                <EpisodeCard key={ep.id} episode={ep} title={title} />
              ))}
            </div>
          </div>
        </div>

        {canNext && (
          <button
            type="button"
            className={`${styles.arrow} ${styles.next}`}
            onClick={() => scrollBy(1)}
            aria-label="Next Page"
          >
            <ShelfNavChevron />
          </button>
        )}
      </div>
    </section>
  );
}

function EpisodeCard({
  episode,
  title,
}: {
  episode: Episode;
  title: Title;
}) {
  return (
    <div className={`${styles.card} lockupContainer`}>
      <Link
        to={`/watch/${title.id}?ep=${episode.id}`}
        className={styles.lockup}
        aria-label={`Episode ${episode.number}: ${episode.title}`}
        onPointerEnter={() =>
          prefetchStream(title, {
            season: episode.season ?? 1,
            episode: episode.number,
          })
        }
      >
        <div className={styles.artwork}>
          <img src={episode.image} alt="" loading="lazy" />
        </div>
        <div className={styles.metadata}>
          <div className={styles.legibility} aria-hidden />
          <div className={styles.ambient} aria-hidden />
          <div className={styles.content}>
            <div className={styles.tag}>EPISODE {episode.number}</div>
            <div className={styles.epTitle}>{episode.title}</div>
            <div className={styles.description}>{episode.synopsis}</div>
          </div>
          <div className={styles.attribution}>
            <span className={styles.duration}>{durationShort(episode.duration)}</span>
          </div>
        </div>
      </Link>
      <div className={styles.menuSlot}>
        <MoreMenu title={title} variant="chin" />
      </div>
    </div>
  );
}
