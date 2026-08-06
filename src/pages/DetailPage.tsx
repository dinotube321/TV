import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { DetailHero } from "../components/DetailHero/DetailHero";
import { EpisodeList } from "../components/EpisodeList/EpisodeList";
import { ContentShelf } from "../components/ContentShelf/ContentShelf";
import { SiteFooter } from "../components/SiteFooter/SiteFooter";
import {
  AboutSection,
  CastRail,
  MediaRail,
} from "../components/MediaRail/MediaRail";
import {
  getTitleDetails,
  importAndGetTitle,
  looksLikeTmdbId,
  relatedTitles,
  type Title,
} from "../data/catalog";
import { invalidateCatalogCache } from "../data/api";
import { usePageMeta } from "../lib/usePageMeta";
import { SITE } from "../lib/site";
import styles from "./Page.module.css";
import detailStyles from "./DetailPage.module.css";

export function DetailPage() {
  const { id } = useParams();
  const [title, setTitle] = useState<Title | null | undefined>(undefined);
  const [related, setRelated] = useState<Title[]>([]);
  const [error, setError] = useState("");

  usePageMeta({
    title: title?.title,
    description: title
      ? `${title.title}${title.year ? ` (${title.year})` : ""} — ${
          title.synopsis?.slice(0, 150) ||
          "View details on Pulse. We index third-party links and do not host media files."
        }`
      : SITE.description,
    path: id ? `/title/${id}` : "/",
    image: title?.backdrop || title?.poster,
    type: title?.type === "show" ? "video.tv_show" : "video.movie",
  });

  useEffect(() => {
    if (!title) return;
    const scriptId = "pulse-title-jsonld";
    let el = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = scriptId;
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": title.type === "show" ? "TVSeries" : "Movie",
      name: title.title,
      description: title.synopsis,
      image: title.poster || title.backdrop,
      datePublished: title.year ? String(title.year) : undefined,
      url: `${window.location.origin}/title/${title.id}`,
    });
    return () => {
      document.getElementById(scriptId)?.remove();
    };
  }, [title]);

  useEffect(() => {
    if (!id) {
      setTitle(null);
      return;
    }
    let cancelled = false;
    setTitle(undefined);
    setRelated([]);
    setError("");

    (async () => {
      try {
        let details = await getTitleDetails(id);
        if (cancelled) return;

        if (!details && looksLikeTmdbId(id)) {
          details = await importAndGetTitle(id);
          invalidateCatalogCache();
        }

        if (cancelled) return;
        if (!details) {
          setTitle(null);
          return;
        }

        setTitle(details);
        const rel = await relatedTitles(details, 10);
        if (!cancelled) setRelated(rel);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load title");
        setTitle(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (title === undefined) {
    return <div className={styles.page} aria-busy="true" />;
  }

  if (!title) {
    return (
      <div className={styles.notFound}>
        <h1>Title not found</h1>
        {error && <p style={{ opacity: 0.65, marginBottom: 16 }}>{error}</p>}
        <Link to="/search">Back to Search</Link>
      </div>
    );
  }

  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <DetailHero title={title} />

      <div className={detailStyles.body}>
        {title.type === "show" && title.episodes && title.episodes.length > 0 && (
          <EpisodeList title={title} />
        )}

        {title.trailers && title.trailers.length > 0 && (
          <MediaRail id="trailers" heading="Trailers" items={title.trailers} />
        )}

        {title.bonus && title.bonus.length > 0 && (
          <MediaRail id="bonus" heading="Bonus Content" items={title.bonus} />
        )}

        <CastRail cast={title.cast} />
        <AboutSection title={title} />

        {related.length > 0 && (
          <ContentShelf
            shelf={{
              id: `${title.id}-related`,
              title: "You Might Also Like",
              titleIds: related.map((t) => t.id),
              items: related,
            }}
          />
        )}
      </div>

      <SiteFooter />
    </motion.div>
  );
}
