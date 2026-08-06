import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Title } from "../../data/catalog";
import { useIsInWatchlist, useWatchlist } from "../../hooks/useWatchlist";
import styles from "./MoreMenu.module.css";

interface Props {
  title: Title;
  /** platter = frosted circle (posters); chin = Apple episode attribution ⋯ */
  variant?: "platter" | "chin";
}

type Placement = "above" | "below";

interface MenuPos {
  top: number;
  left: number;
  placement: Placement;
}

function WatchlistIcon({ checked }: { checked: boolean }) {
  if (checked) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M6.2 11.6 2.85 8.25a.75.75 0 0 1 1.06-1.06L6.2 9.48l5.9-5.9a.75.75 0 0 1 1.06 1.06L6.2 11.6z"
        />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M8 2.25a.75.75 0 0 1 .75.75v4.25H13a.75.75 0 0 1 0 1.5H8.75V13a.75.75 0 0 1-1.5 0V8.75H3a.75.75 0 0 1 0-1.5h4.25V3A.75.75 0 0 1 8 2.25z"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="M8.007 10.42c-.338 0-.617-.293-.617-.643V2.752l.046-1.041-.41.517-.922 1.04a.549.549 0 01-.418.189.542.542 0 01-.55-.559c0-.174.06-.3.172-.419L7.536.223C7.695.056 7.848 0 8.006 0c.166 0 .312.056.471.223l2.228 2.256a.575.575 0 01.179.42.547.547 0 01-.557.558.559.559 0 01-.418-.189l-.921-1.04-.411-.51.053 1.034v7.025c0 .35-.279.643-.623.643zM4.18 16C2.75 16 2 15.218 2 13.723V6.858c0-1.501.75-2.277 2.181-2.277h1.81v1.39H4.267c-.61 0-.948.335-.948 1.006v6.62c0 .671.338 1.006.948 1.006h7.466c.603 0 .948-.335.948-1.005V6.977c0-.67-.345-1.006-.948-1.006h-1.704v-1.39h1.79c1.438 0 2.181.783 2.181 2.277v6.865C14 15.218 13.257 16 11.819 16H4.18z"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="M3.772 16.002c-1.036 0-1.924-.367-2.663-1.1C.369 14.168 0 13.289 0 12.262c0-1.025.37-1.919 1.109-2.68L4.095 6.63c.943-.916 1.895-1.434 2.854-1.555.96-.122 1.812.173 2.557.885a.98.98 0 0 1 .298.703.923.923 0 0 1-.29.695.962.962 0 0 1-.703.298.948.948 0 0 1-.695-.29c-.441-.37-.902-.444-1.382-.223-.48.22-.893.521-1.24.902l-2.987 2.953a1.731 1.731 0 0 0-.521 1.258c0 .485.176.901.529 1.249.353.347.772.521 1.257.521.486 0 .91-.174 1.275-.521l.81-.811a.966.966 0 0 1 1.398.017c.193.215.29.45.29.703 0 .253-.097.485-.29.695l-.81.794c-.75.733-1.641 1.1-2.673 1.1zm11.12-14.8C15.63 1.957 16 2.848 16 3.874c0 1.026-.37 1.908-1.109 2.647L11.715 9.69c-.988.976-1.986 1.464-2.995 1.464-.822 0-1.564-.33-2.226-.993a.98.98 0 0 1-.298-.703c0-.264.1-.496.298-.695a.98.98 0 0 1 1.39-.016c.15.198.411.336.786.413.375.078.924-.217 1.646-.885l3.177-3.152c.348-.347.521-.764.521-1.249 0-.49-.17-.913-.512-1.266-.342-.353-.72-.554-1.134-.604-.408-.05-.813.089-1.216.414l-1.01 1.01a.966.966 0 0 1-1.397-.017c-.199-.215-.295-.45-.29-.704.006-.253.102-.485.29-.694l1.009-1.001c.739-.706 1.58-1.043 2.523-1.01.943.033 1.815.433 2.614 1.2z"
      />
    </svg>
  );
}

export function MoreMenu({ title, variant = "platter" }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const inList = useIsInWatchlist(title.id);
  const { toggle } = useWatchlist();

  const watchLabel = inList ? "Remove from Watchlist" : "Add to Watchlist";
  const detailPath = `/title/${title.id}`;
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${detailPath}`
      : detailPath;

  const updatePosition = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 196;
    const menuHeight = menuRef.current?.offsetHeight ?? 108;
    const pad = 8;

    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    const spaceBelow = window.innerHeight - originY;
    const spaceAbove = originY;
    const placement: Placement =
      spaceBelow < menuHeight + 20 && spaceAbove > spaceBelow ? "above" : "below";

    let left = originX - menuWidth;
    let top = placement === "below" ? originY : originY - menuHeight;

    left = Math.max(pad, Math.min(left, window.innerWidth - menuWidth - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - menuHeight - pad));

    setPos({ top, left, placement });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const id = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onReposition = () => updatePosition();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const close = () => setOpen(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
        close();
      }, 900);
    } catch {
      close();
    }
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: title.title, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
      }
    } catch {
      /* user cancelled */
    }
    close();
  };

  return (
    <div
      className={`${styles.root} ${variant === "chin" ? styles.chin : ""}`}
      ref={rootRef}
      data-open={open ? "true" : "false"}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label="more"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className={styles.platter}>
          <svg width="28" height="28" viewBox="0 0 28 28" className={styles.glyph} aria-hidden>
            <circle cx="14" cy="14" r="14" className={styles.circle} />
            <path
              className={styles.dots}
              d="M10.105 14c0-.87-.687-1.55-1.564-1.55-.862 0-1.557.695-1.557 1.55 0 .848.695 1.55 1.557 1.55.855 0 1.564-.702 1.564-1.55zm5.437 0c0-.87-.68-1.55-1.542-1.55A1.55 1.55 0 0012.45 14c0 .848.695 1.55 1.55 1.55.848 0 1.542-.702 1.542-1.55zm5.474 0c0-.87-.687-1.55-1.557-1.55-.87 0-1.564.695-1.564 1.55 0 .848.694 1.55 1.564 1.55.848 0 1.557-.702 1.557-1.55z"
            />
          </svg>
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className={`${styles.menu} ${pos?.placement === "above" ? styles.above : styles.below}`}
            role="menu"
            style={
              pos
                ? { top: pos.top, left: pos.left }
                : { visibility: "hidden", top: 0, left: 0 }
            }
            onClick={(e) => e.stopPropagation()}
          >
            <ul className={styles.list}>
              <li className={styles.item}>
                <button
                  type="button"
                  role="menuitem"
                  title={watchLabel}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggle(title);
                    close();
                  }}
                >
                  <span className={styles.option}>
                    <span className={styles.optionText}>{watchLabel}</span>
                    <span className={styles.icon}>
                      <WatchlistIcon checked={inList} />
                    </span>
                  </span>
                </button>
              </li>
              <li className={styles.item}>
                <button
                  type="button"
                  role="menuitem"
                  title="Share"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void share();
                  }}
                >
                  <span className={styles.option}>
                    <span className={styles.optionText}>Share</span>
                    <span className={styles.icon}>
                      <ShareIcon />
                    </span>
                  </span>
                </button>
              </li>
              <li className={styles.item}>
                <button
                  type="button"
                  role="menuitem"
                  title="Copy Link"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void copyLink();
                  }}
                >
                  <span className={styles.option}>
                    <span className={styles.optionText}>
                      {copied ? "Copied" : "Copy Link"}
                    </span>
                    <span className={styles.icon}>
                      <LinkIcon />
                    </span>
                  </span>
                </button>
              </li>
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
