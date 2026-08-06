import type { NavigateFunction } from "react-router-dom";
import { ensureTitle, invalidateCatalogCache } from "../data/api";
import type { Title } from "../data/types";

/**
 * Open a search hit. If not local yet, import first (caller shows in-row loader),
 * then navigate straight to the title page — no intermediate loading screen.
 */
export async function openSearchResult(
  title: Title,
  navigate: NavigateFunction,
) {
  if (title.pending) {
    await ensureTitle(title.id);
    invalidateCatalogCache();
  }
  navigate(`/title/${encodeURIComponent(title.id)}`);
}
