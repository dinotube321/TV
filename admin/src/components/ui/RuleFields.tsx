import type { CategoryRule, ShelfRule } from "../../types";

type ShelfProps = {
  kind: "shelf";
  rule: ShelfRule;
  previewCount?: number;
  onChange: (patch: Partial<ShelfRule>) => void;
};

type CategoryProps = {
  kind: "category";
  rule: CategoryRule;
  previewCount?: number;
  onChange: (patch: Partial<CategoryRule>) => void;
};

type Props = ShelfProps | CategoryProps;

export function RuleFields(props: Props) {
  const { previewCount } = props;

  if (props.kind === "shelf") {
    const { rule, onChange } = props;
    return (
      <div className="formGrid">
        <div className="field compact">
          <label>Type</label>
          <select
            value={rule.type || ""}
            onChange={(e) =>
              onChange({
                type: (e.target.value || undefined) as ShelfRule["type"],
              })
            }
          >
            <option value="">Any</option>
            <option value="movie">Movies</option>
            <option value="show">TV Shows</option>
          </select>
        </div>
        <div className="field compact">
          <label>Genre</label>
          <input
            value={rule.genre || ""}
            placeholder="e.g. Drama"
            onChange={(e) => onChange({ genre: e.target.value })}
          />
        </div>
        <div className="field compact">
          <label>Curated list</label>
          <select
            value={rule.list || ""}
            onChange={(e) =>
              onChange({
                list: (e.target.value || undefined) as ShelfRule["list"],
              })
            }
          >
            <option value="">None (filter catalog)</option>
            <option value="trending_movies_week">Trending movies (week)</option>
            <option value="trending_tv_week">Trending TV (week)</option>
            <option value="popular_movies">Popular movies</option>
            <option value="popular_tv">Popular TV</option>
            <option value="top_rated_movies">Top rated movies</option>
            <option value="top_rated_tv">Top rated TV</option>
          </select>
        </div>
        <div className="field compact">
          <label>Sort</label>
          <select
            value={rule.sort || "recent"}
            onChange={(e) =>
              onChange({ sort: e.target.value as ShelfRule["sort"] })
            }
          >
            <option value="recent">Recently added</option>
            <option value="year">Year</option>
            <option value="title">Title A–Z</option>
            <option value="popularity">Popularity</option>
            <option value="rating">Rating</option>
          </select>
        </div>
        <div className="field compact">
          <label>Limit</label>
          <input
            type="number"
            min={1}
            max={80}
            value={rule.limit ?? 40}
            onChange={(e) => onChange({ limit: Number(e.target.value) || 40 })}
          />
        </div>
        {previewCount != null && (
          <p className="pageSub mb0 rulePreviewHint">
            ~{previewCount} match now
          </p>
        )}
      </div>
    );
  }

  const { rule, onChange } = props;
  return (
    <div className="formGrid">
      <div className="field compact">
        <label>Type</label>
        <select
          value={rule.type || ""}
          onChange={(e) =>
            onChange({
              type: (e.target.value || undefined) as CategoryRule["type"],
            })
          }
        >
          <option value="">Any</option>
          <option value="movie">Movies</option>
          <option value="show">TV Shows</option>
        </select>
      </div>
      <div className="field compact ruleGenres">
        <label>Genres (comma-separated)</label>
        <input
          value={(rule.genres ?? []).join(", ")}
          placeholder="e.g. Comedy, Drama"
          onChange={(e) =>
            onChange({
              genres: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div className="field compact">
        <label>Sort</label>
        <select
          value={rule.sort || "recent"}
          onChange={(e) =>
            onChange({ sort: e.target.value as CategoryRule["sort"] })
          }
        >
          <option value="recent">Recently added</option>
          <option value="year">Year</option>
          <option value="title">Title A–Z</option>
          <option value="popularity">Popularity</option>
          <option value="rating">Rating</option>
        </select>
      </div>
      <div className="field compact">
        <label>Limit</label>
        <input
          type="number"
          min={1}
          max={100}
          value={rule.limit ?? 48}
          onChange={(e) => onChange({ limit: Number(e.target.value) || 48 })}
        />
      </div>
      {previewCount != null && (
        <p className="pageSub mb0 rulePreviewHint">~{previewCount} match</p>
      )}
    </div>
  );
}
