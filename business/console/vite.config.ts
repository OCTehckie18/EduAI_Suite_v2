import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The console talks to /api on its own address, which is passed on to the business backend (port 8100).
// Same address for page and API keeps the sign-in cookie simple.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    strictPort: true,
    host: true,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8100",
        changeOrigin: true,
      },
    },
  },
  preview: { port: 5181, strictPort: true },
});
