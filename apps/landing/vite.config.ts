import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// apps/shared holds code used by every portal. It sits outside this app, so the packages it imports
// are looked up in this app's node_modules.
const sharedDeps = ["react", "react-dom", "lucide-react"].map((dep) => ({
  find: new RegExp(`^${dep}(?=$|/)`),
  replacement: fileURLToPath(new URL(`./node_modules/${dep}`, import.meta.url)),
}));


export default defineConfig({
  plugins: [react()],
  resolve: { alias: sharedDeps },
  server: {
    port: 5176,
    host: true,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
