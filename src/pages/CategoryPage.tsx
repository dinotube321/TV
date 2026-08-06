import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft } from "../components/Icons";
import { SiteFooter } from "../components/SiteFooter/SiteFooter";
import { TitleGrid } from "../components/TitleGrid/TitleGrid";
import { fetchCategory } from "../data/api";
import { peekBrowseReturn } from "../lib/browseReturn";
import type { Category, Title } from "../data/types";
import { usePageMeta } from "../lib/usePageMeta";
import styles from "./Page.module.css";
import catStyles from "./CategoryPage.module.css";

export function CategoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [category, setCategory] = useState<(Category & { items: Title[] }) | null | undefined>(
    undefined,
  );

  usePageMeta({
    title: category?.title ? `${category.title} movies & TV` : "Category",
    description: category
      ? `Browse ${category.title} titles on Pulse. We index links and metadata — we do not host media files.`
      : "Browse category titles on Pulse.",
    path: id ? `/category/${id}` : "/category",
    image: category?.image,
  });

  useEffect(() => {
    if (!id) {
      setCategory(null);
      return;
    }
    let cancelled = false;
    fetchCategory(id)
      .then((data) => {
        if (!cancelled) setCategory(data);
      })
      .catch(() => {
        if (!cancelled) setCategory(null);
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

  if (category === undefined) {
    return <div className={styles.page} aria-busy="true" />;
  }

  if (!category) {
    return (
      <div className={styles.notFound}>
        <h1>Category not found</h1>
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
        <img src={category.image} alt="" className={catStyles.heroImage} />
        <div className={catStyles.heroFade} />
        <div className={catStyles.heroCopy}>
          <p className={catStyles.eyebrow}>Category</p>
          <h1 className={catStyles.title}>{category.title}</h1>
          <p className={catStyles.count}>
            {category.items.length} title{category.items.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <div className={styles.shelves}>
        {category.items.length > 0 ? (
          <TitleGrid items={category.items} />
        ) : (
          <p className={styles.loading}>
            No titles in this category yet. Assign titles or genre rules in admin.
          </p>
        )}
      </div>
      <SiteFooter />
    </motion.div>
  );
}
