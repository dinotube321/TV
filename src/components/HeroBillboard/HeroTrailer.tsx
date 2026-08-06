import { useEffect, useId, useRef, useState } from "react";
import { extractYoutubeId } from "../../lib/youtube";
import styles from "./HeroBillboard.module.css";

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: string | HTMLElement,
        opts: {
          videoId: string;
          width?: string | number;
          height?: string | number;
          host?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YtPlayer }) => void;
            onStateChange?: (e: { data: number; target: YtPlayer }) => void;
          };
        },
      ) => YtPlayer;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YtPlayer {
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  playVideo: () => void;
  destroy: () => void;
  setVolume: (n: number) => void;
  getIframe?: () => HTMLIFrameElement;
  getPlayerState?: () => number;
}

let apiPromise: Promise<NonNullable<typeof window.YT>> | null = null;

function loadYtApi() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    if (!document.getElementById("yt-iframe-api")) {
      const script = document.createElement("script");
      script.id = "yt-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    } else if (window.YT?.Player) {
      resolve(window.YT);
    }
  });
  return apiPromise;
}

function sizeIframe(player: YtPlayer) {
  const iframe = player.getIframe?.();
  if (!iframe) return;
  iframe.removeAttribute("width");
  iframe.removeAttribute("height");
  iframe.style.cssText = [
    "position:absolute",
    "inset:0",
    "width:100%",
    "height:100%",
    "max-width:none",
    "max-height:none",
    "border:0",
    "pointer-events:none",
  ].join(";");
}

/**
 * Require this many ms of continuous PLAYING (not buffering) before
 * showing the iframe. YT play/pause chrome is gone by then.
 */
const SAFE_PLAY_MS = 5500;

interface Props {
  trailerUrl?: string;
  muted: boolean;
  active: boolean;
  /** true only when iframe is safe to show (no YT controls) */
  onRevealedChange?: (revealed: boolean) => void;
  /** Trailer finished — advance hero (avoids loop control flash) */
  onEnded?: () => void;
}

export function HeroTrailer({
  trailerUrl,
  muted,
  active,
  onRevealedChange,
  onEnded,
}: Props) {
  const reactId = useId().replace(/:/g, "");
  const hostId = `hero-yt-${reactId}`;
  const playerRef = useRef<YtPlayer | null>(null);
  const mutedRef = useRef(muted);
  const onEndedRef = useRef(onEnded);
  const playStartedAt = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const revealedRef = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const videoId = extractYoutubeId(trailerUrl);

  mutedRef.current = muted;
  onEndedRef.current = onEnded;

  useEffect(() => {
    revealedRef.current = revealed;
    onRevealedChange?.(revealed);
  }, [revealed, onRevealedChange]);

  useEffect(() => {
    if (!videoId || !active) {
      playerRef.current?.destroy();
      playerRef.current = null;
      playStartedAt.current = null;
      revealedRef.current = false;
      setRevealed(false);
      return;
    }

    let cancelled = false;
    revealedRef.current = false;
    setRevealed(false);
    playStartedAt.current = null;

    const clearPoll = () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const tryReveal = () => {
      if (cancelled || revealedRef.current) return;
      if (playStartedAt.current == null) return;
      if (Date.now() - playStartedAt.current < SAFE_PLAY_MS) return;
      revealedRef.current = true;
      setRevealed(true);
      clearPoll();
    };

    loadYtApi().then((YT) => {
      if (cancelled) return;
      if (!document.getElementById(hostId)) return;

      playerRef.current?.destroy();
      playerRef.current = new YT.Player(hostId, {
        videoId,
        width: "100%",
        height: "100%",
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          showinfo: 0,
          // No loop — on end we advance to the next hero instead
          cc_load_policy: 0,
          autohide: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (cancelled) return;
            sizeIframe(e.target);
            e.target.mute();
            e.target.setVolume(100);
            e.target.playVideo();
          },
          onStateChange: (e) => {
            if (cancelled) return;
            sizeIframe(e.target);

            if (e.data === YT.PlayerState.PLAYING) {
              try {
                if (mutedRef.current) e.target.mute();
                else e.target.unMute();
              } catch {
                /* ignore */
              }
              if (playStartedAt.current == null) {
                playStartedAt.current = Date.now();
              }
              if (!pollRef.current) {
                pollRef.current = window.setInterval(tryReveal, 200);
              }
              tryReveal();
            } else if (
              e.data === YT.PlayerState.BUFFERING ||
              e.data === YT.PlayerState.PAUSED ||
              e.data === YT.PlayerState.UNSTARTED
            ) {
              if (!revealedRef.current) {
                playStartedAt.current = null;
              }
            } else if (e.data === YT.PlayerState.ENDED) {
              // Move to next hero — avoids replay control flash
              onEndedRef.current?.();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearPoll();
      playerRef.current?.destroy();
      playerRef.current = null;
      playStartedAt.current = null;
      revealedRef.current = false;
      setRevealed(false);
    };
  }, [videoId, active, hostId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !revealed) return;
    try {
      if (muted) player.mute();
      else player.unMute();
    } catch {
      /* ignore */
    }
  }, [muted, revealed]);

  if (!videoId || !active) return null;

  return (
    <div
      className={`${styles.trailerWrap} ${revealed ? styles.trailerRevealed : ""}`}
      aria-hidden
    >
      {/*
        Iframe stays opacity:0 until revealed — even if YT paints controls,
        they cannot be seen. Poster in the parent covers this layer.
      */}
      <div className={styles.trailerCover}>
        <div className={styles.trailerFrame}>
          <div id={hostId} />
        </div>
      </div>
    </div>
  );
}
