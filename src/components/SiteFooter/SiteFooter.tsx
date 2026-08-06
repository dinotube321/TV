import { Link } from "react-router-dom";
import { SITE } from "../../lib/site";
import styles from "./SiteFooter.module.css";

const explore = [
  { to: "/", label: "Home" },
  { to: "/movies", label: "Movies" },
  { to: "/tv", label: "TV Shows" },
  { to: "/watchlist", label: "Watchlist" },
  { to: "/search", label: "Search" },
] as const;

const legal = [
  { to: "/legal", label: "Legal" },
  { to: "/dmca", label: "DMCA" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
] as const;

const faqs = [
  {
    q: `Does ${SITE.name} host movies or TV files?`,
    a: `No. ${SITE.name} is a discovery catalog and link index. We do not upload, store, own, or host video files. Any playback comes from independent third-party sources outside our servers.`,
  },
  {
    q: "Is this a piracy website?",
    a: `No. We do not distribute media from our infrastructure. We index publicly available metadata and may surface links or embeds controlled by others. Rights holders can request delisting via our DMCA page.`,
  },
  {
    q: "How do copyright owners request removal?",
    a: `Send a complete notice to ${SITE.legalEmail} as described on our DMCA page. Valid notices result in delisting of indexed references — we cannot delete files we do not host.`,
  },
  {
    q: "Who is responsible for third-party streams?",
    a: "You and the third-party source. Always follow the laws of your country. We are not responsible for content hosted elsewhere.",
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <section className={styles.disclaimer}>
        <p className={styles.brand}>{SITE.name}</p>
        <h2>We index links. We don&apos;t host media.</h2>
        <p className={styles.sub}>
          {SITE.description} Copyright complaints are handled as delisting
          requests — see our{" "}
          <Link to="/dmca">DMCA policy</Link>.
        </p>
      </section>

      <section className={styles.faq} id="faq" aria-labelledby="faq-heading">
        <h2 id="faq-heading">Questions? Answers.</h2>
        <div className={styles.accordion}>
          {faqs.map((item) => (
            <details key={item.q} className={styles.item}>
              <summary>
                <span>{item.q}</span>
                <span className={styles.chev} aria-hidden>
                  ▾
                </span>
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.columns}>
        <div>
          <h3>Explore</h3>
          <ul>
            {explore.map((l) => (
              <li key={l.to}>
                <Link to={l.to}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Legal</h3>
          <ul>
            {legal.map((l) => (
              <li key={l.to}>
                <Link to={l.to}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Contact</h3>
          <ul>
            <li>
              <a href={`mailto:${SITE.legalEmail}`}>DMCA / Legal</a>
            </li>
            <li>
              <a href={`mailto:${SITE.supportEmail}`}>Support</a>
            </li>
          </ul>
        </div>
      </section>

      <section className={styles.bottom}>
        <p>
          © {year} {SITE.legalName}. All original site materials reserved.
          Third-party titles, artwork, and trademarks belong to their
          respective owners. {SITE.name} is not affiliated with those rights
          holders.
        </p>
        <p className={styles.seoLine}>
          Movie &amp; TV discovery · Link index · No hosted media files
        </p>
      </section>
    </footer>
  );
}
