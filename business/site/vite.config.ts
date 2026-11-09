import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In local work the demo form posts to /api, which is passed on to the business backend (port 8100).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    host: true,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8100",
        changeOrigin: true,
      },
    },
  },
  preview: { port: 5180, strictPort: true },
});
