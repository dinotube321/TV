/** Site identity — update domain/email when you deploy. */
export const SITE = {
  name: "Pulse",
  legalName: "Pulse",
  tagline: "Discover movies & TV shows. We index links — we never host media files.",
  description:
    "Pulse is a movie and TV discovery catalog. We provide metadata and links to publicly available third-party streams. We do not own, upload, store, or host any video files.",
  /** Replace with your production origin (no trailing slash). */
  canonicalOrigin:
    typeof window !== "undefined" ? window.location.origin : "https://pulse.example",
  legalEmail: "dmca@pulse.example",
  supportEmail: "support@pulse.example",
  twitterHandle: "",
} as const;

export function absoluteUrl(path: string) {
  const base = SITE.canonicalOrigin.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
