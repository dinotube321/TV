/**
 * Cloudflare Worker — edge media proxy for Classic / hotlink streams.
 *
 * Why: On Render free tier, tunneling every HLS segment through the app is too
 * slow (Classic never starts). This worker sits on Cloudflare’s edge, adds the
 * required Referer, rewrites playlists, and streams with CORS so the browser
 * never pulls video bytes through Render.
 *
 * Deploy (free):
 *   1. https://dash.cloudflare.com → Workers & Pages → Create Worker
 *   2. Paste this file, Deploy
 *   3. In Render env: EDGE_PROXY_BASE=https://YOUR_SUBDOMAIN.workers.dev
 *   4. Redeploy the web service
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Expose-Headers": "*",
    ...extra,
  };
}

function isSafeUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "metadata.google.internal"
    ) {
      return false;
    }
    if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function workerProxyUrl(workerOrigin, absoluteUrl, referer, origin) {
  let u = `${workerOrigin}/?url=${encodeURIComponent(absoluteUrl)}`;
  if (referer) u += `&referer=${encodeURIComponent(referer)}`;
  if (origin) u += `&origin=${encodeURIComponent(origin)}`;
  return u;
}

function resolveUrl(maybeRelative, playlistUrl) {
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  return new URL(maybeRelative, playlistUrl).toString();
}

function rewritePlaylist(body, playlistUrl, workerOrigin, referer, origin) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        if (!trimmed.includes("URI=")) return line;
        return line.replace(/URI="([^"]+)"/gi, (_, uri) => {
          const abs = resolveUrl(uri, playlistUrl);
          return `URI="${workerProxyUrl(workerOrigin, abs, referer, origin)}"`;
        });
      }
      const abs = resolveUrl(trimmed, playlistUrl);
      return workerProxyUrl(workerOrigin, abs, referer, origin);
    })
    .join("\n");
}

function sniffType(buf, contentType, targetUrl) {
  if (buf && buf.byteLength && buf[0] === 0x47) return "video/mp2t";
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("mpegurl") || /\.m3u8(\?|$)/i.test(targetUrl)) {
    return "application/vnd.apple.mpegurl";
  }
  if (ct.includes("mp4") || /\.mp4(\?|$)/i.test(targetUrl)) return "video/mp4";
  if (/\/seg-\d+/i.test(targetUrl) || /\.ts(\?|$)/i.test(targetUrl)) {
    return "video/mp2t";
  }
  if (/image\/(jpeg|jpg|png)/i.test(ct) && /\/vd\//i.test(targetUrl)) {
    return "video/mp2t";
  }
  return contentType || "application/octet-stream";
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get("url");
    if (!target || !isSafeUrl(target)) {
      return new Response("Missing or invalid url", {
        status: 400,
        headers: corsHeaders(),
      });
    }

    const referer =
      reqUrl.searchParams.get("referer") || "https://www.vidking.net/";
    const origin =
      reqUrl.searchParams.get("origin") || "https://www.vidking.net";

    const upstreamHeaders = {
      "User-Agent": UA,
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: referer,
      Origin: origin,
    };
    const range = request.headers.get("Range");
    if (range) upstreamHeaders.Range = range;

    const upstream = await fetch(target, {
      headers: upstreamHeaders,
      redirect: "follow",
    });

    const contentType = upstream.headers.get("content-type") || "";
    const targetStr = target;
    const isPlaylist =
      contentType.includes("mpegurl") ||
      contentType.includes("m3u8") ||
      /\.m3u8(\?|$)/i.test(targetStr) ||
      /\/playlist\/[^/?]+/i.test(targetStr);

    if (isPlaylist) {
      const text = await upstream.text();
      if (!text.trimStart().startsWith("#EXTM3U")) {
        return new Response(text, {
          status: upstream.status,
          headers: corsHeaders({
            "Content-Type": contentType || "text/plain",
            "Cache-Control": "no-store",
          }),
        });
      }
      const rewritten = rewritePlaylist(
        text,
        targetStr,
        reqUrl.origin,
        referer,
        origin,
      );
      return new Response(rewritten, {
        status: 200,
        headers: corsHeaders({
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-store",
        }),
      });
    }

    // Peek first bytes for disguised TS segments, then stream the rest
    const reader = upstream.body?.getReader();
    if (!reader) {
      return new Response(null, {
        status: upstream.status,
        headers: corsHeaders({ "Content-Type": contentType }),
      });
    }

    const first = await reader.read();
    const head = first.value || new Uint8Array();
    const outType = sniffType(head, contentType, targetStr);

    const stream = new ReadableStream({
      async start(controller) {
        if (head.byteLength) controller.enqueue(head);
        if (first.done) {
          controller.close();
          return;
        }
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      },
      cancel() {
        reader.cancel();
      },
    });

    const headers = corsHeaders({
      "Content-Type": outType,
      "Cache-Control": "public, max-age=120",
    });
    const len = upstream.headers.get("content-length");
    const cr = upstream.headers.get("content-range");
    const ar = upstream.headers.get("accept-ranges");
    if (len) headers["Content-Length"] = len;
    if (cr) headers["Content-Range"] = cr;
    if (ar) headers["Accept-Ranges"] = ar;

    return new Response(stream, {
      status: upstream.status,
      headers,
    });
  },
};
