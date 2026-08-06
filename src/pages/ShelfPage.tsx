import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft } from "../components/Icons";
import { SiteFooter } from "../components/SiteFooter/SiteFooter";
import { TitleGrid } from "../components/TitleGrid/TitleGrid";
import { fetchShelfResolved } from "../data/api";
import { peekBrowseReturn } from "../lib/browseReturn";
import type { Shelf, Title } from "../data/types";
import { usePageMeta } from "../lib/usePageMeta";
import styles from "./Page.module.css";
import catStyles from "./CategoryPage.module.css";

type ShelfDetail = Shelf & { items: Title[] };

export function ShelfPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shelf, setShelf] = useState<ShelfDetail | null | undefined>(undefined);

  const heroImage = shelf?.items[0]?.backdrop || shelf?.items[0]?.poster;

  usePageMeta({
    title: shelf?.title ? `${shelf.title}` : "Collection",
    description: shelf
      ? `Browse ${shelf.title} on Pulse. We index links and metadata — we do not host media files.`
      : "Browse a collection on Pulse.",
    path: id ? `/shelf/${id}` : "/shelf",
    image: heroImage,
  });

  useEffect(() => {
    if (!id) {
      setShelf(null);
      return;
    }
    let cancelled = false;
    fetchShelfResolved(id)
      .then((data) => {
        if (!cancelled) setShelf(data);
      })
      .catch(() => {
        if (!cancelled) setShelf(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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

  if (shelf === undefined) {
    return <div className={styles.page} aria-busy="true" />;
  }

  if (!shelf) {
    return (
      <div className={styles.notFound}>
        <h1>Collection not found</h1>
        <Link to="/">Back to Home</Link>
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
          <h1 className={catStyles.title}>{shelf.title}</h1>
          <p className={catStyles.count}>
            {shelf.items.length} title{shelf.items.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <div className={styles.shelves}>
        {shelf.items.length > 0 ? (
          <TitleGrid items={shelf.items} />
        ) : (
          <p className={styles.loading}>No titles in this collection yet.</p>
        )}
      </div>
      <SiteFooter />
    </motion.div>
  );
}
