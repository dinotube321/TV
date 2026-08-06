import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft } from "../components/Icons";
import { SiteFooter } from "../components/SiteFooter/SiteFooter";
import { TitleGrid } from "../components/TitleGrid/TitleGrid";
import { fetchTitlesByIds } from "../data/api";
import { useWatchlistIds } from "../hooks/useWatchlist";
import { loadWatchlist, type WatchlistEntry } from "../lib/watchlist";
import { peekBrowseReturn } from "../lib/browseReturn";
import type { Title } from "../data/types";
import { usePageMeta } from "../lib/usePageMeta";
import styles from "./Page.module.css";
import catStyles from "./CategoryPage.module.css";

function entryToTitle(entry: WatchlistEntry): Title {
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    tagline: "",
    synopsis: "",
    year: entry.year ?? 0,
    rating: "",
    genres: [],
    poster: entry.poster,
    backdrop: entry.poster,
    cast: [],
  };
}

export function WatchlistPage() {
  const navigate = useNavigate();
  const ids = useWatchlistIds();
  const [items, setItems] = useState<Title[] | undefined>(undefined);

  const heroImage = items?.[0]?.backdrop || items?.[0]?.poster;

  usePageMeta({
    title: "My Watchlist",
    description:
      "Your saved movies and shows on Pulse. Stored on this device — no account required.",
    path: "/watchlist",
    image: heroImage,
  });

  useEffect(() => {
    let cancelled = false;
    const entries = loadWatchlist();
    if (!entries.length) {
      setItems([]);
      return;
    }

    const snapshots = entries.map(entryToTitle);
    setItems(snapshots);

    fetchTitlesByIds(entries.map((e) => e.id))
      .then((fetched) => {
        if (cancelled || !fetched?.length) return;
        const byId = new Map(fetched.map((t) => [t.id, t]));
        setItems(entries.map((e) => byId.get(e.id) ?? entryToTitle(e)));
      })
      .catch(() => {
        /* keep snapshots */
      });

    return () => {
      cancelled = true;
    };
  }, [ids]);

  function goBack() {
    const ret = peekBrowseReturn();
    if (ret?.path) {
      navigate(ret.path, { state: { restoreBrowse: true } });
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  }

  if (items === undefined) {
    return <div className={styles.page} aria-busy="true" />;
  }

  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <header className={catStyles.hero}>
        <button type="button" className={catStyles.back} onClick={goBack}>
          <ChevronLeft size={18} />
          Back
        </button>
        {heroImage ? (
          <img src={heroImage} alt="" className={catStyles.heroImage} />
        ) : null}
        <div className={catStyles.heroFade} />
        <div className={catStyles.heroCopy}>
          <p className={catStyles.eyebrow}>Collection</p>
          <h1 className={catStyles.title}>My Watchlist</h1>
          <p className={catStyles.count}>
            {items.length} title{items.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <div className={styles.shelves}>
        {items.length > 0 ? (
          <TitleGrid items={items} />
        ) : (
          <p className={styles.loading}>
            Your watchlist is empty. Tap + on any title to save it here.
          </p>
        )}
      </div>
      <SiteFooter />
    </motion.div>
  );
}
