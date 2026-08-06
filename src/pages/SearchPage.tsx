import {
  useMemo,
  useState,
  useEffect,
  useDeferredValue,
  useId,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SearchIcon } from "../components/Icons";
import { PosterRating } from "../components/PosterRating/PosterRating";
import { searchTitles, type Title } from "../data/catalog";
import { fetchBrowse } from "../data/api";
import { openSearchResult } from "../lib/openSearchResult";
import { usePageMeta } from "../lib/usePageMeta";
import styles from "./SearchPage.module.css";

const SUGGESTION_LIMIT = 4;

export function SearchPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const deferredQuery = useDeferredValue(query);
  const [browse, setBrowse] = useState<Title[]>([]);
  const [results, setResults] = useState<Title[]>([]);
  const [active, setActive] = useState(-1);
  const [openingId, setOpeningId] = useState<string | null>(null);

  usePageMeta({
    title: query.trim() ? `Search: ${query.trim()}` : "Search",
    description:
      "Search movies and TV shows. Pulse indexes metadata and third-party links and does not host video files.",
    path: query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search",
  });

  useEffect(() => {
    setQuery(params.get("q") ?? "");
  }, [params]);

  useEffect(() => {
    setOpeningId(null);
  }, [params]);

  useEffect(() => {
    fetchBrowse({ page: 1, limit: 12 }).then((page) => setBrowse(page.items));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q = deferredQuery.trim();
    if (!q) {
      setResults([]);
      setActive(-1);
      return;
    }
    searchTitles(q)
      .then((list) => {
        if (!cancelled) {
          setResults(list);
          setActive(-1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setActive(-1);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [deferredQuery]);

  const suggestions = useMemo(
    () => (deferredQuery.trim() ? results.slice(0, SUGGESTION_LIMIT) : []),
    [deferredQuery, results],
  );

  const expanded = query.trim().length > 0 || Boolean(openingId);

  const shown = useMemo(
    () => (query.trim() ? results : browse),
    [query, results, browse],
  );

  async function openTitle(t: Title) {
    if (openingId) return;
    if (t.pending) setOpeningId(t.id);
    try {
      await openSearchResult(t, navigate);
    } catch {
      setOpeningId(null);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (openingId) return;
    if (!expanded || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      void openTitle(suggestions[active]!);
    } else if (e.key === "Escape") {
      setActive(-1);
    }
  }

  function onResultClick(e: MouseEvent, t: Title) {
    e.preventDefault();
    void openTitle(t);
  }

  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className={styles.inner}>
        <div
          className={`${styles.combo} ${expanded ? styles.comboOpen : ""}`}
          role="combobox"
          aria-expanded={expanded}
          aria-owns={listId}
        >
          <div className={styles.field}>
            <SearchIcon className={styles.icon} />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Movies, TV Shows, Cast and More"
              aria-label="Search"
              aria-autocomplete="list"
              aria-controls={listId}
            />
          </div>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="suggest"
                className={styles.suggestPanel}
                id={listId}
                role="listbox"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className={styles.suggestDivider} aria-hidden />
                {suggestions.length === 0 ? (
                  <p className={styles.suggestEmpty}>
                    {deferredQuery.trim() !== query.trim()
                      ? "Searching…"
                      : `No matches for “${query.trim()}”`}
                  </p>
                ) : (
                  <ul className={styles.suggestList}>
                    {suggestions.map((t, i) => (
                      <li key={t.id} role="option" aria-selected={active === i}>
                        <button
                          type="button"
                          className={`${styles.suggestRow} ${
                            active === i ? styles.suggestActive : ""
                          } ${openingId === t.id ? styles.suggestOpening : ""}`}
                          disabled={Boolean(openingId)}
                          onMouseEnter={() => !openingId && setActive(i)}
                          onClick={(e) => onResultClick(e, t)}
                        >
                          <img
                            className={styles.suggestPoster}
                            src={t.poster}
                            alt=""
                            loading="lazy"
                          />
                          <div className={styles.suggestMeta}>
                            <div className={styles.suggestTitle}>
                              <span className={styles.suggestTitleText}>
                                {t.title}
                              </span>
                              {openingId === t.id && (
                                <span
                                  className={styles.inlineSpinner}
                                  aria-label="Loading"
                                />
                              )}
                            </div>
                              <div className={styles.suggestSub}>
                                <span>{t.year || "—"}</span>
                                <span className={styles.dot} aria-hidden>
                                  ·
                                </span>
                                <span>
                                  {t.type === "movie" ? "Movie" : "TV Show"}
                                </span>
                                {!t.pending && (
                                  <>
                                    <span className={styles.dot} aria-hidden>
                                      ·
                                    </span>
                                    <span className={styles.libraryTag}>
                                      In library
                                    </span>
                                  </>
                                )}
                              </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className={styles.label}>{query.trim() ? "Results" : "Browse"}</p>

        <AnimatePresence mode="wait">
          <motion.ul
            key={query || "browse"}
            className={styles.grid}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {shown.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`${styles.card} ${
                    openingId === t.id ? styles.cardOpening : ""
                  }`}
                  aria-label={t.title}
                  disabled={Boolean(openingId)}
                  onClick={() => void openTitle(t)}
                >
                  <div className={styles.lockup}>
                    <img src={t.poster} alt="" loading="lazy" />
                    <PosterRating voteAverage={t.voteAverage} />
                    <div className={styles.chin}>
                      <div className={styles.ambient} aria-hidden />
                      <span className={styles.name}>
                        {t.title}
                        {openingId === t.id && (
                          <span
                            className={styles.inlineSpinner}
                            aria-label="Loading"
                          />
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </motion.ul>
        </AnimatePresence>

        {query.trim() && results.length === 0 && (
          <p className={styles.empty}>No results for “{query}”.</p>
        )}
      </div>
    </motion.div>
  );
}
