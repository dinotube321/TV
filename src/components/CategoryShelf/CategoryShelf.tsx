import { Link } from "react-router-dom";
import { useEffect } from "react";
import { ChevronRight, ShelfNavChevron } from "../Icons";
import { useShelfScroll } from "../../hooks";
import { saveBrowseReturn } from "../../lib/browseReturn";
import type { Category } from "../../data/types";
import styles from "./CategoryShelf.module.css";

interface Props {
  categories: Category[];
  heading?: string;
}

/** Tiles whose art is a text-free lighting plate — title is drawn in SF Pro via CSS. */
const CSS_LABEL_IDS = new Set([
  "action",
  "thriller",
  "horror",
  "romance",
  "crime",
]);

export function CategoryShelf({
  categories,
  heading = "Browse by Category",
}: Props) {
  const { viewportRef, trackRef, clipStyle, canPrev, canNext, scrollBy, update } =
    useShelfScroll();

  useEffect(() => {
    update();
  }, [categories.length, update]);

  if (!categories.length) return null;

  return (
    <section className={styles.section} aria-labelledby="categories-heading">
      <div className={styles.header}>
        <h2 id="categories-heading" className={styles.title}>
          <span>{heading}</span>
          <ChevronRight size={12} className={styles.chevron} />
        </h2>
      </div>

      <div className={styles.viewport}>
        {canPrev && (
          <button
            type="button"
            className={`${styles.arrow} ${styles.prev}`}
            onClick={() => scrollBy(-1)}
            aria-label="Previous categories"
          >
            <ShelfNavChevron />
          </button>
        )}

        <div ref={viewportRef} className={styles.rail}>
          <div className={styles.clip} style={clipStyle}>
            <div ref={trackRef} className={styles.track}>
              {categories.map((cat) => {
                const cssLabel = CSS_LABEL_IDS.has(cat.id);
                return (
                  <Link
                    key={cat.id}
                    to={`/category/${encodeURIComponent(cat.id)}`}
                    className={`${styles.card}${cssLabel ? ` ${styles.cardCoded}` : ""}`}
                    data-tone={cssLabel ? cat.id : undefined}
                    aria-label={cat.title}
                    onClick={() => saveBrowseReturn("categories-heading")}
                  >
                    {!cssLabel ? (
                      <img
                        src={cat.image}
                        alt=""
                        className={styles.image}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className={styles.cardLabel} aria-hidden>
                        <span className={styles.cardTitle}>{cat.title}</span>
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {canNext && (
          <button
            type="button"
            className={`${styles.arrow} ${styles.next}`}
            onClick={() => scrollBy(1)}
            aria-label="Next categories"
          >
            <ShelfNavChevron />
          </button>
        )}
      </div>
    </section>
  );
}
