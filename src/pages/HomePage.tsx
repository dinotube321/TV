import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { HeroBillboard } from "../components/HeroBillboard/HeroBillboard";
import { ContentShelf } from "../components/ContentShelf/ContentShelf";
import { CategoryShelf } from "../components/CategoryShelf/CategoryShelf";
import { ContinueWatchingShelf } from "../components/ContinueWatchingShelf/ContinueWatchingShelf";
import { WatchlistShelf } from "../components/WatchlistShelf/WatchlistShelf";
import { SiteFooter } from "../components/SiteFooter/SiteFooter";
import { loadHomepage, invalidateCatalogCache } from "../data/api";
import type { Category, Shelf, Title } from "../data/catalog";
import { useRestoreBrowseScroll } from "../hooks/useRestoreBrowseScroll";
import { usePageMeta } from "../lib/usePageMeta";
import { SITE } from "../lib/site";
import styles from "./Page.module.css";

/** How many leading Top 10 shelves sit at the start of the homepage list. */
function leadingTop10Count(shelves: Shelf[]) {
  let n = 0;
  for (const s of shelves) {
    if (s.variant === "top10") n += 1;
    else break;
  }
  return n;
}

export function HomePage() {
  const [heroes, setHeroes] = useState<Title[]>([]);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ready, setReady] = useState(false);

  usePageMeta({
    description: SITE.description,
    path: "/",
  });

  useRestoreBrowseScroll(ready);

  useEffect(() => {
    let cancelled = false;
    invalidateCatalogCache();
    loadHomepage()
      .then((data) => {
        if (cancelled || !data) return;
        setHeroes(data.heroes);
        setShelves(
          data.shelves.map((s) => ({
            id: s.id,
            title: s.title,
            variant: s.variant,
            titleIds: s.titleIds,
            rule: s.rule,
            items: s.items,
          })),
        );
        setCategories(data.categories ?? []);
        setReady(true);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <div className={styles.page} aria-busy="true" />;
  }

  const top10Count = leadingTop10Count(shelves);
  const beforeWatchlist = shelves.slice(0, top10Count);
  const afterWatchlist = shelves.slice(top10Count);

  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      {heroes.length > 0 && <HeroBillboard titles={heroes} />}
      {heroes.length === 0 && shelves.length === 0 && categories.length === 0 && (
        <p className={styles.loading}>
          Catalog is empty. Open the admin panel and import titles from TMDB.
        </p>
      )}
      <div className={styles.shelves}>
        {categories.length > 0 && <CategoryShelf categories={categories} />}
        <ContinueWatchingShelf />
        {beforeWatchlist.map((shelf) => (
          <ContentShelf key={shelf.id} shelf={shelf} />
        ))}
        <WatchlistShelf />
        {afterWatchlist.map((shelf) => (
          <ContentShelf key={shelf.id} shelf={shelf} />
        ))}
      </div>
      <SiteFooter />
    </motion.div>
  );
}
