import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { PlayIcon, PlusIcon, CheckIcon, VolumeIcon, VolumeMuteIcon } from "../Icons";
import { useHeroRotation } from "../../hooks";
import { useIsInWatchlist, useWatchlist } from "../../hooks/useWatchlist";
import { extractYoutubeId } from "../../lib/youtube";
import type { Title } from "../../data/catalog";
import { HeroTrailer } from "./HeroTrailer";
import styles from "./HeroBillboard.module.css";

interface Props {
  titles: Title[];
}

const SWIPE_MIN_PX = 48;

export function HeroBillboard({ titles }: Props) {
  const { index, setIndex, setPaused, next, prev } = useHeroRotation(
    titles.length,
    9000,
  );
  const [muted, setMuted] = useState(true);
  const [trailerReady, setTrailerReady] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const current = titles[index];
  const hasTrailer = Boolean(extractYoutubeId(current?.trailerUrl));
  const inList = useIsInWatchlist(current?.id ?? "");
  const { toggle } = useWatchlist();

  const swipeRef = useRef<{
    x: number;
    y: number;
    id: number;
    swiped: boolean;
  } | null>(null);

  useEffect(() => {
    setTrailerReady(false);
    setPaused(hasTrailer);
  }, [hasTrailer, index, setPaused]);

  function handleTrailerEnded() {
    setTrailerReady(false);
    if (titles.length > 1) {
      next();
    } else {
      // Single hero — remount trailer with poster veil again (no loop controls)
      setReplayKey((k) => k + 1);
    }
  }

  function resumeAutoplay() {
    if (!hasTrailer) setPaused(false);
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (titles.length <= 1) return;
    // Ignore secondary mouse buttons; allow touch / pen / primary mouse drag
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Don't steal presses on buttons / links inside the lockup
    const t = e.target as HTMLElement | null;
    if (t?.closest("a, button, input, [role='tab']")) return;

    swipeRef.current = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      swiped: false,
    };
    setPaused(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const s = swipeRef.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    // Once clearly horizontal, mark as swipe so click won't fire oddly
    if (!s.swiped && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      s.swiped = true;
    }
  }

  function finishPointer(e: React.PointerEvent<HTMLElement>) {
    const s = swipeRef.current;
    if (!s || s.id !== e.pointerId) return;
    swipeRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX >= SWIPE_MIN_PX && absX > absY * 1.15) {
      if (dx < 0) next();
      else prev();
    }
    resumeAutoplay();
  }

  if (!current) return null;

  return (
    <section
      className={styles.stage}
      aria-roledescription="carousel"
      aria-label="Featured"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        if (!hasTrailer) setPaused(false);
      }}
    >
      <div
        className={styles.frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={current.id}
            className={styles.slide}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42, ease: [0.33, 1, 0.68, 1], delay: 0.05 }}
          >
            <img
              src={current.backdrop}
              alt=""
              className={styles.artwork}
              draggable={false}
            />

            {hasTrailer && (
              <HeroTrailer
                key={`${current.id}-${replayKey}`}
                trailerUrl={current.trailerUrl}
                muted={muted}
                active
                onRevealedChange={setTrailerReady}
                onEnded={handleTrailerEnded}
              />
            )}

            {/*
              Poster sits ABOVE the YouTube iframe (separate layer).
              Stays fully opaque until trailerReady — then fades out.
              This is what you see for the first ~3.5s; YT controls never appear.
            */}
            {hasTrailer && (
              <img
                src={current.backdrop}
                alt=""
                className={`${styles.trailerVeil} ${trailerReady ? styles.trailerVeilGone : ""}`}
                draggable={false}
              />
            )}

            <div className={styles.bottomFade} />
          </motion.div>
        </AnimatePresence>

        <div className={styles.lockup}>
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id + "-copy"}
              className={styles.lockupInner}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.33, 1, 0.68, 1] }}
            >
              {current.badge && (
                <span className={styles.badge}>{current.badge}</span>
              )}

              {current.logo ? (
                <h1 className={styles.titleLogo} aria-label={current.title}>
                  <img
                    src={current.logo}
                    alt={current.title}
                    className={styles.titleLogoImg}
                    decoding="async"
                    draggable={false}
                  />
                </h1>
              ) : (
                <h1 className={styles.titleLogo} aria-label={current.title}>
                  {current.title}
                </h1>
              )}

              <p className={styles.meta}>
                <span className={styles.provider}>
                  <svg width="14" height="14" viewBox="0 0 17 20" fill="currentColor" aria-hidden>
                    <path d="M13.93 10.66c-.02-2.14 1.75-3.17 1.83-3.22-1-1.46-2.55-1.66-3.1-1.68-1.32-.13-2.58.78-3.25.78-.67 0-1.71-.76-2.81-.74-1.45.02-2.78.84-3.52 2.14-1.5 2.6-.38 6.46 1.08 8.57.71 1.03 1.56 2.19 2.68 2.15 1.07-.04 1.48-.7 2.77-.7 1.3 0 1.66.7 2.8.68 1.16-.02 1.89-1.05 2.6-2.09.82-1.2 1.15-2.36 1.17-2.42-.03-.01-2.25-.86-2.27-3.42zm-2.13-6.3c.59-.72.99-1.71.88-2.7-.85.03-1.88.57-2.49 1.28-.55.63-1.03 1.64-.9 2.61.95.07 1.92-.48 2.51-1.19z" />
                  </svg>
                </span>
                <span>
                  {current.type === "show" ? "TV Show" : "Movie"}
                  {" · "}
                  {current.genres.slice(0, 2).join(" · ")}
                </span>
                <span className={styles.rating}>{current.rating}</span>
              </p>

              <p className={styles.description}>{current.synopsis}</p>

              <p className={styles.explain}>{current.tagline}</p>

              <div className={styles.actions}>
                <Link to={`/watch/${current.id}`} className={styles.primary}>
                  <PlayIcon size={18} className={styles.playIcon} />
                  Play
                </Link>
                <button
                  type="button"
                  className={`${styles.add} ${inList ? styles.added : ""}`}
                  aria-label={inList ? "Remove from Watchlist" : "Add to Watchlist"}
                  aria-pressed={inList}
                  onClick={() => toggle(current)}
                >
                  {inList ? <CheckIcon size={18} /> : <PlusIcon size={18} />}
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {hasTrailer && trailerReady && (
          <button
            type="button"
            className={styles.muteBtn}
            aria-label={muted ? "Unmute trailer" : "Mute trailer"}
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? <VolumeMuteIcon size={18} /> : <VolumeIcon size={18} />}
          </button>
        )}

        <div className={styles.pagination} role="tablist" aria-label="Featured titles">
          {titles.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={t.title}
              className={`${styles.dot} ${i === index ? styles.dotActive : ""}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
