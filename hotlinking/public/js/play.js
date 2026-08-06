/**
 * Playback helper:
 * - Prefer server pick / reliable 1080p (Chrome often fails HEVC-in-TS 4K)
 * - Use 4K only when the browser can decode HEVC (or native HLS on Safari)
 * - If decode fails or frames stay blank, fall back quickly
 */
(function (global) {
  function canNativeHls() {
    const v = document.createElement("video");
    return v.canPlayType("application/vnd.apple.mpegurl") !== "";
  }

  function canHevc() {
    const v = document.createElement("video");
    return (
      v.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') !== "" ||
      v.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') !== "" ||
      v.canPlayType('video/mp4; codecs="hvc1"') !== ""
    );
  }

  /** True when UHD/HEVC is likely to paint frames (not audio-only black). */
  function canPlayUhd() {
    return canHevc() || canNativeHls();
  }

  function qualityHeight(q) {
    const s = String(q || "");
    if (/2160|4k/i.test(s)) return 2160;
    if (/1080/i.test(s)) return 1080;
    if (/720/i.test(s)) return 720;
    if (/480/i.test(s)) return 480;
    if (/360/i.test(s)) return 360;
    if (/play/i.test(s)) return 900;
    if (/auto|server|unknown/i.test(s)) return 1000;
    return 0;
  }

  function isUhd(q) {
    return qualityHeight(q) >= 2160;
  }

  function isEmbed(s) {
    return s && (s.format === "embed" || s.type === "embed");
  }

  function playabilityScore(s) {
    let n = 0;
    if (isEmbed(s)) n -= 200;
    if (s.preferredHit) n += 220;
    if (!s.backup) n += 30;
    const onRender = /\.onrender\.com$/i.test(location.hostname);
    if (s.server === "Classic") n += onRender ? -100 : 15;
    if (/^(Bear|Meteor|Hunter|Flying Flea|Scram)$/i.test(String(s.server || ""))) {
      n += onRender ? 35 : 8;
    }
    // Direct CORS URLs (workers.dev) skip the slow app proxy
    if (s.playUrl && /^https?:\/\//i.test(s.playUrl) && !/\/proxy\?/i.test(s.playUrl)) {
      n += 50;
    }
    if (onRender && s.format === "mp4") n += 35;
    const h = qualityHeight(s.quality);
    // Soft-cap: 1080 is the sweet spot for Chrome/hls.js
    if (h === 1080) n += 50;
    else if (h === 720) n += 40;
    else if (h >= 900 && h < 1080) n += 35;
    else if (h === 480) n += 20;
    else if (h >= 2160) n += canPlayUhd() ? 45 : -80;
    else n += 10;
    return n;
  }

  /** Prefer server pick; otherwise best reliable stream (not broken 4K on Chrome). */
  function pickSource(sources, serverPreferred) {
    const list = Array.isArray(sources) ? sources.slice() : [];
    if (!list.length) return null;

    if (serverPreferred?.playUrl && !isEmbed(serverPreferred)) {
      const match = list.find((s) => s.playUrl === serverPreferred.playUrl);
      if (match) {
        // Skip server 4K pick when this browser can't decode it
        if (!(isUhd(match.quality) && !canPlayUhd())) return match;
      }
      if (serverPreferred.preferredHit && serverPreferred.server) {
        const byServer = list
          .filter(
            (s) =>
              s.server === serverPreferred.server &&
              !(isUhd(s.quality) && !canPlayUhd()),
          )
          .sort((a, b) => playabilityScore(b) - playabilityScore(a))[0];
        if (byServer) return byServer;
      }
    }

    const streams = list.filter((s) => !isEmbed(s));
    const pool = (streams.length ? streams : list).filter(
      (s) => !(isUhd(s.quality) && !canPlayUhd()),
    );
    const ranked = (pool.length ? pool : streams.length ? streams : list)
      .slice()
      .sort((a, b) => playabilityScore(b) - playabilityScore(a));
    return ranked[0] || null;
  }

  function pickFallback(sources, tried, failedQuality) {
    const remaining = sources.filter(
      (s) => s.playUrl && !tried.has(s.playUrl) && !isEmbed(s),
    );
    if (!remaining.length) {
      const embeds = sources.filter(
        (s) => s.playUrl && !tried.has(s.playUrl) && isEmbed(s),
      );
      return embeds[0] || null;
    }

    const failedH = qualityHeight(failedQuality);
    remaining.sort((a, b) => playabilityScore(b) - playabilityScore(a));

    if (failedH >= 2160) {
      const p1080 = remaining.find((s) => qualityHeight(s.quality) === 1080);
      if (p1080) return p1080;
      const p720 = remaining.find((s) => qualityHeight(s.quality) === 720);
      if (p720) return p720;
    }

    const lower = remaining.find((s) => {
      const h = qualityHeight(s.quality);
      return h > 0 && h < failedH && !(h >= 2160 && !canPlayUhd());
    });
    return lower || remaining[0];
  }

  function destroyHls(state) {
    if (state._blankTimer) {
      clearInterval(state._blankTimer);
      state._blankTimer = null;
    }
    if (state.hls) {
      state.hls.destroy();
      state.hls = null;
    }
  }

  /** Audio plays but frames stay black → treat as fatal and switch source. */
  function watchBlankVideo(video, state, onBlank) {
    if (state._blankTimer) clearInterval(state._blankTimer);
    let ticks = 0;
    let lastTime = video.currentTime || 0;
    // ~3 × 280ms ≈ 840ms — fail over fast instead of staring at black
    state._blankTimer = setInterval(() => {
      if (video.paused) return;
      const t = video.currentTime || 0;
      const advancing = t > lastTime + 0.12;
      lastTime = t;
      if (!advancing) return;
      const w = video.videoWidth || 0;
      const h = video.videoHeight || 0;
      if (w >= 2 && h >= 2) {
        clearInterval(state._blankTimer);
        state._blankTimer = null;
        return;
      }
      ticks += 1;
      if (ticks >= 3) {
        clearInterval(state._blankTimer);
        state._blankTimer = null;
        onBlank("blank video (audio-only)");
      }
    }, 280);
  }

  function pickHlsLevel(levels) {
    const maxH = canPlayUhd() ? 2160 : 1080;
    let best = 0;
    let bestH = -1;
    levels.forEach((lv, i) => {
      const h = lv.height || 0;
      if (h > 0 && h <= maxH && h >= bestH) {
        bestH = h;
        best = i;
      }
    });
    if (bestH < 0) {
      // No height metadata — prefer middle/lower over top (often HEVC 4K)
      best = Math.max(0, Math.min(levels.length - 1, Math.floor(levels.length / 2)));
    }
    return best;
  }

  function play(video, source, opts = {}) {
    const state = opts.state || { hls: null };
    const sources = opts.sources || [];
    const tried = opts.tried || new Set();
    const startTime = Number(opts.startTime) || 0;
    const startPaused = !!opts.startPaused;
    tried.add(source.playUrl);

    destroyHls(state);
    try {
      video.crossOrigin = "anonymous";
    } catch (_) {}
    video.removeAttribute("src");
    video.load();

    const url = source.playUrl;
    const isMp4 =
      source.format === "mp4" ||
      source.type === "mp4" ||
      /\.mp4(\?|$)/i.test(url) ||
      /\/convert-h264\//i.test(url) ||
      /streamrk\.site\//i.test(url);
    const useNative =
      canNativeHls() && (isUhd(source.quality) || !global.Hls || !Hls.isSupported());

    const fallback = (reason, errorData) => {
      const next = pickFallback(sources, tried, source.quality);
      if (next) {
        if (typeof opts.onFallback === "function") opts.onFallback(next, reason);
        return play(video, next, { ...opts, state, tried, sources });
      }
      if (typeof opts.onFatal === "function") opts.onFatal(reason, errorData);
    };

    const resumeAndStart = (engine) => {
      const go = () => {
        if (startTime > 0.25 && isFinite(startTime)) {
          try {
            video.currentTime = startTime;
          } catch (_) {}
        }
        if (typeof opts.onStart === "function") opts.onStart(source, engine);
        watchBlankVideo(video, state, (reason) => {
          destroyHls(state);
          fallback(reason, null);
        });
        if (startPaused) {
          video.pause();
        } else {
          video.playsInline = true;
          const p = video.play();
          if (p && typeof p.catch === "function") {
            p.catch(() => {
              const retry = () => {
                video.play().catch(() => {});
              };
              video.addEventListener("canplay", retry, { once: true });
              setTimeout(retry, 250);
            });
          }
        }
      };

      if (video.readyState >= 1) {
        go();
      } else {
        video.addEventListener("loadedmetadata", go, { once: true });
      }
    };

    // Progressive MP4 (Vidcodin / Streamrip) — never feed HLS.js a .mp4
    if (isMp4) {
      video.src = url;
      const onOk = () => resumeAndStart("mp4");
      const onErr = () => fallback("mp4 error", null);
      video.addEventListener("loadedmetadata", onOk, { once: true });
      video.addEventListener("error", onErr, { once: true });
      return state;
    }

    if (useNative && canNativeHls()) {
      video.src = url;
      const onOk = () => resumeAndStart("native");
      const onErr = () => fallback("native error", null);
      video.addEventListener("loadedmetadata", onOk, { once: true });
      video.addEventListener("error", onErr, { once: true });
      return state;
    }

    if (global.Hls && Hls.isSupported()) {
      state.hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
        maxBufferSize: 18_000_000,
        maxBufferHole: 0.5,
        startLevel: -1,
        startFragPrefetch: true,
        autoStartLoad: true,
        startPosition: startTime > 0.25 ? startTime : -1,
        capLevelToPlayerSize: true,
        abrEwmaDefaultEstimate: 5_000_000,
        fragLoadingTimeOut: 45000,
        manifestLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 4,
        manifestLoadingMaxRetry: 3,
        levelLoadingTimeOut: 20000,
        xhrSetup(xhr) {
          xhr.withCredentials = false;
        },
      });
      state.hls.attachMedia(video);
      state.hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        state.hls.loadSource(url);
      });
      state.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        try {
          const levels = state.hls.levels || [];
          if (levels.length > 1) {
            const level = pickHlsLevel(levels);
            state.hls.startLevel = level;
            state.hls.currentLevel = level;
            // Allow ABR upward within the safe cap
            if (!canPlayUhd()) {
              state.hls.autoLevelCapping = level;
            }
            state.hls.autoLevelEnabled = true;
          }
        } catch (_) {}
        resumeAndStart("hls.js");
      });
      state.hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) {
          if (
            data.details === "bufferAppendError" ||
            data.details === "fragParsingError"
          ) {
            const next = pickFallback(sources, tried, source.quality);
            if (next) {
              destroyHls(state);
              if (typeof opts.onFallback === "function") {
                opts.onFallback(next, data.details);
              }
              play(video, next, { ...opts, state, tried, sources });
            }
          }
          return;
        }
        const reason =
          data.reason || data.details || data.type || "hls fatal";
        destroyHls(state);
        fallback(reason, data);
      });
      return state;
    }

    if (canNativeHls()) {
      video.src = url;
      video.addEventListener(
        "loadedmetadata",
        () => resumeAndStart("native"),
        { once: true },
      );
      return state;
    }

    if (typeof opts.onFatal === "function") {
      opts.onFatal("HLS not supported in this browser", null);
    }
    return state;
  }

  global.VidPlay = {
    canHevc,
    canNativeHls,
    canPlayUhd,
    isUhd,
    qualityHeight,
    pickSource,
    play,
    destroyHls,
  };
})(window);
