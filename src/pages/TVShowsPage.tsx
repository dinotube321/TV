import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { HeroBillboard } from "../components/HeroBillboard/HeroBillboard";
import { ContentShelf } from "../components/ContentShelf/ContentShelf";
import { SiteFooter } from "../components/SiteFooter/SiteFooter";
import { fetchBrowsePage, invalidateCatalogCache } from "../data/api";
import type { Shelf, Title } from "../data/catalog";
import { useRestoreBrowseScroll } from "../hooks/useRestoreBrowseScroll";
import { usePageMeta } from "../lib/usePageMeta";
import styles from "./Page.module.css";

export function TVShowsPage() {
  const [heroes, setHeroes] = useState<Title[]>([]);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [ready, setReady] = useState(false);

  usePageMeta({
    title: "TV Shows",
    description:
      "Browse TV shows in the Pulse catalog. Link-based discovery only — Pulse does not host media files.",
    path: "/tv",
  });

  useRestoreBrowseScroll(ready);

  useEffect(() => {
    let cancelled = false;
    invalidateCatalogCache();
    fetchBrowsePage("tv")
      .then((data) => {
        if (cancelled) return;
        setHeroes(data.heroes ?? []);
        setShelves(
          (data.shelves ?? []).map((s) => ({
            id: s.id,
            title: s.title,
            variant: s.variant,
            titleIds: s.titleIds,
            rule: s.rule,
            items: s.items,
          })),
        );
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

  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      {heroes.length > 0 && <HeroBillboard titles={heroes} />}
      <div className={styles.shelves}>
        {shelves.map((shelf) => (
          <ContentShelf key={shelf.id} shelf={shelf} />
        ))}
      </div>
      <SiteFooter />
    </motion.div>
  );
}
