/** Extract an 11-char YouTube video id from common URL shapes or a bare id. */
export function extractYoutubeId(input: string | undefined | null): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = url.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;

      const parts = url.pathname.split("/").filter(Boolean);
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1] && /^[\w-]{11}$/.test(parts[embedIdx + 1])) {
        return parts[embedIdx + 1];
      }
      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx >= 0 && parts[shortsIdx + 1] && /^[\w-]{11}$/.test(parts[shortsIdx + 1])) {
        return parts[shortsIdx + 1];
      }
    }

    // Thumbnail CDN: i.ytimg.com/vi/{id}/hqdefault.jpg
    if (host === "i.ytimg.com" || host.endsWith(".ytimg.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const vi = parts.indexOf("vi");
      if (vi >= 0 && parts[vi + 1] && /^[\w-]{11}$/.test(parts[vi + 1])) {
        return parts[vi + 1];
      }
    }
  } catch {
    /* not a URL */
  }

  const loose = raw.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|ytimg\.com\/vi\/)([\w-]{11})/);
  return loose?.[1] ?? null;
}

/** Resolve a playable YouTube id from a trailer/bonus clip. */
export function youtubeIdFromClip(clip: {
  youtubeKey?: string;
  videoUrl?: string;
  image?: string;
}): string | null {
  return (
    extractYoutubeId(clip.youtubeKey) ||
    extractYoutubeId(clip.videoUrl) ||
    extractYoutubeId(clip.image)
  );
}
