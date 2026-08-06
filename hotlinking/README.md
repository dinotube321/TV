# Vidking Embed Engine Demo

Local embed player that extracts m3u8 streams from Vidking when you hit demo-style URLs.

## Run

```bash
npm install
npm start
```

Open http://localhost:3847

## Embed routes

| Route | What it does |
|-------|----------------|
| `/embed/movies/{tmdbId}` | Extract movie m3u8 from Vidking → play |
| `/embed/shows/{tmdbId}/{season}/{episode}` | Extract episode → play |
| `/embed/shows/{tmdbId}?s=1&e=1` | Same, query-style season/episode (default S1E1) |
| `/embed/movies/{id}/source.m3u8` | 302 redirect to proxied playlist |
| `/api/embed/movies/{id}` | JSON sources + proxied `playUrl` |
| `/api/embed/shows/{id}/{s}/{e}` | JSON for TV |

### iframe example

```html
<iframe
  src="http://localhost:3847/embed/movies/1078605"
  width="100%"
  height="500"
  frameborder="0"
  allowfullscreen
></iframe>
```

## How it works

1. Parse TMDB id from the embed path  
2. Fast extract from Vidking (`seed` + encrypted sources)  
3. Proxy m3u8/segments with forged `Referer: https://www.vidking.net/`  
4. Play with HLS.js  
