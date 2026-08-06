import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { TitlePicker } from "../components/TitlePicker";
import { EmptyState, LoadingBlock } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { RuleFields } from "../components/ui/RuleFields";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import type { CatalogEntry, Category, CategoryRule } from "../types";

type EditableCategory = Category & {
  mode: "manual" | "rule";
  previewCount?: number;
  preview?: CatalogEntry[];
};

function toEditable(
  c: Category & {
    mode?: string;
    previewCount?: number;
    preview?: CatalogEntry[];
  },
): EditableCategory {
  return {
    ...c,
    titleIds: c.titleIds ?? [],
    mode: c.rule ? "rule" : "manual",
    rule: c.rule ?? { genres: [], sort: "recent", limit: 48 },
    previewCount: c.previewCount,
    preview: c.preview,
  };
}

function categoriesKey(categories: EditableCategory[]) {
  return JSON.stringify(
    categories.map((c) => ({
      id: c.id,
      title: c.title,
      image: c.image,
      mode: c.mode,
      titleIds: c.titleIds ?? [],
      rule: c.mode === "rule" ? c.rule : undefined,
    })),
  );
}

export function CategoriesPage() {
  const [categories, setCategories] = useState<EditableCategory[]>([]);
  const [savedKey, setSavedKey] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await api<EditableCategory[]>("/api/admin/categories");
    const next = data.map(toEditable);
    setCategories(next);
    setSavedKey(categoriesKey(next));
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [load]);

  const dirty = useMemo(
    () => categoriesKey(categories) !== savedKey,
    [categories, savedKey],
  );

  async function save() {
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const payload: Category[] = categories.map((c) => {
        const base: Category = {
          id: c.id,
          title: c.title,
          image: c.image,
        };
        if (c.mode === "rule") {
          base.rule = {
            type: c.rule?.type,
            genres: (c.rule?.genres ?? []).filter(Boolean),
            limit: c.rule?.limit ?? 48,
            sort: c.rule?.sort ?? "recent",
          };
        } else {
          base.titleIds = c.titleIds ?? [];
        }
        return base;
      });
      await api("/api/admin/categories", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await load();
      setMsg("Categories saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function syncGenres() {
    setSyncing(true);
    setError("");
    setMsg("");
    try {
      const result = await api<{
        ok: boolean;
        created: string[];
        removed: string[];
        count: number;
        categories: EditableCategory[];
      }>("/api/admin/categories/sync", { method: "POST" });
      const next = (result.categories ?? []).map(toEditable);
      setCategories(next);
      setSavedKey(categoriesKey(next));
      const bits = [
        `${result.count} tiles`,
        result.created?.length ? `+${result.created.length} created` : null,
        result.removed?.length ? `−${result.removed.length} removed` : null,
      ].filter(Boolean);
      setMsg(`Synced genres (${bits.join(", ")})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function update(id: string, patch: Partial<EditableCategory>) {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }

  function updateRule(id: string, patch: Partial<CategoryRule>) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, rule: { ...(c.rule ?? {}), ...patch } } : c,
      ),
    );
  }

  if (loading) return <LoadingBlock label="Loading categories…" />;

  return (
    <>
      <PageHeader
        title="Categories"
        description="Horizontal browse tiles on the homepage. Genre rules for large catalogs, or curated lists for hand-picked collections."
        actions={
          <>
            <button
              type="button"
              className="btn btnGhost"
              disabled={syncing || saving}
              onClick={() => void syncGenres()}
            >
              {syncing ? "Syncing…" : "Sync genres"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!dirty || saving || syncing}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      />

      {error && <p className="error">{error}</p>}
      {msg && <p className="ok">{msg}</p>}

      <SectionCard
        title="Browse tiles"
        description="Images live in content/categories/."
      >
        {categories.length === 0 ? (
          <EmptyState
            title="No categories"
            description="Categories are defined in content data."
          />
        ) : (
          categories.map((cat) => {
            const open = openId === cat.id;
            const count =
              cat.mode === "rule"
                ? cat.previewCount
                : (cat.titleIds ?? []).length;
            return (
              <div
                className={`editorCard${open ? " open" : ""}`}
                key={cat.id}
              >
                <button
                  type="button"
                  className="editorCardHeader"
                  onClick={() => setOpenId(open ? null : cat.id)}
                >
                  <img className="thumbWide" src={cat.image} alt="" />
                  <div className="editorCardHeaderMain">
                    <strong>{cat.title || "Untitled"}</strong>
                    <StatusBadge
                      tone={cat.mode === "rule" ? "accent" : "default"}
                    >
                      {cat.mode === "rule" ? "Genre rule" : "Curated"}
                    </StatusBadge>
                    {count != null && (
                      <StatusBadge>{`${count} titles`}</StatusBadge>
                    )}
                  </div>
                  <span className="editorCardChevron" aria-hidden>
                    ▾
                  </span>
                </button>
                <div className="editorCardBody">
                  <div className="row mb16">
                    <div className="field compact fieldGrow">
                      <label>Title</label>
                      <input
                        value={cat.title}
                        onChange={(e) =>
                          update(cat.id, { title: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="field compact mb16">
                    <label>Image URL</label>
                    <input
                      value={cat.image}
                      onChange={(e) =>
                        update(cat.id, { image: e.target.value })
                      }
                    />
                  </div>

                  <div className="field compact mb16">
                    <label>Mode</label>
                    <div className="segmented">
                      <button
                        type="button"
                        className={cat.mode === "manual" ? "active" : undefined}
                        onClick={() => update(cat.id, { mode: "manual" })}
                      >
                        Curated
                      </button>
                      <button
                        type="button"
                        className={cat.mode === "rule" ? "active" : undefined}
                        onClick={() => update(cat.id, { mode: "rule" })}
                      >
                        Genre rule
                      </button>
                    </div>
                  </div>

                  {cat.mode === "rule" ? (
                    <RuleFields
                      kind="category"
                      rule={
                        cat.rule ?? { genres: [], sort: "recent", limit: 48 }
                      }
                      previewCount={cat.previewCount}
                      onChange={(patch) => updateRule(cat.id, patch)}
                    />
                  ) : (
                    <>
                      <div className="chipList">
                        {(cat.titleIds ?? []).map((id) => {
                          const preview = cat.preview?.find((p) => p.id === id);
                          return (
                            <span className="chip" key={id}>
                              {preview?.title || id}
                              <button
                                type="button"
                                aria-label="Remove"
                                onClick={() =>
                                  update(cat.id, {
                                    titleIds: (cat.titleIds ?? []).filter(
                                      (x) => x !== id,
                                    ),
                                  })
                                }
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                      <TitlePicker
                        placeholder="Search to add title…"
                        excludeIds={cat.titleIds ?? []}
                        onPick={(t) => {
                          const ids = cat.titleIds ?? [];
                          if (ids.length >= 80) {
                            setError(
                              "Max 80 curated titles — switch to Genre rule",
                            );
                            return;
                          }
                          setError("");
                          update(cat.id, {
                            titleIds: [...ids, t.id],
                            preview: [...(cat.preview ?? []), t],
                          });
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </SectionCard>

      <div className="stickySave">
        <span className={`stickySaveHint${dirty ? " dirty" : ""}`}>
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <button
          type="button"
          className="btn"
          disabled={saving || !dirty}
          onClick={() => save()}
        >
          {saving ? "Saving…" : "Save categories"}
        </button>
      </div>
    </>
  );
}
