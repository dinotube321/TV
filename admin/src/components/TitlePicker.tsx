import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";
import type { CatalogEntry } from "../types";

interface Props {
  onPick: (title: CatalogEntry) => void;
  excludeIds?: string[];
  type?: "movie" | "show" | "";
  placeholder?: string;
  disabled?: boolean;
}

export function TitlePicker({
  onPick,
  excludeIds = [],
  type = "",
  placeholder = "Search titles…",
  disabled,
}: Props) {
  const id = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CatalogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const qTrim = q.trim();
    if (qTrim.length < 1) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ q: qTrim, limit: "12" });
      if (type) params.set("type", type);
      api<{ items: CatalogEntry[] }>(`/api/admin/titles/search?${params}`)
        .then((res) => {
          setResults(res.items.filter((item) => !excludeIds.includes(item.id)));
          setOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(t);
  }, [q, type, excludeIds.join("|")]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="picker" ref={wrapRef}>
      <label className="srOnly" htmlFor={id}>
        Search titles
      </label>
      <input
        id={id}
        className="pickerInput"
        value={q}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && (results.length > 0 || loading) && (
        <ul className="pickerMenu" role="listbox">
          {loading && results.length === 0 && (
            <li className="pickerEmpty">Searching…</li>
          )}
          {results.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="pickerOption"
                onClick={() => {
                  onPick(t);
                  setQ("");
                  setResults([]);
                  setOpen(false);
                }}
              >
                <img src={t.poster} alt="" width={32} height={48} />
                <span>
                  <strong>{t.title}</strong>
                  <small>
                    {t.year || "—"} · {t.type}
                    {t.genres[0] ? ` · ${t.genres[0]}` : ""}
                  </small>
                </span>
              </button>
            </li>
          ))}
          {!loading && results.length === 0 && q.trim() && (
            <li className="pickerEmpty">No matches</li>
          )}
        </ul>
      )}
    </div>
  );
}
