import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { takeBrowseReturn } from "../lib/browseReturn";

type LocState = { restoreBrowse?: boolean } | null;

/** After a browse page finishes loading, restore scroll from a shelf/category “see all” visit. */
export function useRestoreBrowseScroll(ready: boolean) {
  const location = useLocation();

  useEffect(() => {
    if (!ready) return;
    const state = location.state as LocState;
    if (!state?.restoreBrowse) return;

    const ret = takeBrowseReturn();
    if (!ret) return;
    const here = `${location.pathname}${location.search}`;
    if (ret.path !== here) return;

    const restore = () => {
      if (ret.focusId) {
        const el = document.getElementById(ret.focusId);
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo(0, Math.max(0, top));
          return;
        }
      }
      window.scrollTo(0, ret.scrollY);
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(restore);
    });
  }, [ready, location.pathname, location.search, location.state]);
}
