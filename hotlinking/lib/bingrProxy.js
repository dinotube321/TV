/**
 * Same-origin reverse proxy for Bingr under /bingr/* so we can:
 *  - keep Pulse React Router paths (/watch/...) intact
 *  - serve Bingr assets through /bingr/assets (avoids module CORS)
 *  - proxy api.bingr.one via /bingr-api (Bingr CORS-blocks localhost)
 *  - inject redirect guards (spoof top/parent, block window.open)
 *  - lightly contain nested ad iframes without breaking known players
 *
 * IMPORTANT: Never proxy bare /watch — that is Pulse's watch page.
 * Bingr watch pages live at /bingr/watch/... → https://bingr.one/watch/...
 */
const BINGR_ORIGIN = "https://bingr.one";
const BINGR_API_ORIGIN = "https://api.bingr.one";
const BINGR_PREFIX = "/bingr";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

const GUARD_SCRIPT = `
<script data-pulse-bingr-guard="1">
(() => {
  if (window.__pulseBingrGuard) return;
  window.__pulseBingrGuard = true;
  const selfWin = window;
  const noopOpen = function () { return null; };
  const PREFIX = ${JSON.stringify(BINGR_PREFIX)};

  // Route Bingr API through same-origin proxy (api.bingr.one CORS-blocks localhost)
  const API_HOSTS = ["https://api.bingr.one", "http://api.bingr.one"];
  const toProxy = (url) => {
    try {
      const u = String(url);
      for (const host of API_HOSTS) {
        if (u.startsWith(host)) return "/bingr-api" + u.slice(host.length);
      }
      // Absolute bingr.one → same-origin /bingr/...
      if (/^https?:\\/\\/bingr\\.(one|live|app|net)/i.test(u)) {
        const parsed = new URL(u);
        return PREFIX + parsed.pathname + parsed.search;
      }
      // Root-relative Bingr paths when page is under /bingr/
      if (u.startsWith("/") && !u.startsWith(PREFIX + "/") && !u.startsWith("/bingr-api") && !u.startsWith("/proxy")) {
        if (
          u.startsWith("/watch/") ||
          u.startsWith("/assets/") ||
          u.startsWith("/brand/") ||
          u.startsWith("/icons/") ||
          u === "/manifest.webmanifest" ||
          u === "/favicon.ico" ||
          u === "/favicon.svg" ||
          u === "/apple-touch-icon.png"
        ) {
          return PREFIX + u;
        }
      }
    } catch (_) {}
    return url;
  };

  try {
    const origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        if (typeof input === "string") {
          input = toProxy(input);
        } else if (input && typeof input.url === "string") {
          const proxied = toProxy(input.url);
          if (proxied !== input.url) input = new Request(proxied, input);
        }
      } catch (_) {}
      return origFetch(input, init);
    };
  } catch (_) {}

  try {
    const XO = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try { url = toProxy(url); } catch (_) {}
      return XO.call(this, method, url, ...rest);
    };
  } catch (_) {}

  try {
    Object.defineProperty(window, "top", { configurable: true, get() { return selfWin; } });
    Object.defineProperty(window, "parent", { configurable: true, get() { return selfWin; } });
  } catch (_) {}

  try {
    window.open = noopOpen;
    Object.defineProperty(window, "open", { configurable: true, writable: true, value: noopOpen });
  } catch (_) {
    try { window.open = noopOpen; } catch (__) {}
  }

  const blockLink = (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    const t = (a.getAttribute("target") || "").toLowerCase();
    if (t === "_blank" || t === "_top" || t === "_parent") {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  document.addEventListener("click", blockLink, true);
  document.addEventListener("auxclick", blockLink, true);

  // Only sandbox nested iframes that look like ads — never known stream hosts
  const PLAYER_OK = /filmu|videasy|cinezo|vidbolt|vidrift|youtube|youtu\\.be|vimeo|player\\./i;
  const NESTED_SANDBOX = [
    "allow-scripts",
    "allow-same-origin",
    "allow-forms",
    "allow-presentation",
    "allow-fullscreen",
    "allow-pointer-lock",
  ].join(" ");

  function guardIframe(frame) {
    if (!frame || frame.tagName !== "IFRAME") return;
    if (frame.dataset.pulseGuarded === "1") return;
    const src = frame.getAttribute("src") || frame.src || "";
    if (!src || src === "about:blank") return;
    if (PLAYER_OK.test(src)) {
      frame.dataset.pulseGuarded = "1";
      return;
    }
    frame.dataset.pulseGuarded = "1";
    try {
      frame.setAttribute("sandbox", NESTED_SANDBOX);
      frame.setAttribute("allowfullscreen", "");
    } catch (_) {}
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("iframe").forEach(guardIframe);
  }

  const boot = () => {
    scan(document);
    try {
      const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === "attributes" && m.target && m.target.tagName === "IFRAME") {
            guardIframe(m.target);
          }
          m.addedNodes && m.addedNodes.forEach((n) => {
            if (n.tagName === "IFRAME") guardIframe(n);
            else scan(n);
          });
        }
      });
      mo.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src"],
      });
    } catch (_) {}
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
</script>`;

function shouldProxyPath(pathname) {
  // Only under /bingr/ — never bare /watch (Pulse SPA owns that)
  return pathname === BINGR_PREFIX || pathname.startsWith(`${BINGR_PREFIX}/`);
}

/** /bingr/watch/x → /watch/x for upstream bingr.one */
function toUpstreamPath(pathname) {
  if (pathname === BINGR_PREFIX || pathname === `${BINGR_PREFIX}/`) return "/";
  if (pathname.startsWith(`${BINGR_PREFIX}/`)) {
    return pathname.slice(BINGR_PREFIX.length) || "/";
  }
  return pathname;
}

function rewriteHtml(html) {
  let out = String(html || "");
  // Point root-relative Bingr URLs at our /bingr prefix
  out = out.replace(
    /(href|src|action)=(["'])\/(?!bingr\/|bingr-api\/|proxy\/)/gi,
    (m, attr, quote) => `${attr}=${quote}${BINGR_PREFIX}/`,
  );
  out = out.replace(
    /https?:\/\/bingr\.(one|live|app|net)/gi,
    BINGR_PREFIX,
  );
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n${GUARD_SCRIPT}`);
  } else {
    out = `${GUARD_SCRIPT}\n${out}`;
  }
  return out;
}

async function proxyBingr(req, res) {
  const pathname = req.path || "/";
  const search = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const upstreamPath = toUpstreamPath(pathname);
  const target = `${BINGR_ORIGIN}${upstreamPath}${search}`;

  try {
    const upstream = await fetch(target, {
      headers: {
        ...BROWSER_HEADERS,
        Accept:
          req.headers.accept ||
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: `${BINGR_ORIGIN}/`,
        Origin: BINGR_ORIGIN,
      },
      redirect: "follow",
    });

    const contentType = upstream.headers.get("content-type") || "";
    const status = upstream.status;

    const headers = {
      "Cache-Control":
        contentType.includes("text/html") ? "no-store" : "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    };
    if (contentType) headers["Content-Type"] = contentType;

    if (contentType.includes("text/html")) {
      // Bingr SPA may return index.html for unknown /assets/* — don't serve that as JS
      if (upstreamPath.startsWith("/assets/")) {
        return res.status(404).type("text/plain").send("Asset not found");
      }
      let html = await upstream.text();
      html = rewriteHtml(html);
      res.status(status);
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
      return res.send(html);
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(status);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.send(buf);
  } catch (err) {
    return res
      .status(502)
      .type("text/plain")
      .send(`Bingr proxy error: ${err.message || "failed"}`);
  }
}

function bingrProxyMiddleware(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (!shouldProxyPath(req.path)) return next();
  return proxyBingr(req, res);
}

/**
 * Proxy Bingr API with a forged Origin/Referer so upstream accepts the request.
 * Mounted at /bingr-api → https://api.bingr.one
 */
async function proxyBingrApi(req, res) {
  const pathWithQuery = req.originalUrl.replace(/^\/bingr-api/, "") || "/";
  const target = `${BINGR_API_ORIGIN}${pathWithQuery}`;

  try {
    const headers = {
      ...BROWSER_HEADERS,
      Origin: BINGR_ORIGIN,
      Referer: `${BINGR_ORIGIN}/`,
      Accept: req.headers.accept || "application/json, text/plain, */*",
    };
    if (req.headers["content-type"]) {
      headers["Content-Type"] = req.headers["content-type"];
    }
    if (req.headers["authorization"]) {
      headers.Authorization = req.headers["authorization"];
    }

    const init = {
      method: req.method,
      headers,
      redirect: "follow",
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      if (req.body !== undefined && req.body !== null) {
        init.body =
          typeof req.body === "string" || Buffer.isBuffer(req.body)
            ? req.body
            : JSON.stringify(req.body);
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      }
    }

    if (req.method === "OPTIONS") {
      res.set({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
      });
      return res.status(204).end();
    }

    const upstream = await fetch(target, init);
    const contentType = upstream.headers.get("content-type") || "application/json";
    const buf = Buffer.from(await upstream.arrayBuffer());

    res.status(upstream.status);
    res.set({
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    return res.send(buf);
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: err.message || "Bingr API proxy failed",
    });
  }
}

function mountBingrApiProxy(app) {
  app.use("/bingr-api", (req, res, next) => {
    return proxyBingrApi(req, res, next);
  });
}

/** Rewrite absolute Bingr watch URLs to same-origin /bingr/... for the embed iframe. */
function toSameOriginBingrUrl(url) {
  try {
    const raw = String(url || "");
    // Already namespaced
    if (raw.startsWith(`${BINGR_PREFIX}/`) || raw === BINGR_PREFIX) return raw;
    // Legacy bare /watch from older extracts → namespace it
    if (
      raw.startsWith("/watch/") ||
      raw.startsWith("/assets/") ||
      raw.startsWith("/brand/")
    ) {
      return `${BINGR_PREFIX}${raw}`;
    }
    const u = new URL(raw, "https://bingr.one");
    if (!/bingr\.(one|live|app|net)$/i.test(u.hostname) && u.hostname !== "localhost") {
      return url;
    }
    return `${BINGR_PREFIX}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

module.exports = {
  BINGR_ORIGIN,
  BINGR_API_ORIGIN,
  BINGR_PREFIX,
  shouldProxyPath,
  bingrProxyMiddleware,
  proxyBingr,
  mountBingrApiProxy,
  proxyBingrApi,
  toSameOriginBingrUrl,
};
