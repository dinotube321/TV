const GUEST_KEY = "pulse.guestId";

/** Stable anonymous visitor id (no login). Persists in localStorage. */
export function getGuestId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.localStorage.getItem(GUEST_KEY);
    if (existing && existing.length >= 8) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(GUEST_KEY, id);
    return id;
  } catch {
    return `g_ephemeral_${Date.now()}`;
  }
}
