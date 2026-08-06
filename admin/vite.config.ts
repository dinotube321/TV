import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    host: true,
    proxy: {
      "/api": "http://localhost:8787",
      "/content": "http://localhost:8787",
    },
  },
});
