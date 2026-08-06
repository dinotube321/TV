import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PosterCard } from "../PosterCard/PosterCard";
import { TopTenCard } from "../TopTenCard/TopTenCard";
import { ChevronRight, ShelfNavChevron } from "../Icons";
import { useShelfScroll } from "../../hooks";
import { saveBrowseReturn } from "../../lib/browseReturn";
import { resolveShelfItems, type Shelf, type Title } from "../../data/catalog";
import styles from "./ContentShelf.module.css";

interface Props {
  shelf: Shelf;
  /** When true (default), title + chevron link to the full shelf page. */
  linkTitle?: boolean;
  /** Override see-all destination (e.g. `/watchlist`). */
  seeAllTo?: string | null;
}

export function ContentShelf({ shelf, linkTitle = true, seeAllTo: seeAllToProp }: Props) {
  const [items, setItems] = useState<Title[]>(shelf.items ?? []);
  const { viewportRef, trackRef, clipStyle, canPrev, canNext, scrollBy, update } =
    useShelfScroll();
  const isTop10 = shelf.variant === "top10";
  const headingId = `shelf-${shelf.id}`;
  const seeAllTo =
    seeAllToProp !== undefined
      ? seeAllToProp
      : linkTitle
        ? `/shelf/${encodeURIComponent(shelf.id)}`
        : null;

  useEffect(() => {
    let cancelled = false;
    if (shelf.items?.length) {
      setItems(shelf.items);
      return;
    }
    resolveShelfItems(shelf).then((list) => {
      if (!cancelled) setItems(list);
    });
    return () => {
      cancelled = true;
    };
  }, [shelf.id, shelf.rule, shelf.titleIds?.join("|"), shelf.items]);

  useEffect(() => {
    update();
  }, [items, update]);

  if (!items.length) return null;

  const titleInner = (
    <>
      <span>{shelf.title}</span>
      {seeAllTo ? (
        <ChevronRight size={12} className={styles.chevron} />
      ) : null}
    </>
  );

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h2 id={headingId} className={styles.title}>
          {seeAllTo ? (
            <Link
              to={seeAllTo}
              className={styles.titleLink}
              aria-label={`See all in ${shelf.title}`}
              onClick={() => saveBrowseReturn(headingId)}
            >
              {titleInner}
            </Link>
          ) : (
            titleInner
          )}
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
              {items.map((title, i) =>
                isTop10 ? (
                  <TopTenCard key={title.id} title={title} rank={i + 1} />
                ) : (
                  <PosterCard key={title.id} title={title} />
                ),
              )}
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
