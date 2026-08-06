import { Link } from "react-router-dom";
import { usePageMeta } from "../../lib/usePageMeta";
import { SITE } from "../../lib/site";
import { SiteFooter } from "../../components/SiteFooter/SiteFooter";
import styles from "./Legal.module.css";

const docs = [
  {
    to: "/dmca",
    title: "DMCA & Copyright",
    blurb:
      "How rights holders can request delisting of indexed links. We do not host the underlying media.",
  },
  {
    to: "/privacy",
    title: "Privacy Policy",
    blurb:
      "What limited technical data we may process and how we handle it.",
  },
  {
    to: "/terms",
    title: "Terms of Use",
    blurb:
      "Rules for using our catalog, link index, and related pages.",
  },
] as const;

export function LegalHubPage() {
  usePageMeta({
    title: "Legal Information",
    description: `${SITE.name} legal hub: DMCA, privacy, and terms. We index links and do not host media files.`,
    path: "/legal",
  });

  return (
    <div className={styles.page}>
      <article className={styles.doc}>
        <nav className={styles.crumb} aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden>/</span>
          <span>Legal</span>
        </nav>
        <header className={styles.header}>
          <h1>Legal Information</h1>
          <p className={styles.lead}>
            {SITE.name} is a movie and TV discovery catalog. We publish
            metadata and index publicly available third-party links. We do not
            own, upload, store, or host any video files.
          </p>
          <p className={styles.meta}>Operated by {SITE.legalName}</p>
        </header>

        <aside className={styles.notice} role="note">
          <strong>Service model</strong>
          Think of {SITE.name} as a search / aggregator interface for titles
          and outbound links — similar in spirit to the link-index approach
          described by services such as{" "}
          <a href="https://zstream.mov/legal" rel="noopener noreferrer">
            Z-Stream&apos;s legal page
          </a>
          . Playback, if any, occurs on third-party sources outside our
          control. Requests from rights holders are handled as delisting of
          indexed references, not removal of hosted files (because we host
          none).
        </aside>

        <div className={styles.hubGrid}>
          {docs.map((d) => (
            <Link key={d.to} to={d.to} className={styles.hubCard}>
              <h2>{d.title}</h2>
              <p>{d.blurb}</p>
            </Link>
          ))}
        </div>

        <section className={styles.section}>
          <h2>Contact</h2>
          <div className={styles.body}>
            <p>
              Legal / DMCA:{" "}
              <a href={`mailto:${SITE.legalEmail}`}>{SITE.legalEmail}</a>
            </p>
            <p>
              General support:{" "}
              <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>
            </p>
            <p>
              Update these addresses in <code>src/lib/site.ts</code> before
              going live.
            </p>
          </div>
        </section>
      </article>
      <SiteFooter />
    </div>
  );
}
