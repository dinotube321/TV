import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { TitlePicker } from "../components/TitlePicker";
import { EmptyState, LoadingBlock } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { RuleFields } from "../components/ui/RuleFields";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import type { CatalogEntry, HeroEntry, Shelf, ShelfRule } from "../types";

type EditableShelf = Shelf & { mode: "manual" | "rule" };
type EditableHero = HeroEntry & { item: CatalogEntry };
type Tab = "heroes" | "shelves";

function toEditable(s: Shelf): EditableShelf {
  return {
    ...s,
    titleIds: s.titleIds ?? [],
    mode: s.rule ? "rule" : "manual",
    rule: s.rule ?? { sort: "recent", limit: 40 },
  };
}

function heroesKey(heroes: EditableHero[]) {
  return JSON.stringify(
    heroes.map((h) => ({ id: h.id, trailerUrl: h.trailerUrl || "" })),
  );
}

function shelvesKey(shelves: EditableShelf[]) {
  return JSON.stringify(
    shelves.map((s) => ({
      id: s.id,
      title: s.title,
      variant: s.variant || "default",
      mode: s.mode,
      titleIds: s.titleIds ?? [],
      rule: s.mode === "rule" ? s.rule : undefined,
    })),
  );
}

export function HomepagePage() {
  const [tab, setTab] = useState<Tab>("heroes");
  const [heroes, setHeroes] = useState<EditableHero[]>([]);
  const [shelves, setShelves] = useState<EditableShelf[]>([]);
  const [savedHeroesKey, setSavedHeroesKey] = useState("");
  const [savedShelvesKey, setSavedShelvesKey] = useState("");
  const [openShelfId, setOpenShelfId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [h, s] = await Promise.all([
      api<{
        heroes: Array<HeroEntry & { item: CatalogEntry | null }>;
      }>("/api/admin/homepage/heroes"),
      api<Shelf[]>("/api/admin/homepage/shelves"),
    ]);
    const nextHeroes = h.heroes
      .filter((x): x is HeroEntry & { item: CatalogEntry } => Boolean(x.item))
      .map((x) => ({
        id: x.id,
        trailerUrl: x.trailerUrl || x.item.trailerUrl || "",
        item: x.item,
      }));
    const nextShelves = s.map(toEditable);
    setHeroes(nextHeroes);
    setShelves(nextShelves);
    setSavedHeroesKey(heroesKey(nextHeroes));
    setSavedShelvesKey(shelvesKey(nextShelves));
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [load]);

  const heroesDirty = useMemo(
    () => heroesKey(heroes) !== savedHeroesKey,
    [heroes, savedHeroesKey],
  );
  const shelvesDirty = useMemo(
    () => shelvesKey(shelves) !== savedShelvesKey,
    [shelves, savedShelvesKey],
  );

  async function saveHeroes() {
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const saved = await api<{
        heroes: Array<HeroEntry & { item: CatalogEntry | null }>;
      }>("/api/admin/homepage/heroes", {
        method: "PUT",
        body: JSON.stringify({
          heroes: heroes.map((h) => ({
            id: h.id,
            ...(h.trailerUrl?.trim()
              ? { trailerUrl: h.trailerUrl.trim() }
              : {}),
          })),
        }),
      });
      const next = saved.heroes
        .filter((x): x is HeroEntry & { item: CatalogEntry } => Boolean(x.item))
        .map((x) => ({
          id: x.id,
          trailerUrl: x.trailerUrl || x.item.trailerUrl || "",
          item: x.item,
        }));
      setHeroes(next);
      setSavedHeroesKey(heroesKey(next));
      setMsg("Heroes saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveShelves() {
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const payload: Shelf[] = shelves.map((s) => {
        const base: Shelf = {
          id: s.id,
          title: s.title,
          variant: s.variant,
        };
        if (s.mode === "rule") {
          base.rule = {
            type: s.rule?.type,
            genre: s.rule?.genre || undefined,
            list: s.rule?.list,
            limit: s.rule?.limit ?? 40,
            sort: s.rule?.sort ?? "recent",
          };
        } else {
          base.titleIds = s.titleIds ?? [];
        }
        return base;
      });
      const saved = await api<Shelf[]>("/api/admin/homepage/shelves", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const next = saved.map(toEditable);
      setShelves(next);
      setSavedShelvesKey(shelvesKey(next));
      setMsg("Shelves saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function updateShelf(id: string, patch: Partial<EditableShelf>) {
    setShelves((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function updateRule(id: string, patch: Partial<ShelfRule>) {
    setShelves((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, rule: { ...(s.rule ?? {}), ...patch } } : s,
      ),
    );
  }

  function addShelf(mode: "manual" | "rule") {
    const id = `shelf-${Date.now()}`;
    setShelves((prev) => [
      ...prev,
      {
        id,
        title: mode === "rule" ? "Dynamic Shelf" : "Curated Shelf",
        mode,
        titleIds: [],
        rule: { sort: "recent", limit: 40 },
        variant: "default",
      },
    ]);
    setOpenShelfId(id);
    setTab("shelves");
  }

  function moveHero(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= heroes.length) return;
    setHeroes((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  }

  if (loading) return <LoadingBlock label="Loading homepage…" />;

  return (
    <>
      <PageHeader
        title="Homepage"
        description="Featured heroes and content shelves for the front page."
      />

      <div className="tabStrip" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "heroes"}
          className={tab === "heroes" ? "active" : undefined}
          onClick={() => setTab("heroes")}
        >
          Heroes{heroesDirty ? " ·" : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "shelves"}
          className={tab === "shelves" ? "active" : undefined}
          onClick={() => setTab("shelves")}
        >
          Shelves{shelvesDirty ? " ·" : ""}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {msg && <p className="ok">{msg}</p>}

      {tab === "heroes" && (
        <>
          <SectionCard
            title="Heroes"
            description="Featured billboard (max 12). Optional YouTube trailer URL plays muted in the background."
            toolbar={
              <TitlePicker
                placeholder="Search to add hero…"
                excludeIds={heroes.map((h) => h.id)}
                onPick={(t) => {
                  if (heroes.length >= 12) {
                    setError("Max 12 heroes");
                    return;
                  }
                  setError("");
                  setHeroes([
                    ...heroes,
                    {
                      id: t.id,
                      trailerUrl: t.trailerUrl || "",
                      item: t,
                    },
                  ]);
                }}
              />
            }
          >
            {heroes.length === 0 ? (
              <EmptyState
                title="No heroes yet"
                description="Search above to add a featured title."
              />
            ) : (
              heroes.map((h, i) => (
                <div className="heroRow" key={h.id}>
                  <img className="thumb" src={h.item.poster} alt="" />
                  <div className="heroRowBody">
                    <div className="heroRowTop">
                      <strong>{h.item.title}</strong>
                      <div className="row gapSm">
                        <div className="heroOrder">
                          <button
                            type="button"
                            className="btn btnGhost btnSm"
                            disabled={i === 0}
                            aria-label="Move up"
                            onClick={() => moveHero(i, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btnGhost btnSm"
                            disabled={i === heroes.length - 1}
                            aria-label="Move down"
                            onClick={() => moveHero(i, 1)}
                          >
                            ↓
                          </button>
                        </div>
                        <button
                          type="button"
                          className="btn btnDanger btnSm"
                          onClick={() =>
                            setHeroes(heroes.filter((x) => x.id !== h.id))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="field compact">
                      <label htmlFor={`hero-trailer-${h.id}`}>
                        YouTube trailer URL
                      </label>
                      <input
                        id={`hero-trailer-${h.id}`}
                        value={h.trailerUrl || ""}
                        placeholder="https://www.youtube.com/watch?v=…"
                        onChange={(e) =>
                          setHeroes(
                            heroes.map((x, idx) =>
                              idx === i
                                ? { ...x, trailerUrl: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </SectionCard>

          <div className="stickySave">
            <span className={`stickySaveHint${heroesDirty ? " dirty" : ""}`}>
              {heroesDirty ? "Unsaved changes" : "All changes saved"}
            </span>
            <button
              type="button"
              className="btn"
              disabled={saving || !heroesDirty}
              onClick={() => saveHeroes()}
            >
              {saving ? "Saving…" : "Save heroes"}
            </button>
          </div>
        </>
      )}

      {tab === "shelves" && (
        <>
          <SectionCard
            title="Shelves"
            description="Curated picks (≤60) or dynamic rules that resolve at read time."
            toolbar={
              <>
                <button
                  type="button"
                  className="btn btnGhost btnSm"
                  onClick={() => addShelf("manual")}
                >
                  + Curated
                </button>
                <button
                  type="button"
                  className="btn btnGhost btnSm"
                  onClick={() => addShelf("rule")}
                >
                  + Dynamic
                </button>
              </>
            }
          >
            {shelves.length === 0 ? (
              <EmptyState
                title="No shelves"
                description="Add a curated or dynamic shelf to get started."
              />
            ) : (
              shelves.map((shelf) => {
                const open = openShelfId === shelf.id;
                const count =
                  shelf.mode === "rule"
                    ? shelf.previewCount
                    : (shelf.titleIds ?? []).length;
                return (
                  <div
                    className={`editorCard${open ? " open" : ""}`}
                    key={shelf.id}
                  >
                    <button
                      type="button"
                      className="editorCardHeader"
                      onClick={() =>
                        setOpenShelfId(open ? null : shelf.id)
                      }
                    >
                      <div className="editorCardHeaderMain">
                        <strong>{shelf.title || "Untitled shelf"}</strong>
                        <StatusBadge
                          tone={shelf.mode === "rule" ? "accent" : "default"}
                        >
                          {shelf.mode === "rule" ? "Dynamic" : "Curated"}
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
                            value={shelf.title}
                            onChange={(e) =>
                              updateShelf(shelf.id, { title: e.target.value })
                            }
                          />
                        </div>
                        <div className="field compact fieldNarrow">
                          <label>Variant</label>
                          <select
                            value={shelf.variant || "default"}
                            onChange={(e) =>
                              updateShelf(shelf.id, {
                                variant: e.target.value as Shelf["variant"],
                              })
                            }
                          >
                            <option value="default">default</option>
                            <option value="top10">top10</option>
                            <option value="wide">wide</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          className="btn btnDanger btnSm"
                          onClick={() => {
                            setShelves(shelves.filter((s) => s.id !== shelf.id));
                            if (openShelfId === shelf.id) setOpenShelfId(null);
                          }}
                        >
                          Remove
                        </button>
                      </div>

                      <div className="field compact mb16">
                        <label>Mode</label>
                        <div className="segmented">
                          <button
                            type="button"
                            className={
                              shelf.mode === "manual" ? "active" : undefined
                            }
                            onClick={() =>
                              updateShelf(shelf.id, { mode: "manual" })
                            }
                          >
                            Curated
                          </button>
                          <button
                            type="button"
                            className={
                              shelf.mode === "rule" ? "active" : undefined
                            }
                            onClick={() =>
                              updateShelf(shelf.id, { mode: "rule" })
                            }
                          >
                            Dynamic
                          </button>
                        </div>
                      </div>

                      {shelf.mode === "rule" ? (
                        <RuleFields
                          kind="shelf"
                          rule={shelf.rule ?? { sort: "recent", limit: 40 }}
                          previewCount={shelf.previewCount}
                          onChange={(patch) => updateRule(shelf.id, patch)}
                        />
                      ) : (
                        <>
                          <div className="chipList">
                            {(shelf.titleIds ?? []).map((id) => {
                              const preview = shelf.preview?.find(
                                (p) => p.id === id,
                              );
                              return (
                                <span className="chip" key={id}>
                                  {preview?.title || id}
                                  <button
                                    type="button"
                                    aria-label="Remove"
                                    onClick={() =>
                                      updateShelf(shelf.id, {
                                        titleIds: (shelf.titleIds ?? []).filter(
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
                            excludeIds={shelf.titleIds ?? []}
                            onPick={(t) => {
                              const ids = shelf.titleIds ?? [];
                              if (ids.length >= 60) {
                                setError(
                                  "Max 60 curated titles per shelf — switch to Dynamic",
                                );
                                return;
                              }
                              setError("");
                              updateShelf(shelf.id, {
                                titleIds: [...ids, t.id],
                              });
                              setShelves((prev) =>
                                prev.map((s) =>
                                  s.id === shelf.id
                                    ? {
                                        ...s,
                                        preview: [...(s.preview ?? []), t],
                                      }
                                    : s,
                                ),
                              );
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
            <span className={`stickySaveHint${shelvesDirty ? " dirty" : ""}`}>
              {shelvesDirty ? "Unsaved changes" : "All changes saved"}
            </span>
            <button
              type="button"
              className="btn"
              disabled={saving || !shelvesDirty}
              onClick={() => saveShelves()}
            >
              {saving ? "Saving…" : "Save shelves"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
