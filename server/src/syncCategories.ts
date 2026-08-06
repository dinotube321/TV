import { syncCatalogCategories } from "./lib/genreCategories.js";

const result = await syncCatalogCategories();
console.log(
  JSON.stringify(
    {
      count: result.categories.length,
      created: result.created,
      removed: result.removed,
      ids: result.categories.map((c) => `${c.id}:${c.title}`),
    },
    null,
    2,
  ),
);
