/**
 * MagSrv ads — 728×90 banner only.
 * Shows every 15 minutes of watch time. Close is 50% real / 50% treated as click.
 */
window.AdsConfig = {
  enabled: true,
  providerSrc: "https://a.magsrv.com/ad-provider.js",
  banner: {
    width: 728,
    height: 90,
    zoneId: "5984476",
    insClass: "eas6a97888e2",
    /** Show every N ms of content watch time */
    intervalMs: 15 * 60 * 1000,
    /** Chance that Close is treated as an ad click instead of dismissing */
    closeClickProbability: 0.5,
  },
};
