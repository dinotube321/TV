# Apple TV clone — content backend & admin

Streaming browse UI (Vite + React) backed by a **file-based content store** and a TMDB import pipeline.

## Quick start

1. Copy env and set secrets (never commit real keys):

```bash
cp .env.example .env
```

Fill in:

- `TMDB_API_KEY` / `TMDB_READ_TOKEN` — from [TMDB settings](https://www.themoviedb.org/settings/api)
- `ADMIN_PASSWORD` — admin panel login
- `ADMIN_JWT_SECRET` — long random string

**Rotate any keys that were shared in chat.**

2. Install dependencies:

```bash
npm install
npm install --prefix server
npm install --prefix admin
```

3. Run everything:

```bash
npm run dev
```

| App | URL |
|-----|-----|
| Public site | http://localhost:5173 |
| Admin panel | http://localhost:5175 |
| Content API | http://localhost:8787 |

Default admin password is whatever you set in `.env` (`admin` in the example).

4. Optional seed (imports a few TMDB titles + homepage config):

```bash
npm run seed
```

## Content layout

```
content/
  poster/{id}.webp      # poster art
  hero/{id}.webp        # billboard / backdrop
  info/{id}.json        # full title payload
  data.json             # lightweight catalog index
  search-index.json     # fast client search
  homepage/
    heroes.json         # ordered ids for Home hero
    shelves.json        # Home shelves (titleIds + variant)
```

Ids look like `movie-693134` or `tv-95396`.

## Admin workflow

1. Sign in at `/login` on the admin app.
2. **Import** — enter a TMDB id (movie or TV), preview, import.
3. **Bulk seed** — `npm run import:bulk` pulls popular / new / genre titles in batches.
4. **Homepage** — pick heroes and shelf membership (writes the two homepage JSON files).
5. **Library** — re-import or delete titles (removes assets + index rows).
6. **Search index** — rebuild if needed (also runs automatically on import/delete).

Public search merges your local catalog with live TMDB results. Opening a TMDB-only
hit auto-imports it into `content/` (rate-limited).

**Playback:** Play opens `/watch/:id`, which embeds the stream player from `hotlinking/`
(` /embed/movies/{tmdbId}` or `/embed/shows/{tmdbId}/{season}/{episode}` ).  
`npm run dev` starts that player on port 3847 and Vite proxies `/embed` + stream APIs.

TMDB secrets stay on the server only. The admin SPA talks to `/api/admin/*` with a JWT.

## Public site data flow

- Home loads `/content/data.json`, `/content/homepage/heroes.json`, `/content/homepage/shelves.json`
- Detail loads `/content/info/{id}.json`
- Search scores `/content/search-index.json` (prefix matches rank higher)

Vite proxies `/content` and `/api` to the Express server in development.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Server + site + admin |
| `npm run seed` | Import sample TMDB titles |
| `npm run import:bulk` | Import hundreds of popular/new titles by genre |
| `npm run sync:lists` | Sync Top 10 / trending / top-rated curated shelves from TMDB |
| `npm run build` | Build public site + admin |
| `npm run dev:server` | API only |
