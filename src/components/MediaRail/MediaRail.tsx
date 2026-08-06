import { useEffect, useId, useState, type KeyboardEvent } from "react";
import type { TrailerClip, Title } from "../../data/catalog";
import { PlayIcon, CloseIcon } from "../Icons";
import { useShelfScroll } from "../../hooks";
import { youtubeIdFromClip } from "../../lib/youtube";
import styles from "./MediaRail.module.css";

interface Props {
  id: string;
  heading: string;
  items: TrailerClip[];
}

export function MediaRail({ id, heading, items }: Props) {
  const { viewportRef, trackRef, clipStyle } = useShelfScroll();
  const [active, setActive] = useState<TrailerClip | null>(null);
  const dialogTitleId = useId();

  const playable = items.filter((item) => youtubeIdFromClip(item));

  useEffect(() => {
    if (!active) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [active]);

  if (!playable.length) return null;

  const activeId = active ? youtubeIdFromClip(active) : null;

  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.heading}>
        {heading}
      </h2>
      <div ref={viewportRef} className={styles.rail}>
        <div className={styles.clip} style={clipStyle}>
          <div ref={trackRef} className={styles.track}>
            {playable.map((item) => (
              <article key={item.id} className={styles.card}>
                <button
                  type="button"
                  className={styles.thumbBtn}
                  onClick={() => setActive(item)}
                  aria-label={`Play ${item.title}`}
                >
                  <div className={styles.thumb}>
                    <img src={item.image} alt="" loading="lazy" />
                    <span className={styles.play} aria-hidden>
                      <PlayIcon size={14} />
                    </span>
                    <div className={styles.chin}>
                      <div className={styles.ambient} aria-hidden />
                      <div className={styles.chinContent}>
                        <p className={styles.name}>{item.title}</p>
                        <p className={styles.duration}>{item.duration}</p>
                      </div>
                    </div>
                  </div>
                </button>
              </article>
            ))}
          </div>
        </div>
      </div>

      {active && activeId && (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
          onClick={() => setActive(null)}
        >
          <div
            className={styles.lightboxPanel}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
          >
            <div className={styles.lightboxBar}>
              <h3 id={dialogTitleId} className={styles.lightboxTitle}>
                {active.title}
              </h3>
              <button
                type="button"
                className={styles.lightboxClose}
                onClick={() => setActive(null)}
                aria-label="Close video"
              >
                <CloseIcon size={20} />
              </button>
            </div>
            <div className={styles.lightboxFrame}>
              <iframe
                title={active.title}
                src={`https://www.youtube-nocookie.com/embed/${activeId}?autoplay=1&rel=0&modestbranding=1`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface CastRailProps {
  cast: { name: string; role: string; image: string }[];
}

export function CastRail({ cast }: CastRailProps) {
  const { viewportRef, trackRef, clipStyle } = useShelfScroll();

  if (!cast.length) return null;

  return (
    <section className={styles.section} aria-labelledby="cast-heading">
      <h2 id="cast-heading" className={styles.heading}>
        Cast & Crew
      </h2>
      <div ref={viewportRef} className={styles.rail}>
        <div className={styles.clip} style={clipStyle}>
          <div ref={trackRef} className={styles.track}>
            {cast.map((person) => (
              <article key={`${person.name}-${person.role}`} className={styles.person}>
                <div className={styles.personArt}>
                  <img src={person.image} alt="" loading="lazy" />
                  <div className={styles.personChin}>
                    <div className={styles.ambient} aria-hidden />
                    <p className={styles.personName}>{person.name}</p>
                    <p className={styles.personRole}>{person.role}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function AboutSection({ title }: { title: Title }) {
  return (
    <section className={styles.about} aria-labelledby="about-heading">
      <h2 id="about-heading" className={styles.heading}>
        About
      </h2>

      <div className={styles.aboutGrid}>
        <div className={styles.aboutBlock}>
          <h3>{title.title}</h3>
          <p className={styles.aboutGenre}>{title.genres.join(", ")}</p>
          <p className={styles.aboutBody}>{title.synopsis}</p>
        </div>

        {title.commonSense && (
          <div className={styles.aboutBlock}>
            <h3 className={styles.ratingBig}>{title.rating}</h3>
            <p className={styles.aboutLabel}>COMMON SENSE</p>
            <p className={styles.aboutBody}>{title.commonSense}</p>
          </div>
        )}

        <div className={styles.aboutBlock}>
          <h3>Information</h3>
          <dl className={styles.infoList}>
            <div>
              <dt>Released</dt>
              <dd>{title.year}</dd>
            </div>
            {title.duration && (
              <div>
                <dt>Run Time</dt>
                <dd>{title.duration}</dd>
              </div>
            )}
            {title.seasons != null && (
              <div>
                <dt>Seasons</dt>
                <dd>{title.seasons}</dd>
              </div>
            )}
            <div>
              <dt>Rated</dt>
              <dd>{title.ratedNote ?? title.rating}</dd>
            </div>
            {title.regions && (
              <div>
                <dt>Regions of Origin</dt>
                <dd>{title.regions.join(", ")}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className={styles.aboutBlock}>
          <h3>Accessibility</h3>
          <p className={styles.aboutBody}>
            Closed captions (CC) refer to subtitles in the available language with
            the addition of relevant non-dialogue information.
          </p>
          <p className={styles.aboutBody}>
            Audio descriptions (AD) refer to a narration track describing what is
            happening on screen, to provide context for those who are blind or
            have low vision.
          </p>
        </div>
      </div>
    </section>
  );
}
