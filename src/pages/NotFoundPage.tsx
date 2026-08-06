import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { usePageMeta } from "../lib/usePageMeta";
import { SITE } from "../lib/site";
import styles from "./NotFoundPage.module.css";

export function NotFoundPage() {
  usePageMeta({
    title: "Page not found",
    description: `This page doesn’t exist on ${SITE.name}.`,
    path: typeof window !== "undefined" ? window.location.pathname : "/404",
    noindex: true,
  });

  return (
    <div className={styles.page}>
      <motion.div
        className={styles.panel}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>Looks like you’ve been lost</h1>
        <p className={styles.lead}>
          That page isn’t on {SITE.name}. It may have moved, or the link is
          wrong.
        </p>
        <div className={styles.actions}>
          <Link to="/" className={styles.primary}>
            Back to Home
          </Link>
          <Link to="/search" className={styles.secondary}>
            Search
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
