import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

function readGap(el: HTMLElement) {
  const g = getComputedStyle(el).gap || getComputedStyle(el).columnGap;
  const n = parseFloat(g);
  return Number.isFinite(n) ? n : 20;
}

function contentWidth(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  return Math.max(0, el.clientWidth - padL - padR);
}

/** Shelf scroll: full cards only, gutters even (cards stretch to fill the row). */
export function useShelfScroll() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [clipStyle] = useState<CSSProperties>({
    width: "100%",
    maxWidth: "100%",
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const strideRef = useRef(0);
  const pageRef = useRef(1);
  const lastWidthRef = useRef(0);

  const updateButtons = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const { scrollLeft, scrollWidth, clientWidth } = track;
    setCanPrev(scrollLeft > 4);
    setCanNext(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const items = Array.from(track.children).filter(
      (n): n is HTMLElement => n instanceof HTMLElement,
    );
    if (!items.length) {
      updateButtons();
      return;
    }

    const avail = contentWidth(viewport);
    if (avail < 8) return;

    const gap = readGap(track);

    // Measure natural (un-stretched) card width
    track.style.removeProperty("--shelf-item-width");
    const natural = items[0].getBoundingClientRect().width;
    if (natural < 8) return;

    const count = Math.max(1, Math.floor((avail + gap) / (natural + gap)));
    const exactW = (avail - (count - 1) * gap) / count;

    // Stretch cards so the row exactly fills avail — left/right gutters match
    if (Math.abs(exactW - lastWidthRef.current) > 0.25) {
      lastWidthRef.current = exactW;
      track.style.setProperty("--shelf-item-width", `${exactW}px`);
    } else {
      track.style.setProperty("--shelf-item-width", `${lastWidthRef.current}px`);
    }

    strideRef.current = lastWidthRef.current + gap;
    pageRef.current = count;
    updateButtons();
  }, [updateButtons]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    measure();
    track.addEventListener("scroll", updateButtons, { passive: true });
    const ro = new ResizeObserver(() => measure());
    ro.observe(viewport);

    return () => {
      track.removeEventListener("scroll", updateButtons);
      ro.disconnect();
    };
  }, [measure, updateButtons]);

  const scrollBy = useCallback((dir: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const stride = strideRef.current || Math.min(track.clientWidth * 0.9, 720);
    const page = pageRef.current || 1;
    const amount = stride * page;
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    const target = track.scrollLeft + dir * amount;
    const snapped =
      dir > 0
        ? Math.min(max, Math.round(target / stride) * stride)
        : Math.max(0, Math.round(target / stride) * stride);
    track.scrollTo({ left: snapped, behavior: "smooth" });
  }, []);

  return {
    viewportRef,
    trackRef,
    ref: trackRef,
    clipStyle,
    canPrev,
    canNext,
    scrollBy,
    update: measure,
  };
}

export function useHeroRotation(length: number, intervalMs = 7000) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [length, intervalMs, paused]);

  return {
    index,
    setIndex,
    paused,
    setPaused,
    next: () => setIndex((i) => (i + 1) % length),
    prev: () => setIndex((i) => (i - 1 + length) % length),
  };
}

export function useScrolled(threshold = 24) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
