import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePageMeta } from "../../lib/usePageMeta";
import { SITE } from "../../lib/site";
import { SiteFooter } from "../../components/SiteFooter/SiteFooter";
import styles from "./Legal.module.css";

type Section = {
  id: string;
  title: string;
  body: ReactNode;
};

type Props = {
  title: string;
  description: string;
  path: string;
  updated: string;
  sections: Section[];
  children?: ReactNode;
};

export function LegalDocument({
  title,
  description,
  path,
  updated,
  sections,
  children,
}: Props) {
  usePageMeta({ title, description, path });

  return (
    <div className={styles.page}>
      <article className={styles.doc}>
        <nav className={styles.crumb} aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden>/</span>
          <Link to="/legal">Legal</Link>
          <span aria-hidden>/</span>
          <span>{title}</span>
        </nav>
        <header className={styles.header}>
          <h1>{title}</h1>
          <p className={styles.lead}>{description}</p>
          <p className={styles.meta}>Last updated: {updated}</p>
        </header>

        <aside className={styles.notice} role="note">
          <strong>{SITE.name} does not host media.</strong> We operate a
          discovery catalog and link index. We do not upload, store, stream
          from our servers, or own any movie or TV video files referenced on
          this site.
        </aside>

        {children}

        <nav className={styles.toc} aria-label="On this page">
          <h2 className={styles.tocTitle}>On this page</h2>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s) => (
          <section key={s.id} id={s.id} className={styles.section}>
            <h2>{s.title}</h2>
            <div className={styles.body}>{s.body}</div>
          </section>
        ))}

        <nav className={styles.related} aria-label="Related legal pages">
          <Link to="/legal">Legal hub</Link>
          <Link to="/dmca">DMCA</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </article>
      <SiteFooter />
    </div>
  );
}
