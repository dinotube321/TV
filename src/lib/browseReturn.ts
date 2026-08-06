const KEY = "pulse_browse_return";

export type BrowseReturn = {
  path: string;
  scrollY: number;
  focusId?: string;
};

export function saveBrowseReturn(focusId?: string) {
  const payload: BrowseReturn = {
    path: `${window.location.pathname}${window.location.search}`,
    scrollY: window.scrollY,
    focusId,
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function peekBrowseReturn(): BrowseReturn | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as BrowseReturn;
    if (typeof data?.path !== "string" || typeof data?.scrollY !== "number") {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function takeBrowseReturn(): BrowseReturn | null {
  const data = peekBrowseReturn();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return data;
}

export function currentBrowsePath() {
  return `${window.location.pathname}${window.location.search}`;
}
