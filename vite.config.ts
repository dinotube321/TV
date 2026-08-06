import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Stream player (hotlinking) — more specific /api routes first
      "/api/embed": "http://localhost:3847",
      "/api/backup": "http://localhost:3847",
      "/api/vast": "http://localhost:3847",
      "/api/extract": "http://localhost:3847",
      "/api/source-pref": "http://localhost:3847",
      "/api/media-requests": "http://localhost:8787",
      "/proxy": "http://localhost:3847",
      "/embed": "http://localhost:3847",
      // Bingr iframe proxy (namespaced — must NOT steal Pulse /watch)
      "/bingr": "http://localhost:3847",
      "/bingr-api": "http://localhost:3847",
      "/js": "http://localhost:3847",
      "/icons": "http://localhost:3847",
      "/ads": "http://localhost:3847",
      "/adblocker": "http://localhost:3847",
      // Catalog / content API
      "/api": "http://localhost:8787",
      "/content": "http://localhost:8787",
    },
  },
});
