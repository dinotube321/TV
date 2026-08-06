/**
 * MagSrv 728×90 banner.
 * Shows on pause + every 15 min of watch time.
 * Close: 50% ad-click / 50% dismiss.
 */
(function (global) {
  "use strict";

  const cfg = () => global.AdsConfig || {};
  const banCfg = () => cfg().banner || {};

  class AdManager {
    constructor({ player, contentVideo, root }) {
      this.player = player;
      this.contentVideo = contentVideo;
      this.root = root || player;

      this.busy = false;
      this._onState = null;
      this._watchedMs = 0;
      this._lastTick = null;
      this._lastBucket = 0;
      this._visible = false;
      this._closeArmed = true;
      this._serving = false;
      this._pauseCooldownUntil = 0;

      this._buildDom();
      this._bindContent();
      this._ensureAdProvider().catch(() => {});
    }

    _buildDom() {
      const b = banCfg();
      const zoneId = b.zoneId || "5984476";
      const insClass = b.insClass || "eas6a97888e2";

      const el = document.createElement("div");
      el.className = "banner-ad";
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = `
        <div class="banner-ad-inner">
          <button type="button" class="banner-ad-close" id="bannerAdClose" title="Close" aria-label="Close">×</button>
          <div class="banner-ad-slot" id="bannerAdSlot">
            <ins class="${insClass}" data-zoneid="${zoneId}" style="display:block;width:728px;height:90px;"></ins>
          </div>
        </div>
      `;
      this.root.appendChild(el);
      this.bannerEl = el;
      this.bannerInner = el.querySelector(".banner-ad-inner");
      this.bannerSlot = el.querySelector("#bannerAdSlot");
      this.closeBtn = el.querySelector("#bannerAdClose");

      this.closeBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this._onCloseAttempt();
      };

      this._fitBannerScale();
      global.addEventListener("resize", () => this._fitBannerScale());
    }

    _fitBannerScale() {
      const w = this.player?.clientWidth || global.innerWidth || 728;
      const scale = Math.min(1, Math.max(0.35, (w - 24) / 728));
      if (this.bannerInner) {
        this.bannerInner.style.setProperty("--banner-scale", String(scale));
      }
    }

    _bindContent() {
      const v = this.contentVideo;
      v.addEventListener("timeupdate", () => this._onTimeUpdate());
      v.addEventListener("play", () => {
        this._lastTick = performance.now();
        // Hide on resume only if user didn't just get the interval banner
      });
      v.addEventListener("pause", () => {
        this._lastTick = null;
        this._onPause();
      });
      v.addEventListener("ended", () => {
        this._lastTick = null;
      });
      v.addEventListener("seeking", () => {
        // Avoid pause-ad flash during seeks
        this._pauseCooldownUntil = Date.now() + 800;
      });
    }

    onStateChange(fn) {
      this._onState = fn;
    }

    _ensureAdProvider() {
      const src = cfg().providerSrc || "https://a.magsrv.com/ad-provider.js";
      if (global.__magsrvAdProviderReady) return global.__magsrvAdProviderReady;

      global.__magsrvAdProviderReady = new Promise((done) => {
        const existing = document.querySelector('script[data-magsrv-provider="1"]');
        if (existing) {
          if (existing.dataset.loaded === "1") {
            done();
            return;
          }
          existing.addEventListener("load", () => done(), { once: true });
          existing.addEventListener("error", () => done(), { once: true });
          // Fallback if already complete
          setTimeout(() => done(), 1500);
          return;
        }
        const s = document.createElement("script");
        s.async = true;
        s.type = "application/javascript";
        s.src = src + (src.includes("?") ? "&" : "?") + "v=" + Date.now();
        s.dataset.magsrvProvider = "1";
        s.onload = () => {
          s.dataset.loaded = "1";
          done();
        };
        s.onerror = () => {
          console.warn("[ads] failed to load ad-provider.js");
          done();
        };
        document.head.appendChild(s);
        setTimeout(() => done(), 4000);
      });
      return global.__magsrvAdProviderReady;
    }

    _forceServe() {
      try {
        global.AdProvider = global.AdProvider || [];
        global.AdProvider.push({ serve: {} });
        if (typeof global.AdProvider.serve === "function") {
          global.AdProvider.serve({});
        }
      } catch (err) {
        console.warn("[ads] serve error", err);
      }
    }

    _injectIns() {
      const b = banCfg();
      const zoneId = String(b.zoneId || "5984476");
      const insClass = b.insClass || "eas6a97888e2";
      if (!this.bannerSlot) return;
      this.bannerSlot.innerHTML = "";
      const ins = document.createElement("ins");
      ins.className = insClass;
      ins.setAttribute("data-zoneid", zoneId);
      ins.style.cssText = "display:block!important;width:728px;height:90px;min-width:300px;min-height:90px;visibility:visible!important;opacity:1!important;";
      this.bannerSlot.appendChild(ins);
      return ins;
    }

    async showBanner(reason) {
      if (!cfg().enabled) return;
      if (this._serving) return;

      this._serving = true;
      try {
        // 1) Make the shell visible FIRST — MagSrv skips display:none slots
        this._visible = true;
        this._closeArmed = true;
        this._fitBannerScale();
        this.player.classList.add("show-banner-ad");
        this.bannerEl.setAttribute("aria-hidden", "false");
        void this.bannerEl.offsetWidth; // reflow

        await this._ensureAdProvider();

        // 2) Inject a fresh <ins> into the now-visible slot
        this._injectIns();
        void this.bannerSlot?.offsetWidth;

        // 3) Force serve repeatedly until fill or timeout
        this._forceServe();
        let prev = 0;
        for (const ms of [250, 600, 1200, 2000, 3200]) {
          await new Promise((r) => setTimeout(r, ms - prev));
          prev = ms;
          if (!this._visible) break;
          if (this._slotFilled()) break;
          if (ms >= 1200) this._injectIns();
          this._forceServe();
        }

        if (this._onState) this._onState(true);
        console.info("[ads] banner shown:", reason || "manual", "filled=", this._slotFilled());
      } finally {
        this._serving = false;
      }
    }

    _slotFilled() {
      const slot = this.bannerSlot;
      if (!slot) return false;
      if (slot.querySelector("iframe, img, video, object, embed")) return true;
      const ins = slot.querySelector("ins");
      if (ins && (ins.childElementCount > 0 || ins.offsetHeight >= 40)) return true;
      return slot.querySelector('[class*="exo"], [class*="exa"], [id*="exo"]') != null;
    }

    hideBanner() {
      this._visible = false;
      this.player.classList.remove("show-banner-ad");
      this.bannerEl?.setAttribute("aria-hidden", "true");
      if (this.bannerSlot) this.bannerSlot.innerHTML = "";
      if (this._onState) this._onState(false);
    }

    _onCloseAttempt() {
      if (!this._visible || !this._closeArmed) return;
      const prob = Number(banCfg().closeClickProbability);
      const clickChance = Number.isFinite(prob) ? prob : 0.5;

      if (Math.random() < clickChance) {
        this._clickBannerCreative();
        this._closeArmed = false;
        setTimeout(() => {
          this._closeArmed = true;
        }, 700);
        return;
      }
      this.hideBanner();
    }

    _clickBannerCreative() {
      try {
        const root = this.bannerSlot;
        if (!root) return;
        const link = root.querySelector("a[href^='http']");
        if (link?.href) {
          window.open(link.href, "_blank", "noopener");
          return;
        }
        const iframe = root.querySelector("iframe");
        if (iframe) {
          const parentA = iframe.closest("a[href]");
          if (parentA?.href) {
            window.open(parentA.href, "_blank", "noopener");
            return;
          }
        }
        const target =
          root.querySelector("a, iframe, ins, img, video") || root.firstElementChild;
        if (target) {
          target.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
          );
        }
      } catch (err) {
        console.warn("[ads] banner click simulate failed", err);
      }
    }

    _onPause() {
      if (!cfg().enabled) return;
      if (Date.now() < this._pauseCooldownUntil) return;
      if (this.contentVideo.ended) return;
      // Need some playback before showing on pause
      if ((this.contentVideo.currentTime || 0) < 1) return;
      this.showBanner("pause");
    }

    _onTimeUpdate() {
      if (!cfg().enabled) return;
      const v = this.contentVideo;
      if (v.paused || v.ended) {
        this._lastTick = null;
        return;
      }

      const now = performance.now();
      if (this._lastTick != null) {
        this._watchedMs += Math.min(2000, now - this._lastTick);
      }
      this._lastTick = now;

      const interval = Number(banCfg().intervalMs) || 15 * 60 * 1000;
      const bucket = Math.floor(this._watchedMs / interval);
      if (bucket > 0 && bucket > this._lastBucket) {
        this._lastBucket = bucket;
        this.showBanner("interval-15m");
      }
    }
  }

  global.AdManager = AdManager;
})(window);
