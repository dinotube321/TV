import {
  useEffect,
  useState,
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  AppleTvLogo,
  SearchIcon,
  PersonIcon,
  CloseIcon,
} from "../Icons";
import { useScrolled } from "../../hooks";
import { searchTitles, type Title } from "../../data/catalog";
import { openSearchResult } from "../../lib/openSearchResult";
import { AuthModal } from "../AuthModal/AuthModal";
import { useAuth } from "../../hooks/useAuth";
import styles from "./TopNav.module.css";

const tabs = [
  { to: "/movies", label: "Movies", end: false },
  { to: "/tv", label: "TV Shows", end: false },
  { to: "/watchlist", label: "Watchlist", end: true },
] as const;

const SUGGESTION_LIMIT = 4;

export function TopNav() {
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [suggestions, setSuggestions] = useState<Title[]>([]);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const listId = useId();
  const accountId = useId();
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const scrolled = useScrolled(12);
  const isBrowseDetail =
    location.pathname.startsWith("/shelf/") ||
    location.pathname.startsWith("/category/");
  const isHomeLike =
    location.pathname === "/" ||
    location.pathname === "/movies" ||
    location.pathname === "/tv" ||
    location.pathname === "/watchlist" ||
    location.pathname.startsWith("/title/") ||
    isBrowseDetail;
  const overlay = isHomeLike && !scrolled;

  useEffect(() => {
    setOpeningId(null);
    setAccountOpen(false);
    setMobileSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname === "/search") {
      const q = new URLSearchParams(location.search).get("q") ?? "";
      setQuery(q);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    let cancelled = false;
    const q = deferredQuery.trim();
    if (!q) {
      setSuggestions([]);
      setActive(-1);
      return;
    }
    searchTitles(q)
      .then((list) => {
        if (!cancelled) {
          setSuggestions(list.slice(0, SUGGESTION_LIMIT));
          setActive(-1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestions([]);
          setActive(-1);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [deferredQuery]);

  useEffect(() => {
    if (!mobileSearchOpen) return;
    const t = window.setTimeout(() => mobileInputRef.current?.focus(), 40);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, [mobileSearchOpen]);

  useEffect(() => {
    if (!accountOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  const showSuggest =
    (focused || Boolean(openingId) || mobileSearchOpen) &&
    query.trim().length > 0;

  async function pickTitle(t: Title) {
    if (openingId) return;
    if (t.pending) {
      setOpeningId(t.id);
      setFocused(true);
    }
    try {
      await openSearchResult(t, navigate);
      setMobileSearchOpen(false);
      setFocused(false);
    } catch {
      setOpeningId(null);
    }
  }

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    if (openingId) return;
    if (active >= 0 && suggestions[active]) {
      void pickTitle(suggestions[active]!);
      return;
    }
    const q = query.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    setFocused(false);
    setMobileSearchOpen(false);
  };

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (openingId) return;
    if (e.key === "Escape") {
      if (mobileSearchOpen) {
        setMobileSearchOpen(false);
        setFocused(false);
        return;
      }
      setFocused(false);
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (!showSuggest || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    }
  }

  const suggestRows = useMemo(() => suggestions, [suggestions]);

  function renderSuggestPanel(mobile = false) {
    if (!showSuggest) return null;
    return (
      <div
        className={`${styles.suggestPanel} ${mobile ? styles.suggestPanelMobile : ""}`}
        id={mobile ? undefined : listId}
        role="listbox"
      >
        {!mobile && <div className={styles.suggestDivider} aria-hidden />}
        {suggestRows.length === 0 ? (
          <p className={styles.suggestEmpty}>
            {deferredQuery.trim() !== query.trim()
              ? "Searching…"
              : `No matches for “${query.trim()}”`}
          </p>
        ) : (
          <ul className={styles.suggestList}>
            {suggestRows.map((t, i) => (
              <li key={t.id} role="option" aria-selected={active === i}>
                <button
                  type="button"
                  className={`${styles.suggestRow} ${
                    active === i ? styles.suggestActive : ""
                  } ${openingId === t.id ? styles.suggestOpening : ""}`}
                  disabled={Boolean(openingId)}
                  onMouseEnter={() => !openingId && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pickTitle(t)}
                >
                  <img
                    className={styles.suggestPoster}
                    src={t.poster}
                    alt=""
                    loading="lazy"
                  />
                  <div className={styles.suggestMeta}>
                    <div className={styles.suggestTitle}>
                      <span className={styles.suggestTitleText}>{t.title}</span>
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
                          <span className={styles.libraryTag}>In library</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <>
      <header
        className={`${styles.header} ${
          isBrowseDetail
            ? styles.frosted
            : overlay
              ? styles.overlay
              : styles.solid
        }`}
      >
        <div className={styles.inner}>
          <div className={styles.left}>
            <nav className={styles.tabs} aria-label="Channels">
              <ul className={styles.tabList}>
                <li>
                  <Link to="/" className={styles.logoTab} aria-label="Home">
                    <AppleTvLogo size={24} className={styles.tvLogo} />
                  </Link>
                </li>
                {tabs.map((tab) => (
                  <li key={tab.to}>
                    <NavLink
                      to={tab.to}
                      end={tab.end}
                      className={({ isActive }) =>
                        `${styles.tab} ${isActive ? styles.tabCurrent : ""}`
                      }
                    >
                      {tab.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className={styles.controls}>
            {/* Desktop search */}
            <div
              className={`${styles.searchShell} ${showSuggest && !mobileSearchOpen ? styles.searchOpen : ""}`}
            >
              <form className={styles.search} onSubmit={onSearch} role="search">
                <SearchIcon className={styles.searchIcon} />
                <input
                  type="search"
                  placeholder="Search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setFocused(true);
                  }}
                  onFocus={() => {
                    setFocused(true);
                    setAccountOpen(false);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setFocused(false), 180);
                  }}
                  onKeyDown={onKeyDown}
                  aria-label="Search"
                  aria-autocomplete="list"
                  aria-controls={listId}
                  aria-expanded={showSuggest && !mobileSearchOpen}
                />
              </form>
              {!mobileSearchOpen && renderSuggestPanel(false)}
            </div>

            {/* Mobile search trigger */}
            <button
              type="button"
              className={styles.searchIconBtn}
              aria-label="Search"
              aria-expanded={mobileSearchOpen}
              onClick={() => {
                setAccountOpen(false);
                setMobileSearchOpen(true);
                setFocused(true);
              }}
            >
              <SearchIcon size={18} />
            </button>

            {user ? (
              <div className={styles.account} ref={accountRef}>
                <button
                  type="button"
                  className={`${styles.signIn} ${accountOpen ? styles.signInOpen : ""}`}
                  aria-label={`Account: ${user.userId}`}
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  aria-controls={accountId}
                  title={user.userId}
                  onClick={() => {
                    setAccountOpen((v) => !v);
                    setFocused(false);
                  }}
                >
                  <PersonIcon />
                  <span className={styles.userId}>{user.userId}</span>
                </button>
                {accountOpen && (
                  <div
                    className={styles.accountMenu}
                    id={accountId}
                    role="menu"
                  >
                    <div className={styles.accountMenuHead}>
                      <span className={styles.accountMenuLabel}>Signed in</span>
                      <span className={styles.accountMenuName}>
                        {user.userId}
                      </span>
                    </div>
                    <div className={styles.accountMenuDivider} aria-hidden />
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.accountMenuItem}
                      onClick={() => {
                        logout();
                        setAccountOpen(false);
                      }}
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                className={styles.signIn}
                aria-label="Sign In"
                onClick={() => setAuthOpen(true)}
              >
                <PersonIcon />
                <span className={styles.signInLabel}>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile search overlay — full-width field + suggestions */}
      {mobileSearchOpen && (
        <div className={styles.mobileSearchRoot}>
          <button
            type="button"
            className={styles.mobileSearchBackdrop}
            aria-label="Close search"
            onClick={() => {
              setMobileSearchOpen(false);
              setFocused(false);
            }}
          />
          <div className={styles.mobileSearchSheet}>
            <form
              className={styles.mobileSearchForm}
              onSubmit={onSearch}
              role="search"
            >
              <SearchIcon className={styles.mobileSearchIcon} />
              <input
                ref={mobileInputRef}
                type="search"
                placeholder="Movies, shows, and more"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setFocused(true);
                }}
                onKeyDown={onKeyDown}
                aria-label="Search"
                aria-autocomplete="list"
                enterKeyHint="search"
                autoCapitalize="off"
                autoCorrect="off"
              />
              <button
                type="button"
                className={styles.mobileSearchClose}
                aria-label="Close"
                onClick={() => {
                  setMobileSearchOpen(false);
                  setFocused(false);
                }}
              >
                <CloseIcon size={16} />
              </button>
            </form>
            {renderSuggestPanel(true)}
          </div>
        </div>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
