import { useEffect, useState } from "react";
import { ContentShelf } from "../ContentShelf/ContentShelf";
import { useWatchlistIds } from "../../hooks/useWatchlist";
import { fetchTitlesByIds } from "../../data/api";
import type { Title } from "../../data/types";
import { loadWatchlist, type WatchlistEntry } from "../../lib/watchlist";

function entryToTitle(entry: WatchlistEntry): Title {
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    tagline: "",
    synopsis: "",
    year: entry.year ?? 0,
    rating: "",
    genres: [],
    poster: entry.poster,
    backdrop: entry.poster,
    cast: [],
  };
}

/** Homepage rail of titles the guest (or user) saved — hidden when empty. */
export function WatchlistShelf() {
  const ids = useWatchlistIds();
  const [items, setItems] = useState<Title[]>([]);

  useEffect(() => {
    let cancelled = false;
    const entries = loadWatchlist();
    if (!entries.length) {
      setItems([]);
      return;
    }

    const snapshots = entries.map(entryToTitle);
    setItems(snapshots);

    fetchTitlesByIds(entries.map((e) => e.id))
      .then((fetched) => {
        if (cancelled || !fetched?.length) return;
        const byId = new Map(fetched.map((t) => [t.id, t]));
        setItems(entries.map((e) => byId.get(e.id) ?? entryToTitle(e)));
      })
      .catch(() => {
        /* keep snapshots */
      });

    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (!items.length) return null;

  return (
    <ContentShelf
      shelf={{
        id: "watchlist",
        title: "My Watchlist",
        titleIds: items.map((t) => t.id),
        items,
      }}
      seeAllTo="/watchlist"
    />
  );
}
