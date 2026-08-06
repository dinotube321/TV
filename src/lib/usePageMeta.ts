import { useEffect } from "react";
import { SITE, absoluteUrl } from "./site";

export type PageMeta = {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  type?: "website" | "article" | "video.movie" | "video.tv_show";
  noindex?: boolean;
};

function upsertMeta(
  attr: "name" | "property",
  key: string,
  content: string,
) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(
    `link[rel="${rel}"]`,
  ) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

/** Per-route SEO: title, description, canonical, Open Graph, Twitter. */
export function usePageMeta(meta: PageMeta) {
  useEffect(() => {
    const title = meta.title
      ? `${meta.title} · ${SITE.name}`
      : `${SITE.name} — Movies & TV Discovery`;
    const description = meta.description || SITE.description;
    const path = meta.path || "/";
    const url = absoluteUrl(path);
    const image = meta.image
      ? meta.image.startsWith("http")
        ? meta.image
        : absoluteUrl(meta.image)
      : absoluteUrl("/favicon.svg");

    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", meta.noindex ? "noindex,nofollow" : "index,follow");
    upsertLink("canonical", url);

    upsertMeta("property", "og:site_name", SITE.name);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", meta.type || "website");
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:image", image);

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", image);
  }, [
    meta.title,
    meta.description,
    meta.path,
    meta.image,
    meta.type,
    meta.noindex,
  ]);
}
