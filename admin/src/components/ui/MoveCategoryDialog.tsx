import { useEffect, useId, useMemo, useState } from "react";
import { api } from "../../api";
import type { CatalogEntry, Category } from "../../types";

type AdminCategory = Category & {
  mode?: "manual" | "rule";
  titleIds?: string[];
};

function genreMatchesNeedles(genre: string, needles: string[]) {
  const g = genre.toLowerCase();
  return needles.some((n) => {
    const needle = n.toLowerCase();
    return g === needle || g.includes(needle) || needle.includes(g);
  });
}

export function titleMatchesCategory(entry: CatalogEntry, category: AdminCategory) {
  if (category.rule || category.mode === "rule") {
    const rule = category.rule;
    if (!rule) return false;
    if (rule.type && entry.type !== rule.type) return false;
    const genres = rule.genres ?? [];
    if (genres.length) {
      return entry.genres.some((g) => genreMatchesNeedles(g, genres));
    }
    return true;
  }
  return (category.titleIds ?? []).includes(entry.id);
}

type Props = {
  open: boolean;
  title: CatalogEntry | null;
  busy?: boolean;
  onCancel: () => void;
  onMoved: (result: { from: string; to: string; title: CatalogEntry }) => void;
};

export function MoveCategoryDialog({
  open,
  title,
  busy,
  onCancel,
  onMoved,
}: Props) {
  const titleId = useId();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !title) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setToId("");
    api<AdminCategory[]>("/api/admin/categories")
      .then((list) => {
        if (cancelled) return;
        setCategories(list);
        const membership = list.filter((c) => titleMatchesCategory(title, c));
        setFromId(membership[0]?.id ?? list[0]?.id ?? "");
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load categories");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, title?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, saving, busy]);

  const membership = useMemo(() => {
    if (!title) return [];
    return categories.filter((c) => titleMatchesCategory(title, c));
  }, [categories, title]);

  const toOptions = useMemo(
    () => categories.filter((c) => c.id !== fromId),
    [categories, fromId],
  );

  const fromCat = categories.find((c) => c.id === fromId);
  const toCat = categories.find((c) => c.id === toId);

  const hint = useMemo(() => {
    if (!fromCat || !toCat) return "";
    const fromRule = Boolean(fromCat.rule);
    const toRule = Boolean(toCat.rule);
    if (fromRule && toRule) {
      return "Genre-rule categories: this updates the title’s genres so it leaves the source and matches the destination.";
    }
    if (!fromRule && !toRule) {
      return "Curated categories: the title will be removed from the source list and added to the destination.";
    }
    if (fromRule && !toRule) {
      return "Source genres may be adjusted, and the title will be added to the curated destination list.";
    }
    return "The title will leave the curated source list, and genres will be adjusted for the destination rule.";
  }, [fromCat, toCat]);

  async function confirm() {
    if (!title || !fromId || !toId) return;
    setSaving(true);
    setError("");
    try {
      const res = await api<{
        from: string;
        to: string;
        title: CatalogEntry;
      }>("/api/admin/categories/move", {
        method: "POST",
        body: JSON.stringify({
          titleId: title.id,
          fromCategoryId: fromId,
          toCategoryId: toId,
        }),
      });
      onMoved(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Move failed");
    } finally {
      setSaving(false);
    }
  }

  if (!open || !title) return null;

  const disabled = saving || busy || loading || !fromId || !toId;

  return (
    <div className="dialogBackdrop" role="presentation" onClick={onCancel}>
      <div
        className="dialogPanel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId}>Move category</h3>
        <p>
          Reassign <strong>{title.title}</strong> from one browse category to
          another.
        </p>

        {membership.length > 0 && (
          <p className="pageSub" style={{ marginTop: -8 }}>
            Currently in: {membership.map((c) => c.title).join(", ")}
          </p>
        )}

        {loading ? (
          <p className="pageSub">Loading categories…</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="move-from">From</label>
              <select
                id="move-from"
                value={fromId}
                onChange={(e) => {
                  setFromId(e.target.value);
                  if (e.target.value === toId) setToId("");
                }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                    {c.rule ? " (genre rule)" : " (curated)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="move-to">To</label>
              <select
                id="move-to"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
              >
                <option value="">Select destination…</option>
                {toOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                    {c.rule ? " (genre rule)" : " (curated)"}
                  </option>
                ))}
              </select>
            </div>
            {hint ? <p className="pageSub">{hint}</p> : null}
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="dialogActions">
          <button
            type="button"
            className="btn btnGhost"
            onClick={onCancel}
            disabled={saving || busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void confirm()}
            disabled={disabled}
          >
            {saving ? "Moving…" : "Move"}
          </button>
        </div>
      </div>
    </div>
  );
}
