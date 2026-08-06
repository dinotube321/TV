/**
 * Adblock gate — BlockAdBlock (vendored as guard.js) + bait scripts.
 * Playback must wait until detection reports notDetected.
 */
(function (global) {
  "use strict";

  function ensureGate(root) {
    let el = root.querySelector(".adblock-gate");
    if (el) return el;
    el = document.createElement("div");
    el.className = "adblock-gate";
    el.innerHTML = `
      <div class="adblock-card">
        <h2>Ad blocker detected</h2>
        <p>Please disable your ad blocker for this site to watch the video. Ads help keep streams free.</p>
        <button type="button" id="adblockRetry">I've disabled it — Retry</button>
      </div>
    `;
    root.appendChild(el);
    return el;
  }

  function baitLooksBlocked() {
    if (global.__adsBaitLoaded !== true) return true;
    if (global.__advertisementLoaded !== true) return true;
    if (global.__adsAllowed !== true) return true;
    return false;
  }

  /**
   * @returns {Promise<boolean>} true if adblocker is active
   */
  function detect() {
    return new Promise((resolve) => {
      let settled = false;
      const done = (blocked) => {
        if (settled) return;
        settled = true;
        resolve(!!blocked);
      };

      // Bait scripts should have set flags already
      if (baitLooksBlocked()) {
        done(true);
        return;
      }

      const BlockAdBlock = global.BlockAdBlock;
      if (typeof BlockAdBlock !== "function") {
        // Library itself blocked
        done(true);
        return;
      }

      const bab = new BlockAdBlock({
        checkOnLoad: false,
        resetOnEnd: true,
        loopCheckTime: 40,
        loopMaxNumber: 6,
      });

      bab.onDetected(() => done(true));
      bab.onNotDetected(() => done(baitLooksBlocked()));
      bab.check();

      setTimeout(() => done(baitLooksBlocked()), 900);
    });
  }

  async function gate(playerEl) {
    const overlay = ensureGate(playerEl);
    const retry = () =>
      detect().then((blocked) => {
        if (blocked) {
          overlay.classList.add("open");
          playerEl.classList.add("adblock-locked");
          return false;
        }
        overlay.classList.remove("open");
        playerEl.classList.remove("adblock-locked");
        return true;
      });

    overlay.querySelector("#adblockRetry").onclick = () => {
      // Soft reload baits by re-checking; full reload is more reliable
      retry().then((ok) => {
        if (!ok) {
          // Force re-fetch bait scripts
          const bust = Date.now();
          const s1 = document.createElement("script");
          s1.src = `/ads/ads.js?r=${bust}`;
          const s2 = document.createElement("script");
          s2.src = `/adblocker/advertisement.js?r=${bust}`;
          document.head.appendChild(s1);
          document.head.appendChild(s2);
          setTimeout(() => retry(), 400);
        }
      });
    };

    const ok = await retry();
    if (ok) return true;

    // Wait until user clears the gate
    return new Promise((resolve) => {
      const iv = setInterval(async () => {
        const cleared = await retry();
        if (cleared) {
          clearInterval(iv);
          resolve(true);
        }
      }, 1500);
    });
  }

  global.AdblockGuard = { detect, gate };
})(window);
